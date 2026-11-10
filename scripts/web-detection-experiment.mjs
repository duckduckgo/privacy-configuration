#!/usr/bin/env node

/**
 * Split web detection detectors across the cohorts of a content scope experiment.
 *
 * Usage:
 *   node scripts/web-detection-experiment.mjs create --mode enable --cohorts 10 --cohort-percent 5
 *
 * `create` adds an experiment slot to each platform override and appends one conditional change per
 * cohort slice to the webDetection settings each platform reads. Run with --help for the options. Raise,
 * stop, inspect and remove the experiment with experiment.mjs.
 */

import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import {
    EXPERIMENTS_MIN_VERSION,
    PLATFORMS,
    PLATFORM_INJECT_NAMES,
    applyConditionalChanges,
    conditionBlocks,
    maxVersion,
    sameVersionFamily,
} from './config-conditions.mjs';
import { Workspace, buildConfigs, copyWorkingTree, isShallowClone, overrideFile } from './config-files.mjs';
import {
    ANDROID_SLOTS,
    EXPERIMENTS_FEATURE,
    addSubfeature,
    appendChanges,
    fractionalRolloutWarnings,
    locateSettings,
    parsePercent,
    parseVersions,
    pickSlot,
    slotUsedBefore,
    slotsInUse,
    valueAt,
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
 * @typedef {number | 'sqrt'} ControlSize
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

/**
 * The C-S-S bundles that run web detection on each platform: on Apple, only the isolated one.
 *
 * @type {Record<Platform, string[]>}
 */
const INJECT_NAMES = {
    ...PLATFORM_INJECT_NAMES,
    ios: [
        'apple-isolated',
    ],
    macos: [
        'apple-isolated',
    ],
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
    return INJECT_NAMES[platform].map((injectName) => ({ injectName, version, cohorts }));
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
    const experimentsFloor = EXPERIMENTS_MIN_VERSION[platform];
    let latest = experimentsFloor === undefined ? floor : maxVersion(floor, experimentsFloor);
    for (const change of settings.conditionalChanges ?? []) {
        for (const { injectName, minSupportedVersion } of conditionBlocks(change)) {
            if (injectName === undefined || !INJECT_NAMES[platform].includes(injectName) || minSupportedVersion === undefined) continue;
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
 * At most two are given; a `sqrt` control (the default) is √N·t. Shares are whole hundredths of a percent
 * with the rounding going to control, and a derived rollout is rounded up to a whole percent.
 *
 * @param {number} count - N, the number of treatment cohorts
 * @param {SizingInput} input - percents
 * @returns {Sizing} hundredths of a percent
 */
export function resolveSizing(count, { rollout, control, cohortPercent }) {
    /** @param {number} percent */
    const toHundredths = (percent) => Math.round(percent * 100);
    const fixedControl = typeof control === 'number' ? toHundredths(control) : undefined;
    if (rollout !== undefined && cohortPercent !== undefined && control !== undefined) {
        throw new Error('Give at most two of --rollout, --control-percent and --cohort-percent');
    }
    let total;
    let cohort;
    if (cohortPercent === undefined) {
        total = toHundredths(rollout ?? 100);
        cohort = Math.floor(fixedControl === undefined ? total / (count + Math.sqrt(count)) : (total - fixedControl) / count);
    } else {
        cohort = toHundredths(cohortPercent);
        if (rollout !== undefined) {
            total = toHundredths(rollout);
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
 * @param {(platform: Platform) => WebDetectionSettings} settingsFor - including the new conditional changes
 * @param {PlatformPlan[]} plans
 * @param {string[][]} slices
 * @returns {{ cohort: string, slice: string[] | undefined, running: Map<Platform, number> }[]}
 */
export function verifyCohorts(mode, experimentName, settingsFor, plans, slices) {
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
            const actual = autoRunning(
                settingsFor(plan.platform),
                clientsFor(plan.platform, plan.clientVersion, { [experimentName]: cohort }),
            );
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
 * Run verifyCohorts on the built config: production from the repository as it is, the cohorts from the
 * repository with the pending edits.
 *
 * @param {Workspace} ws
 * @param {Mode} mode
 * @param {string} experimentName
 * @param {PlatformPlan[]} plans
 * @param {string[][]} slices
 */
export async function verifyBuiltCohorts(ws, mode, experimentName, plans, slices) {
    const platforms = plans.map((plan) => plan.platform);
    const [
        before,
        after,
    ] = await Promise.all([
        buildConfigs(copyWorkingTree(), platforms),
        buildConfigs(copyWorkingTree(ws.pending()), platforms),
    ]);
    /**
     * @param {Map<string, any>} configs
     * @param {Platform} platform
     * @returns {WebDetectionSettings}
     */
    const builtSettings = (configs, platform) => {
        const settings = configs.get(platform)?.features?.webDetection?.settings;
        if (settings === undefined) throw new Error(`The built ${platform} config has no webDetection settings`);
        return settings;
    };
    for (const plan of plans) {
        const production = autoRunning(builtSettings(before, plan.platform), clientsFor(plan.platform, plan.clientVersion));
        const differing = [
            ...production,
            ...plan.production,
        ].filter((id) => production.has(id) !== plan.production.has(id));
        if (differing.length > 0) {
            throw new Error(`${plan.platform}: the built config differs in which detectors run in production: ${differing.join(', ')}`);
        }
    }
    verifyCohorts(mode, experimentName, (platform) => builtSettings(after, platform), plans, slices);
}

/**
 * @param {Version | undefined} version
 */
function formatVersion(version) {
    return version === undefined ? 'none' : String(version);
}

/**
 * Add the experiment to the workspace, without writing it.
 *
 * @param {CreateOptions} options
 * @param {Workspace} [ws]
 */
export function create(options, ws = Workspace.fromRepository()) {
    const { mode, by, seed, platforms } = options;
    const sizing = resolveSizing(options.cohorts, options);
    const cohorts = buildCohorts(options.cohorts, sizing);
    const warnings = fractionalRolloutWarnings(sizing.rollout / 100, platforms);
    if (sizing.rollout < 10000 && mode === 'enable') {
        warnings.push(`The ${formatShare(10000 - sizing.rollout)} of users outside the rollout run every production detector`);
    }
    if (sizing.control < sizing.cohort) {
        warnings.push(`Control (${formatShare(sizing.control)}) is smaller than a treatment cohort (${formatShare(sizing.cohort)})`);
    }

    const locations = locateSettings(ws, 'webDetection', platforms);
    /**
     * @param {Platform} platform
     * @returns {WebDetectionSettings}
     */
    const settingsFor = (platform) => {
        const location = /** @type {import('./experiment.mjs').Location} */ (locations.find((l) => l.platforms.includes(platform)));
        return valueAt(ws.parse(location.file), location.path);
    };

    /** @type {PlatformPlan[]} */
    const plans = platforms.map((platform) => {
        const settings = settingsFor(platform);
        /** @type {{ state: string, minSupportedVersion?: Version } | undefined} */
        const webDetection = ws.parse(overrideFile(platform)).features.webDetection;
        if (webDetection === undefined || webDetection.state !== 'enabled') {
            warnings.push(`webDetection is not enabled in ${overrideFile(platform)}; no cohort runs detectors there until it is`);
        }
        const floor = webDetection?.minSupportedVersion;
        const experimentsFloor = EXPERIMENTS_MIN_VERSION[platform];
        const gate = floor === undefined ? undefined : latestGate(platform, settings, floor);
        const clientVersion = options.clientVersions[platform] ?? gate;
        const experimentFloor = floor !== undefined && experimentsFloor !== undefined ? maxVersion(floor, experimentsFloor) : floor;
        const minSupportedVersion = mode === 'trial' ? (gate ?? experimentFloor) : experimentFloor;
        return { platform, clientVersion, minSupportedVersion, production: autoRunning(settings, clientsFor(platform, clientVersion)) };
    });

    const allIds = [
        ...new Set(platforms.flatMap((platform) => detectorIds(settingsFor(platform).detectors))),
    ].sort();
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
                    const config = effectiveDetectors(settingsFor(plan.platform), client)[group]?.[name];
                    return config?.triggers?.auto?.when === undefined || config.actions?.fireEvent === undefined;
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
        experimentName = pickSlot(inUse, slotUsedBefore);
        if (isShallowClone()) {
            warnings.push(`This clone is shallow, so ${experimentName} may have been used before; run git fetch --unshallow and retry`);
        }
    } else {
        if (platforms.includes('android') && !ANDROID_SLOTS.includes(experimentName)) {
            throw new Error(`Android ignores ${experimentName}; use one of its declared slots, such as ${ANDROID_SLOTS[10]}`);
        }
        if (inUse.has(experimentName)) throw new Error(`${experimentName} is in use in an override`);
    }

    // A patch on a detector the settings lack fails, and C-S-S then skips the whole block, so each location
    // patches only its own detectors.
    for (const location of locations) {
        const present = new Set(detectorIds(valueAt(ws.parse(location.file), location.path).detectors));
        const changes = buildConditionalChanges(
            mode,
            experimentName,
            slices.map((slice) => slice.filter((id) => present.has(id))),
        );
        appendChanges(
            ws,
            location,
            changes.filter((change) => change.patchSettings.length > 0),
        );
    }
    const results = verifyCohorts(mode, experimentName, settingsFor, plans, slices);

    // The rollout, and with it each cohort's share of users, can change during the experiment, so the
    // description leaves them out.
    const description = `Web detection ${mode} split by ${by}, seed ${seed}: control weight ${sizing.control}, ${options.cohorts} × weight ${sizing.cohort}`;
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
    return { experimentName, report: lines.join('\n'), warnings, plans, slices };
}

const HELP = `Usage:
  web-detection-experiment.mjs create --mode <mode> --cohorts <n> [options]

create:
  --mode enable|disable|trial
      enable   each cohort auto-runs only its slice of the production detectors; control runs none
      disable  each cohort stops its slice of the production detectors; control runs production
      trial    each cohort adds its slice of the detectors not running in production; control runs production
  --cohorts <n>            treatment cohorts, named treatment01, treatment02, ...
  --rollout <p>            percent of users enrolled (default: 100, or derived)
  --control-percent <p>|sqrt
                           percent of users in control; sqrt is √n × a treatment cohort
                           (default: sqrt, or derived)
  --cohort-percent <p>     percent of users in each treatment cohort (default: derived)
                           Give at most two of these three; the third follows from
                           rollout = control + n × cohort. A derived rollout is rounded up to a whole percent.
  --by detector|group      split single detectors or whole groups (default: detector)
  --seed <string>          seed for the split (default: random, printed in the slot description)
  --experiment <slot>|auto contentScopeExperiments slot (default: auto, the first unused Android slot)
  --platforms <list>       comma-separated from ${PLATFORMS.join(', ')} (default: ${DEFAULT_PLATFORMS.join(',')})
  --client-version <list>  platform=version pairs to evaluate production at
                           (default: the platform's highest web detection version gate)
  --dry-run                print the report without writing files

Every cohort is checked against the built config before writing. Raise, stop, inspect and remove the
experiment with experiment.mjs.
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
 * @returns {ControlSize | undefined}
 */
function parseControl(value) {
    if (value === 'sqrt') return value;
    return parsePercent(value, '--control-percent');
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
    if (values.help || command !== 'create') {
        console.log(HELP);
        process.exit(values.help ? 0 : 1);
    }

    const mode = values.mode;
    if (mode !== 'enable' && mode !== 'disable' && mode !== 'trial') throw new Error('--mode must be enable, disable or trial');
    const by = values.by;
    if (by !== 'detector' && by !== 'group') throw new Error('--by must be detector or group');
    const platforms = values.platforms.split(',').filter(Boolean);
    for (const platform of platforms) {
        if (!PLATFORMS.includes(/** @type {Platform} */ (platform))) throw new Error(`Unknown platform: ${platform}`);
    }

    const ws = Workspace.fromRepository();
    const { experimentName, report, warnings, plans, slices } = create(
        {
            mode,
            by,
            cohorts: parsePositiveInteger(values.cohorts, '--cohorts'),
            cohortPercent: parsePercent(values['cohort-percent'], '--cohort-percent'),
            control: parseControl(values['control-percent']),
            seed: values.seed ?? randomBytes(4).toString('hex'),
            experiment: values.experiment,
            platforms: /** @type {Platform[]} */ (platforms),
            clientVersions: parseVersions(values['client-version'], '--client-version'),
            rollout: parsePercent(values.rollout, '--rollout'),
            dryRun: values['dry-run'],
        },
        ws,
    );
    console.log(report);
    for (const warning of warnings) console.warn(`Warning: ${warning}`);
    await verifyBuiltCohorts(ws, mode, experimentName, plans, slices);
    console.log('\nThe built config gives the same result.');
    if (values['dry-run']) return;
    await ws.flush();
    console.log(`Remove with: node scripts/experiment.mjs remove ${experimentName}`);
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}
