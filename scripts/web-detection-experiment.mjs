#!/usr/bin/env node

/**
 * Split web detection detectors across the cohorts of a content scope experiment.
 *
 * Usage:
 *   node scripts/web-detection-experiment.mjs create --mode enable --cohorts 10 --cohort-percent 5
 *   node scripts/web-detection-experiment.mjs remove --experiment contentScopeExperiment10
 *
 * `create` adds an experiment slot to each platform override and appends one conditional change per
 * cohort slice to features/web-detection.json. Run with --help for the options.
 */

import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import { applyConditionalChanges, maxVersion, sameVersionFamily } from './config-conditions.mjs';
import { Workspace, editJsonc, overrideFile } from './config-files.mjs';
import {
    ANDROID_SLOTS,
    EXPERIMENTS_FEATURE,
    addSubfeature,
    isShallowClone,
    pickSlot,
    removeExperiment,
    slotsInUse,
    usedInHistory,
} from './experiment.mjs';

/**
 * @typedef {import('./config-conditions.mjs').Platform} Platform
 * @typedef {import('./config-conditions.mjs').Version} Version
 * @typedef {import('./config-conditions.mjs').ConditionalChange} ConditionalChange
 * @typedef {import('./config-conditions.mjs').PatchSettings} PatchSettings
 * @typedef {import('./config-conditions.mjs').Client} Client
 * @typedef {import('./experiment.mjs').Cohort} Cohort
 * @typedef {'enable' | 'disable' | 'trial'} Mode
 * @typedef {'detector' | 'group'} Unit
 *
 * @typedef {object} DetectorConfig
 * @property {string} [state]
 * @property {{ auto?: { state?: string, when?: unknown } }} [triggers]
 * @property {{ fireEvent?: unknown }} [actions]
 *
 * @typedef {Record<string, Record<string, DetectorConfig>>} Detectors
 * @typedef {{ detectors: Detectors, conditionalChanges?: ConditionalChange[] }} WebDetectionSettings
 *
 * @typedef {number | 'sqrt' | 'remainder'} ControlSize
 * @typedef {{ rollout?: number, control?: ControlSize, cohortPercent?: number }} SizingInput
 * @typedef {{ rollout: number, control: number, cohort: number }} Sizing
 *
 * @typedef {object} PlatformPlan
 * @property {Platform} platform
 * @property {Version | undefined} clientVersion - the version the production state is evaluated at
 * @property {Version | undefined} minSupportedVersion - the experiment slot's minimum version
 * @property {Set<string>} production - ids of the detectors that auto-run in production
 *
 * @typedef {object} CreateOptions
 * @property {Mode} mode
 * @property {number} cohorts
 * @property {number | undefined} cohortPercent
 * @property {ControlSize | undefined} control
 * @property {Unit} by
 * @property {string} seed
 * @property {string} experiment - slot name, or `auto`
 * @property {Platform[]} platforms
 * @property {Partial<Record<Platform, Version>>} clientVersions
 * @property {number | undefined} rollout
 * @property {boolean} dryRun
 */

const WEB_DETECTION_FILE = 'features/web-detection.json';

/**
 * The C-S-S bundles that run web detection on each platform.
 *
 * @type {Record<Platform, { injectNames: string[], passesVersion: boolean, minExperimentVersion?: Version }>}
 */
export const PLATFORMS = {
    android: {
        injectNames: [
            'android',
            'android-adsjs',
        ],
        passesVersion: true,
    },
    ios: {
        injectNames: [
            'apple-isolated',
        ],
        passesVersion: true,
    },
    macos: {
        injectNames: [
            'apple-isolated',
        ],
        passesVersion: true,
    },
    // Windows reads content scope experiments from 0.178.0.
    windows: {
        injectNames: [
            'windows',
        ],
        passesVersion: true,
        minExperimentVersion: '0.178.0',
    },
    // The extension passes no version to C-S-S, so version conditions never match there.
    extension: {
        injectNames: [
            'chrome-mv3',
            'firefox',
        ],
        passesVersion: false,
    },
};

const DEFAULT_PLATFORMS = /** @type {Platform[]} */ ([
    'android',
    'ios',
    'macos',
    'windows',
]);

/**
 * @param {number} index - zero-based treatment index
 */
export function cohortName(index) {
    return `treatment${String(index + 1).padStart(2, '0')}`;
}

/**
 * The detectors after the conditional changes that match the client.
 *
 * @param {WebDetectionSettings} settings
 * @param {Client} client
 * @returns {Detectors}
 */
export function effectiveDetectors(settings, client) {
    return applyConditionalChanges(settings, client).settings.detectors;
}

/**
 * @param {DetectorConfig} config
 */
export function isAutoRunning(config) {
    return (config.state ?? 'enabled') === 'enabled' && config.triggers?.auto?.state === 'enabled';
}

/**
 * @param {Detectors} detectors
 * @param {(config: DetectorConfig) => boolean} predicate
 * @returns {string[]} `group/detector` ids
 */
export function detectorIds(detectors, predicate = () => true) {
    return Object.entries(detectors).flatMap(
        ([
            group,
            members,
        ]) =>
            Object.entries(members)
                .filter(
                    ([
                        ,
                        config,
                    ]) => predicate(config),
                )
                .map(
                    ([
                        id,
                    ]) => `${group}/${id}`,
                ),
    );
}

/**
 * @param {Platform} platform
 * @param {Version | undefined} version
 * @param {Record<string, string>} [cohorts]
 * @returns {Client[]}
 */
export function clientsFor(platform, version, cohorts = {}) {
    return PLATFORMS[platform].injectNames.map((injectName) => ({ injectName, version, cohorts }));
}

/**
 * The ids of the detectors that auto-run on any of the clients.
 *
 * @param {WebDetectionSettings} settings
 * @param {Client[]} clients
 */
export function autoRunning(settings, clients) {
    return new Set(clients.flatMap((client) => detectorIds(effectiveDetectors(settings, client), isAutoRunning)));
}

/**
 * The highest version that gates web detection settings on the platform, so a client at this version
 * sees every shipped conditional change. Gates outside the platform's version family are skipped.
 *
 * @param {Platform} platform
 * @param {WebDetectionSettings} settings
 * @param {Version} floor - the platform's webDetection minSupportedVersion
 * @returns {Version}
 */
export function latestGate(platform, settings, floor) {
    const { injectNames, minExperimentVersion } = PLATFORMS[platform];
    let latest = minExperimentVersion === undefined ? floor : maxVersion(floor, minExperimentVersion);
    for (const change of settings.conditionalChanges ?? []) {
        const blocks = Array.isArray(change.condition)
            ? change.condition
            : [
                  change.condition,
              ];
        for (const { injectName, minSupportedVersion } of blocks) {
            if (injectName === undefined || !injectNames.includes(injectName) || minSupportedVersion === undefined) continue;
            if (!sameVersionFamily(minSupportedVersion, floor)) continue;
            latest = maxVersion(latest, minSupportedVersion);
        }
    }
    return latest;
}

/**
 * A deterministic PRNG: FNV-1a hash of the seed into mulberry32.
 *
 * @param {string} seed
 * @returns {() => number} values in [0, 1)
 */
export function seededRandom(seed) {
    let state = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
        state = Math.imul(state ^ seed.charCodeAt(i), 0x01000193) >>> 0;
    }
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Shuffle the units with the seed and deal them round-robin, so slice sizes differ by at most one unit.
 *
 * @param {string[][]} units - each unit is a list of detector ids
 * @param {number} count
 * @param {string} seed
 * @returns {string[][]} detector ids per slice, sorted
 */
export function dealSlices(units, count, seed) {
    if (units.length < count) {
        throw new Error(`${units.length} units to split across ${count} cohorts`);
    }
    const random = seededRandom(seed);
    const shuffled = [
        ...units,
    ];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [
            shuffled[i],
            shuffled[j],
        ] = [
            shuffled[j],
            shuffled[i],
        ];
    }
    /** @type {string[][]} */
    const slices = Array.from({ length: count }, () => []);
    shuffled.forEach((unit, i) => slices[i % count].push(...unit));
    return slices.map((slice) => slice.sort());
}

/**
 * @param {string[]} ids - sorted detector ids
 * @param {Unit} by
 * @returns {string[][]}
 */
export function buildUnits(ids, by) {
    if (by === 'detector')
        return ids.map((id) => [
            id,
        ]);
    /** @type {Map<string, string[]>} */
    const groups = new Map();
    for (const id of ids) {
        const group = id.split('/')[0];
        groups.set(group, [
            ...(groups.get(group) ?? []),
            id,
        ]);
    }
    return [
        ...groups.values(),
    ];
}

/**
 * One conditional change per slice. `enable` disables slice k for every cohort except cohort k, `disable`
 * disables slice k for cohort k, and `trial` turns on slice k's auto trigger for cohort k.
 *
 * @param {Mode} mode
 * @param {string} experimentName
 * @param {string[][]} slices
 * @returns {ConditionalChange[]}
 */
export function buildConditionalChanges(mode, experimentName, slices) {
    const treatments = slices.map((_, i) => cohortName(i));
    return slices.map((slice, k) => {
        const cohorts =
            mode === 'enable'
                ? [
                      'control',
                      ...treatments.filter((_, i) => i !== k),
                  ]
                : [
                      treatments[k],
                  ];
        const blocks = cohorts.map((cohort) => ({ experiment: { experimentName, cohort } }));
        /** @type {PatchSettings} */
        const patchSettings = slice.flatMap((id) =>
            mode === 'trial'
                ? [
                      { op: /** @type {const} */ ('add'), path: `/detectors/${id}/state`, value: 'enabled' },
                      { op: /** @type {const} */ ('add'), path: `/detectors/${id}/triggers/auto/state`, value: 'enabled' },
                  ]
                : [
                      { op: /** @type {const} */ ('add'), path: `/detectors/${id}/state`, value: 'disabled' },
                  ],
        );
        return { condition: blocks.length === 1 ? blocks[0] : blocks, patchSettings };
    });
}

/**
 * Resolve the rollout R, control C and treatment cohort t, as shares of all users, where R = C + N·t.
 * At most two are given; a `sqrt` control (the default) is √N·t and a `remainder` control is R − N·t.
 * Shares are whole hundredths of a percent with the rounding going to control, and a derived rollout
 * is rounded up to a whole percent.
 *
 * @param {number} count - N, the number of treatment cohorts
 * @param {SizingInput} input - percents
 * @returns {Sizing} hundredths of a percent
 */
export function resolveSizing(count, { rollout, control, cohortPercent }) {
    /** @param {number} percent */
    const toHundredths = (percent) => Math.round(percent * 100);
    const fixedControl = typeof control === 'number' ? toHundredths(control) : undefined;
    if (rollout !== undefined && cohortPercent !== undefined && control !== undefined && control !== 'remainder') {
        throw new Error('Give at most two of --rollout, --control-percent and --cohort-percent');
    }
    let total;
    let cohort;
    if (cohortPercent === undefined) {
        if (control === 'remainder') throw new Error('--control-percent remainder needs --cohort-percent');
        total = toHundredths(rollout ?? 100);
        cohort = Math.floor(fixedControl === undefined ? total / (count + Math.sqrt(count)) : (total - fixedControl) / count);
    } else {
        cohort = toHundredths(cohortPercent);
        if (rollout !== undefined || control === 'remainder') {
            total = toHundredths(rollout ?? 100);
        } else {
            const minimumControl = fixedControl ?? cohort * Math.sqrt(count);
            total = Math.ceil((count * cohort + minimumControl) / 100) * 100;
        }
    }
    const sizing = { rollout: total, control: total - count * cohort, cohort };
    const summary = `rollout ${formatShare(sizing.rollout)}, control ${formatShare(sizing.control)}, ${count} × ${formatShare(cohort)}`;
    if (total <= 0 || total > 10000) throw new Error(`Rollout must be above 0% and at most 100%: ${summary}`);
    if (cohort <= 0 || sizing.control <= 0) throw new Error(`Control and every cohort need a share of users: ${summary}`);
    return sizing;
}

/**
 * @param {number} hundredths - a share of users in hundredths of a percent
 */
export function formatShare(hundredths) {
    return `${hundredths / 100}%`;
}

/**
 * Weights in hundredths of a percent of all users, so they sum to the rollout.
 *
 * @param {number} count
 * @param {Sizing} sizing
 * @returns {Cohort[]}
 */
export function buildCohorts(count, sizing) {
    return [
        { name: 'control', weight: sizing.control },
        ...Array.from({ length: count }, (_, i) => ({ name: cohortName(i), weight: sizing.cohort })),
    ];
}

/**
 * The detectors each cohort should auto-run on a platform.
 *
 * @param {Mode} mode
 * @param {Set<string>} production
 * @param {string[] | undefined} slice - undefined for control
 * @returns {Set<string>}
 */
export function expectedRunning(mode, production, slice) {
    if (slice === undefined) return mode === 'enable' ? new Set() : new Set(production);
    if (mode === 'enable') return new Set(slice.filter((id) => production.has(id)));
    if (mode === 'disable')
        return new Set(
            [
                ...production,
            ].filter((id) => !slice.includes(id)),
        );
    return new Set([
        ...production,
        ...slice,
    ]);
}

/**
 * Evaluate the new settings for every cohort on every platform and compare against the mode.
 *
 * @param {Mode} mode
 * @param {string} experimentName
 * @param {WebDetectionSettings} settings - including the new conditional changes
 * @param {PlatformPlan[]} plans
 * @param {string[][]} slices
 * @returns {{ cohort: string, slice: string[] | undefined, running: Map<Platform, number> }[]}
 */
export function verifyCohorts(mode, experimentName, settings, plans, slices) {
    /** @type {(string[] | undefined)[]} */
    const cohortSlices = [
        undefined,
        ...slices,
    ];
    return cohortSlices.map((slice, i) => {
        const cohort = i === 0 ? 'control' : cohortName(i - 1);
        /** @type {Map<Platform, number>} */
        const running = new Map();
        for (const plan of plans) {
            const actual = autoRunning(settings, clientsFor(plan.platform, plan.clientVersion, { [experimentName]: cohort }));
            const expected = expectedRunning(mode, plan.production, slice);
            const missing = [
                ...expected,
            ].filter((id) => !actual.has(id));
            const extra = [
                ...actual,
            ].filter((id) => !expected.has(id));
            if (missing.length || extra.length) {
                throw new Error(
                    `${plan.platform} ${cohort}: expected detectors not running: [${missing.join(', ')}]; unexpected: [${extra.join(', ')}]`,
                );
            }
            running.set(plan.platform, actual.size);
        }
        return { cohort, slice, running };
    });
}

/**
 * @param {string} text - web-detection.json
 * @param {ConditionalChange[]} changes
 */
export function appendConditionalChanges(text, changes) {
    return changes.reduce(
        (current, change) =>
            editJsonc(
                current,
                [
                    'settings',
                    'conditionalChanges',
                    -1,
                ],
                change,
                { isArrayInsertion: true },
            ),
        text,
    );
}

/**
 * @param {Version | undefined} version
 */
function formatVersion(version) {
    return version === undefined ? 'none' : String(version);
}

/**
 * @param {CreateOptions} options
 */
export async function create(options) {
    const { mode, by, seed, platforms } = options;
    const sizing = resolveSizing(options.cohorts, options);
    const cohorts = buildCohorts(options.cohorts, sizing);
    const warnings = [];
    if (sizing.rollout < 10000 && mode === 'enable') {
        warnings.push(`The ${formatShare(10000 - sizing.rollout)} of users outside the rollout run every production detector`);
    }
    if (sizing.control < sizing.cohort) {
        warnings.push(`Control (${formatShare(sizing.control)}) is smaller than a treatment cohort (${formatShare(sizing.cohort)})`);
    }

    const ws = Workspace.fromRepository();
    const settings = /** @type {WebDetectionSettings} */ (ws.parse(WEB_DETECTION_FILE).settings);

    /** @type {PlatformPlan[]} */
    const plans = platforms.map((platform) => {
        /** @type {{ state: string, minSupportedVersion?: Version } | undefined} */
        const webDetection = ws.parse(overrideFile(platform)).features.webDetection;
        if (webDetection === undefined || webDetection.state !== 'enabled') {
            warnings.push(`webDetection is not enabled in ${overrideFile(platform)}; no cohort runs detectors there until it is`);
        }
        const floor = webDetection?.minSupportedVersion;
        const { passesVersion, minExperimentVersion } = PLATFORMS[platform];
        const gate = floor === undefined ? undefined : latestGate(platform, settings, floor);
        const clientVersion = passesVersion ? (options.clientVersions[platform] ?? gate) : undefined;
        const experimentFloor = floor !== undefined && minExperimentVersion !== undefined ? maxVersion(floor, minExperimentVersion) : floor;
        const minSupportedVersion = mode === 'trial' ? (gate ?? experimentFloor) : experimentFloor;
        return { platform, clientVersion, minSupportedVersion, production: autoRunning(settings, clientsFor(platform, clientVersion)) };
    });

    const allIds = detectorIds(settings.detectors).sort();
    let candidates;
    if (mode === 'trial') {
        candidates = allIds.filter((id) => plans.some((plan) => !plan.production.has(id)));
        const unsupported = candidates.filter((id) =>
            plans.some((plan) =>
                clientsFor(plan.platform, plan.clientVersion).some((client) => {
                    const [
                        group,
                        name,
                    ] = id.split('/');
                    const config = effectiveDetectors(settings, client)[group][name];
                    return config.triggers?.auto?.when === undefined || config.actions?.fireEvent === undefined;
                }),
            ),
        );
        if (unsupported.length) {
            warnings.push(`Skipped detectors without an auto trigger interval or fireEvent action: ${unsupported.join(', ')}`);
        }
        candidates = candidates.filter((id) => !unsupported.includes(id));
    } else {
        candidates = allIds.filter((id) => plans.some((plan) => plan.production.has(id)));
    }

    const units = buildUnits(candidates, by);
    if (units.length < options.cohorts) {
        throw new Error(
            [
                `${units.length} ${by}s to split across ${options.cohorts} cohorts`,
                ...warnings,
            ].join('\n'),
        );
    }
    const slices = dealSlices(units, options.cohorts, seed);

    const inUse = slotsInUse(ws);
    let experimentName = options.experiment;
    if (experimentName === 'auto') {
        experimentName = pickSlot(inUse, usedInHistory);
        if (isShallowClone()) {
            warnings.push(`This clone is shallow, so ${experimentName} may have been used before; run git fetch --unshallow and retry`);
        }
    } else {
        if (platforms.includes('android') && !ANDROID_SLOTS.includes(experimentName)) {
            throw new Error(`Android ignores ${experimentName}; use one of its declared slots, such as ${ANDROID_SLOTS[10]}`);
        }
        if (inUse.has(experimentName)) throw new Error(`${experimentName} is in use in an override`);
    }

    const changes = buildConditionalChanges(mode, experimentName, slices);
    ws.write(WEB_DETECTION_FILE, appendConditionalChanges(ws.read(WEB_DETECTION_FILE), changes));
    const results = verifyCohorts(mode, experimentName, ws.parse(WEB_DETECTION_FILE).settings, plans, slices);

    const description =
        `Web detection ${mode} split by ${by}, seed ${seed}: control ${formatShare(sizing.control)}, ` +
        `${options.cohorts} × ${formatShare(sizing.cohort)}, rollout ${formatShare(sizing.rollout)}`;
    for (const plan of plans) {
        addSubfeature(ws, EXPERIMENTS_FEATURE, plan.platform, experimentName, {
            state: 'enabled',
            description,
            ...(plan.minSupportedVersion !== undefined && { minSupportedVersion: plan.minSupportedVersion }),
            ...(sizing.rollout < 10000 && {
                rollout: {
                    steps: [
                        { percent: sizing.rollout / 100 },
                    ],
                },
            }),
            cohorts,
        });
    }
    if (!options.dryRun) await ws.flush();

    const lines = [
        `${options.dryRun ? 'Dry run: ' : ''}${experimentName}: ${description}`,
        '',
        '| Platform | Evaluated at | Slot minSupportedVersion | Detectors auto-running in production |',
        '|---|---|---|---|',
        ...plans.map(
            (plan) =>
                `| ${plan.platform} | ${formatVersion(plan.clientVersion)} | ${formatVersion(plan.minSupportedVersion)} | ${plan.production.size} |`,
        ),
        '',
        `| Cohort | Users | ${mode === 'enable' ? 'Runs only' : mode === 'disable' ? 'Stops' : 'Adds'} | Auto-running (${platforms.join(' / ')}) |`,
        '|---|---|---|---|',
        ...results.map(({ cohort, slice, running }) => {
            const weight = cohort === 'control' ? sizing.control : sizing.cohort;
            const sliceText = slice === undefined ? (mode === 'enable' ? 'nothing' : 'production') : slice.join(', ');
            return `| ${cohort} | ${formatShare(weight)} | ${sliceText} | ${[
                ...running.values(),
            ].join(' / ')} |`;
        }),
        ...(sizing.rollout < 10000
            ? [
                  `| not enrolled | ${formatShare(10000 - sizing.rollout)} | production | |`,
              ]
            : []),
    ];
    return { experimentName, report: lines.join('\n'), warnings };
}

/**
 * Remove the experiment slot and its conditional changes.
 *
 * @param {string} experimentName
 */
export async function remove(experimentName) {
    const ws = Workspace.fromRepository();
    const lines = removeExperiment(ws, EXPERIMENTS_FEATURE, experimentName);
    await ws.flush();
    return lines.join('\n');
}

const HELP = `Usage:
  web-detection-experiment.mjs create --mode <mode> --cohorts <n> [options]
  web-detection-experiment.mjs remove --experiment <slot>

create:
  --mode enable|disable|trial
      enable   each cohort auto-runs only its slice of the production detectors; control runs none
      disable  each cohort stops its slice of the production detectors; control runs production
      trial    each cohort adds its slice of the detectors not running in production; control runs production
  --cohorts <n>            treatment cohorts, named treatment01, treatment02, ...
  --rollout <p>            percent of users enrolled (default: 100, or derived)
  --control-percent <p>|sqrt|remainder
                           percent of users in control; sqrt is √n × a treatment cohort, remainder is
                           what the rollout leaves after the treatment cohorts (default: sqrt, or derived)
  --cohort-percent <p>     percent of users in each treatment cohort (default: derived)
                           Give at most two of these three; the third follows from
                           rollout = control + n × cohort. A derived rollout is rounded up to a whole percent.
  --by detector|group      split single detectors or whole groups (default: detector)
  --seed <string>          seed for the split (default: random, printed in the slot description)
  --experiment <slot>|auto contentScopeExperiments slot (default: auto, the first unused Android slot)
  --platforms <list>       comma-separated from ${Object.keys(PLATFORMS).join(', ')} (default: ${DEFAULT_PLATFORMS.join(',')})
  --client-version <list>  platform=version pairs to evaluate production at
                           (default: the platform's highest web detection version gate)
  --dry-run                print the report without writing files

remove:
  --experiment <slot>      remove the slot from every override and its conditional changes
`;

/**
 * @param {string | undefined} value
 * @param {string} flag
 */
function parsePositiveInteger(value, flag) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) throw new Error(`${flag} needs a positive whole number`);
    return number;
}

/**
 * @param {string | undefined} value
 * @param {string} flag
 * @returns {number | undefined}
 */
function parsePercent(value, flag) {
    if (value === undefined) return undefined;
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0 || number > 100) throw new Error(`${flag} needs a percent above 0 and at most 100`);
    return number;
}

/**
 * @param {string | undefined} value
 * @returns {ControlSize | undefined}
 */
function parseControl(value) {
    if (value === 'sqrt' || value === 'remainder') return value;
    return parsePercent(value, '--control-percent');
}

/**
 * @param {string} value
 * @returns {Partial<Record<Platform, Version>>}
 */
function parseClientVersions(value) {
    /** @type {Partial<Record<Platform, Version>>} */
    const versions = {};
    for (const pair of value.split(',').filter(Boolean)) {
        const [
            platform,
            version,
        ] = pair.split('=');
        if (!(platform in PLATFORMS) || !version) throw new Error(`Invalid --client-version entry: ${pair}`);
        versions[/** @type {Platform} */ (platform)] = /^\d+$/.test(version) ? Number(version) : version;
    }
    return versions;
}

async function main() {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            mode: { type: 'string' },
            cohorts: { type: 'string' },
            'cohort-percent': { type: 'string' },
            'control-percent': { type: 'string' },
            by: { type: 'string', default: 'detector' },
            seed: { type: 'string' },
            experiment: { type: 'string', default: 'auto' },
            platforms: { type: 'string', default: DEFAULT_PLATFORMS.join(',') },
            'client-version': { type: 'string', default: '' },
            rollout: { type: 'string' },
            'dry-run': { type: 'boolean', default: false },
            help: { type: 'boolean', default: false },
        },
    });
    const [
        command,
    ] = positionals;
    if (values.help || (command !== 'create' && command !== 'remove')) {
        console.log(HELP);
        process.exit(values.help ? 0 : 1);
    }

    if (command === 'remove') {
        if (values.experiment === 'auto') throw new Error('remove needs --experiment <slot>');
        console.log(await remove(values.experiment));
        return;
    }

    const mode = values.mode;
    if (mode !== 'enable' && mode !== 'disable' && mode !== 'trial') throw new Error('--mode must be enable, disable or trial');
    const by = values.by;
    if (by !== 'detector' && by !== 'group') throw new Error('--by must be detector or group');
    const platforms = values.platforms.split(',').filter(Boolean);
    for (const platform of platforms) {
        if (!(platform in PLATFORMS)) throw new Error(`Unknown platform: ${platform}`);
    }

    const { experimentName, report, warnings } = await create({
        mode,
        by,
        cohorts: parsePositiveInteger(values.cohorts, '--cohorts'),
        cohortPercent: parsePercent(values['cohort-percent'], '--cohort-percent'),
        control: parseControl(values['control-percent']),
        seed: values.seed ?? randomBytes(4).toString('hex'),
        experiment: values.experiment,
        platforms: /** @type {Platform[]} */ (platforms),
        clientVersions: parseClientVersions(values['client-version']),
        rollout: parsePercent(values.rollout, '--rollout'),
        dryRun: values['dry-run'],
    });
    console.log(report);
    for (const warning of warnings) console.warn(`Warning: ${warning}`);
    if (!values['dry-run']) console.log(`\nRemove with: node scripts/web-detection-experiment.mjs remove --experiment ${experimentName}`);
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}
