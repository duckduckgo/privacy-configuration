#!/usr/bin/env node

/**
 * Checks a config change against the base ref for changes clients already acting on the base config
 * would mishandle.
 *
 * Errors (exit 1):
 * - a rollout step edited or removed: clients persist each step they have processed;
 * - on a live experiment (enabled, with cohorts, on the base ref): cohorts changed, a metric added, or a
 *   metric changed other than renaming its event along with the detectors that fire it;
 * - a new experiment reusing a name the platform's config used before: clients keep their old cohort.
 *
 * Warnings: a changed detector that fires the event of a live experiment's metric.
 *
 * Usage: node scripts/check-config-changes.mjs [base-ref]   (default: origin/main)
 *
 * In a shallow clone, the first new experiment fetches the full history of base-ref when it is a remote-tracking
 * branch.
 */

import { execSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { isDeepStrictEqual } from 'util';
import { PLATFORMS, conditionBlocks } from './config-conditions.mjs';
import {
    ROOT,
    buildConfigs,
    copyWorkingTree,
    fetchFullHistory,
    git,
    isShallowClone,
    listFeatureFiles,
    overrideFile,
    usedInHistory,
} from './config-files.mjs';
import { parseJsonc } from './set-jsonc-path.mjs';

/**
 * @typedef {{ event: string, conversions?: unknown }} Metric
 * @typedef {{ state?: string, cohorts?: unknown[], settings?: { metrics?: Record<string, Metric> } }} Experiment
 * @typedef {{ op: string, path: string, value?: unknown }} PatchOperation
 * @typedef {{ condition: object | object[], patchSettings: PatchOperation[] }} ConditionalChange
 * @typedef {{ detectors?: Record<string, Record<string, unknown>>, conditionalChanges?: ConditionalChange[] }} WebDetectionSettings
 * @typedef {{ state?: string, settings?: unknown, features?: Record<string, Experiment> }} Feature
 * @typedef {{ features?: Record<string, Feature> }} Config
 * @typedef {{ platform: string, message: string }} Finding
 */

/** The features whose subfeatures are experiments. TDS experiments are under `blockList` on Android. */
export const EXPERIMENT_PARENTS = [
    'contentScopeExperiments',
    'contentBlocking',
    'blockList',
];

const CONFIG_DIRS = [
    'features',
    'overrides',
];

/**
 * Every `rollout.steps` array in a config tree, keyed by the JSON path of its `rollout`.
 *
 * @param {unknown} node
 * @param {string} [path]
 * @param {Map<string, unknown[]>} [found]
 * @returns {Map<string, unknown[]>}
 */
export function findRolloutSteps(node, path = '', found = new Map()) {
    if (typeof node !== 'object' || node === null) return found;
    for (const [
        key,
        child,
    ] of Object.entries(node)) {
        const childPath = `${path}/${key}`;
        if (
            key === 'rollout' &&
            typeof child === 'object' &&
            child !== null &&
            Array.isArray(/** @type {{ steps?: unknown }} */ (child).steps)
        ) {
            found.set(childPath, /** @type {{ steps: unknown[] }} */ (child).steps);
        }
        findRolloutSteps(child, childPath, found);
    }
    return found;
}

/**
 * The steps of `base` that `head` edited or removed. A rollout present on only one side passes.
 *
 * @param {unknown} base - config tree on the base ref
 * @param {unknown} head - the same file's config tree now
 * @returns {string[]} one message per rollout, naming its path
 */
export function changedRolloutSteps(base, head) {
    const headSteps = findRolloutSteps(head);
    const failures = [];
    for (const [
        path,
        steps,
    ] of findRolloutSteps(base)) {
        const now = headSteps.get(path);
        if (now === undefined) continue;
        const index = steps.findIndex((step, i) => !isDeepStrictEqual(step, now[i]));
        if (index === -1) continue;
        const was = JSON.stringify(steps[index]);
        failures.push(
            index < now.length
                ? `${path}: step ${index + 1} changed from ${was} to ${JSON.stringify(now[index])}`
                : `${path}: step ${index + 1} (${was}) removed`,
        );
    }
    return failures;
}

/**
 * Every experiment subfeature in a built config.
 *
 * @param {Config} config
 * @returns {Map<string, Experiment>} keyed by `parent.slot`
 */
export function experiments(config) {
    /** @type {Map<string, Experiment>} */
    const found = new Map();
    for (const parent of EXPERIMENT_PARENTS) {
        for (const [
            slot,
            experiment,
        ] of Object.entries(config.features?.[parent]?.features ?? {})) {
            found.set(`${parent}.${slot}`, experiment);
        }
    }
    return found;
}

/**
 * @param {Experiment | undefined} experiment
 */
export function isLive(experiment) {
    return experiment?.state === 'enabled' && Array.isArray(experiment.cohorts) && experiment.cohorts.length > 0;
}

/**
 * The event types each web detection detector can fire, from its entry and from conditional changes that
 * patch it.
 *
 * @param {Config} config
 * @returns {Map<string, Set<string>>} keyed by `group/name`
 */
export function detectorEvents(config) {
    const settings = /** @type {WebDetectionSettings | undefined} */ (config.features?.webDetection?.settings);
    /** @type {Map<string, Set<string>>} */
    const events = new Map();
    /**
     * @param {string} id
     * @param {unknown} node
     */
    const collect = (id, node) => {
        if (typeof node !== 'object' || node === null) return;
        const type = /** @type {{ fireEvent?: { type?: unknown } }} */ (node).fireEvent?.type;
        if (typeof type === 'string') {
            const set = events.get(id) ?? new Set();
            set.add(type);
            events.set(id, set);
        }
        for (const child of Object.values(node)) collect(id, child);
    };
    for (const [
        group,
        detectors,
    ] of Object.entries(settings?.detectors ?? {})) {
        for (const [
            name,
            detector,
        ] of Object.entries(detectors)) {
            collect(`${group}/${name}`, detector);
        }
    }
    for (const change of settings?.conditionalChanges ?? []) {
        for (const operation of change.patchSettings ?? []) {
            for (const [
                id,
                value,
            ] of patchedDetectors(operation)) {
                collect(id, value);
            }
        }
    }
    return events;
}

/**
 * The detectors a patch operation writes, with the value each receives.
 *
 * @param {PatchOperation} operation
 * @returns {[string, unknown][]}
 */
function patchedDetectors(operation) {
    const parts = operation.path.split('/').slice(1);
    if (parts[0] !== 'detectors') return [];
    const value = operation.value;
    if (parts.length >= 3)
        return [
            [
                `${parts[1]}/${parts[2]}`,
                value,
            ],
        ];
    if (typeof value !== 'object' || value === null) return [];
    if (parts.length === 2) {
        return Object.entries(value).map(
            ([
                name,
                detector,
            ]) => [
                `${parts[1]}/${name}`,
                detector,
            ],
        );
    }
    return Object.entries(value).flatMap(
        ([
            group,
            detectors,
        ]) =>
            typeof detectors === 'object' && detectors !== null
                ? Object.entries(detectors).map(
                      ([
                          name,
                          detector,
                      ]) =>
                          /** @type {[string, unknown]} */ ([
                              `${group}/${name}`,
                              detector,
                          ]),
                  )
                : [],
    );
}

/**
 * The detectors that fire `event`.
 *
 * @param {Map<string, Set<string>>} events - from detectorEvents
 * @param {string} event
 */
function detectorsFiring(events, event) {
    return [
        ...events,
    ]
        .filter(
            ([
                ,
                types,
            ]) => types.has(event),
        )
        .map(
            ([
                id,
            ]) => id,
        )
        .sort();
}

/**
 * Cohort and metric changes to experiments that are live on the base config.
 *
 * @param {Config} base
 * @param {Config} head
 * @returns {string[]}
 */
export function experimentErrors(base, head) {
    const headExperiments = experiments(head);
    const baseEvents = detectorEvents(base);
    const headEvents = detectorEvents(head);
    const errors = [];
    for (const [
        id,
        before,
    ] of experiments(base)) {
        const after = headExperiments.get(id);
        if (!isLive(before) || after === undefined) continue;
        if (!isDeepStrictEqual(before.cohorts, after.cohorts)) {
            errors.push(`${id}: cohorts changed on an enabled experiment; start a new experiment instead`);
        }
        const beforeMetrics = before.settings?.metrics ?? {};
        for (const [
            name,
            metric,
        ] of Object.entries(after.settings?.metrics ?? {})) {
            const was = beforeMetrics[name];
            if (was === undefined) {
                errors.push(`${id}: metric ${name} added to an enabled experiment; start a new experiment instead`);
            } else if (!isDeepStrictEqual(was, metric) && !isEventRename(was, metric, baseEvents, headEvents)) {
                errors.push(
                    `${id}: metric ${name} changed on an enabled experiment; only renaming its event along with the detectors that fire it is allowed`,
                );
            }
        }
    }
    return errors;
}

/**
 * Whether `after` only renames the event of `before`, fired by the same detectors.
 *
 * @param {Metric} before
 * @param {Metric} after
 * @param {Map<string, Set<string>>} baseEvents
 * @param {Map<string, Set<string>>} headEvents
 */
function isEventRename(before, after, baseEvents, headEvents) {
    if (!isDeepStrictEqual({ ...before, event: after.event }, after)) return false;
    const firing = detectorsFiring(baseEvents, before.event);
    return firing.length > 0 && isDeepStrictEqual(firing, detectorsFiring(headEvents, after.event));
}

/**
 * Conditional changes that patch each detector, leaving out those scoped only to experiment cohorts.
 *
 * @param {WebDetectionSettings | undefined} settings
 * @returns {Map<string, ConditionalChange[]>} keyed by `group/name`
 */
function detectorPatches(settings) {
    /** @type {Map<string, ConditionalChange[]>} */
    const patches = new Map();
    for (const change of settings?.conditionalChanges ?? []) {
        const blocks = conditionBlocks(change);
        if (blocks.length > 0 && blocks.every((block) => 'experiment' in block)) continue;
        for (const operation of change.patchSettings ?? []) {
            for (const [
                id,
            ] of patchedDetectors(operation)) {
                const list = patches.get(id) ?? [];
                if (!list.includes(change)) list.push(change);
                patches.set(id, list);
            }
        }
    }
    return patches;
}

/**
 * `node` with every `fireEvent.type` equal to `event` replaced by a placeholder, so renaming a metric's
 * event compares equal.
 *
 * @param {unknown} node
 * @param {string} event
 * @returns {unknown}
 */
function withoutEvent(node, event) {
    if (Array.isArray(node)) return node.map((child) => withoutEvent(child, event));
    if (typeof node !== 'object' || node === null) return node;
    return Object.fromEntries(
        Object.entries(node).map(
            ([
                key,
                child,
            ]) => [
                key,
                key === 'type' && child === event ? '<metric event>' : withoutEvent(child, event),
            ],
        ),
    );
}

/**
 * Changed detectors that fire the event of a metric that a live experiment counted on both configs. Renaming the
 * event along with the metric is not a change.
 *
 * @param {Config} base
 * @param {Config} head
 * @returns {string[]}
 */
export function detectorWarnings(base, head) {
    const baseSettings = /** @type {WebDetectionSettings | undefined} */ (base.features?.webDetection?.settings);
    const headSettings = /** @type {WebDetectionSettings | undefined} */ (head.features?.webDetection?.settings);
    const basePatches = detectorPatches(baseSettings);
    const headPatches = detectorPatches(headSettings);
    const events = detectorEvents(head);
    const baseEvents = detectorEvents(base);
    const headExperiments = experiments(head);
    const warnings = [];
    for (const [
        id,
        experiment,
    ] of experiments(base)) {
        if (!isLive(experiment) || !isLive(headExperiments.get(id))) continue;
        for (const [
            name,
            metric,
        ] of Object.entries(headExperiments.get(id)?.settings?.metrics ?? {})) {
            const baseMetric = experiment.settings?.metrics?.[name];
            if (baseMetric === undefined) continue;
            const baseEvent = baseMetric.event;
            for (const detector of new Set([
                ...detectorsFiring(events, metric.event),
                ...detectorsFiring(baseEvents, baseEvent),
            ])) {
                const [
                    group,
                    detectorName,
                ] = detector.split('/');
                /**
                 * @param {WebDetectionSettings | undefined} settings
                 * @param {Map<string, ConditionalChange[]>} patches
                 * @param {string} event
                 */
                const state = (settings, patches, event) =>
                    withoutEvent(
                        {
                            detector: settings?.detectors?.[group]?.[detectorName],
                            patches: patches.get(detector) ?? [],
                        },
                        event,
                    );
                const changed = !isDeepStrictEqual(
                    state(baseSettings, basePatches, baseEvent),
                    state(headSettings, headPatches, metric.event),
                );
                if (changed) {
                    warnings.push(
                        `webDetection detector ${detector} changed and fires ${metric.event}, which metric ${name} of enabled experiment ${id} counts; both cohorts see the change, so confirm the experiment owner knows the date`,
                    );
                }
            }
        }
    }
    return warnings;
}

/**
 * Experiments on `head` that are not on `base` and whose name `usedBefore` reports. Subfeatures without
 * cohorts are not experiments.
 *
 * @param {Config} base
 * @param {Config} head
 * @param {(parent: string, slot: string) => boolean} usedBefore
 * @returns {string[]}
 */
export function reusedExperimentErrors(base, head, usedBefore) {
    const baseExperiments = experiments(base);
    const errors = [];
    for (const [
        id,
        experiment,
    ] of experiments(head)) {
        if (baseExperiments.has(id) || !experiment.cohorts?.length) continue;
        const [
            parent,
            slot,
        ] = id.split('.');
        if (usedBefore(parent, slot))
            errors.push(`${id}: the name was used before, and clients keep their old cohort; pick an unused name`);
    }
    return errors;
}

/**
 * Join findings with the same message, listing the platforms each applies to.
 *
 * @param {Finding[]} findings
 */
export function mergeFindings(findings) {
    /** @type {Map<string, string[]>} */
    const byMessage = new Map();
    for (const { platform, message } of findings) {
        const platforms = byMessage.get(message) ?? [];
        platforms.push(platform);
        byMessage.set(message, platforms);
    }
    return [
        ...byMessage,
    ].map(
        ([
            message,
            platforms,
        ]) => `${message} (${platforms.join(', ')})`,
    );
}

/**
 * @param {string} dir - relative to the repository root
 * @returns {string[]}
 */
function listJsonFiles(dir) {
    return readdirSync(resolve(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return listJsonFiles(path);
        return entry.name.endsWith('.json')
            ? [
                  path,
              ]
            : [];
    });
}

/**
 * @param {string} baseRef
 * @returns {string[]}
 */
export function checkRolloutSteps(baseRef) {
    const baseFiles = new Set(git('ls-tree', '-r', '--name-only', baseRef, '--', ...CONFIG_DIRS).split('\n'));
    const failures = [];
    for (const file of CONFIG_DIRS.flatMap(listJsonFiles)) {
        if (!baseFiles.has(file) || !existsSync(resolve(ROOT, file))) continue;
        const base = parseJsonc(git('show', `${baseRef}:${file}`), `${baseRef}:${file}`);
        const head = parseJsonc(readFileSync(resolve(ROOT, file), 'utf8'), file);
        failures.push(...changedRolloutSteps(base, head).map((failure) => `${file}: ${failure}`));
    }
    return failures;
}

/**
 * Build the config at `baseRef` and the working tree, each in a temporary directory. The base uses the working
 * tree's dependencies.
 *
 * @param {string} baseRef
 * @returns {Promise<{ base: Map<string, Config>, head: Map<string, Config> }>} built configs by platform
 */
async function buildBaseAndHead(baseRef) {
    const baseDir = mkdtempSync(join(tmpdir(), 'config-base-'));
    try {
        execSync(`git archive ${JSON.stringify(baseRef)} | tar -x -C ${JSON.stringify(baseDir)}`, { cwd: ROOT, stdio: 'pipe' });
    } catch (error) {
        rmSync(baseDir, { recursive: true, force: true });
        throw error;
    }
    const [
        base,
        head,
    ] = await Promise.all([
        buildConfigs(baseDir, PLATFORMS),
        buildConfigs(copyWorkingTree(), PLATFORMS),
    ]);
    return { base, head };
}

/**
 * @param {string} baseRef
 * @returns {Promise<{ errors: string[], warnings: string[] }>}
 */
export async function checkConfigChanges(baseRef) {
    const errors = checkRolloutSteps(baseRef);
    const { base, head } = await buildBaseAndHead(baseRef);
    const featureFiles = listFeatureFiles();
    /** @type {Finding[]} */
    const experimentFindings = [];
    /** @type {Finding[]} */
    const warningFindings = [];
    /** @type {boolean | undefined} whether the lookups below see the base ref's full history */
    let fullHistory;
    for (const platform of PLATFORMS) {
        const before = /** @type {Config} */ (base.get(platform));
        const after = /** @type {Config} */ (head.get(platform));
        /** @type {(parent: string, slot: string) => boolean} */
        const usedBefore = (parent, slot) => {
            // Once fetched, the clone stays shallow at the checked-out commit, so ask only once.
            fullHistory ??= !isShallowClone() || fetchFullHistory(baseRef);
            return usedInHistory(
                slot,
                [
                    overrideFile(platform),
                    featureFiles[parent] ?? 'features',
                ],
                baseRef,
            );
        };
        for (const message of [
            ...experimentErrors(before, after),
            ...reusedExperimentErrors(before, after, usedBefore),
        ]) {
            experimentFindings.push({ platform, message });
        }
        for (const message of detectorWarnings(before, after)) warningFindings.push({ platform, message });
    }
    const warnings = mergeFindings(warningFindings);
    if (fullHistory === false) warnings.push('This clone is shallow, so experiment names used before its history starts were not checked');
    return {
        errors: [
            ...errors,
            ...mergeFindings(experimentFindings),
        ],
        warnings,
    };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const baseRef = process.argv[2] ?? 'origin/main';
    const { errors, warnings } = await checkConfigChanges(baseRef);
    const annotate = process.env.GITHUB_ACTIONS === 'true';
    for (const warning of warnings) console.log(annotate ? `::warning title=Config change::${warning}` : `Warning: ${warning}`);
    for (const error of errors) console.error(annotate ? `::error title=Config change::${error}` : `Error: ${error}`);
    if (errors.length > 0) process.exit(1);
    console.log(`No disallowed config changes since ${baseRef}`);
}
