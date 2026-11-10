#!/usr/bin/env node

/**
 * Create, roll out, disable and remove experiments: subfeatures with cohorts, by default under
 * contentScopeExperiments.
 *
 * Usage:
 *   node scripts/experiment.mjs create auto --platforms android,ios,macos,windows --rollout 10 --enable-feature webDetection
 *   node scripts/experiment.mjs rollout contentScopeExperiment10 --percent 25
 *   node scripts/experiment.mjs disable contentScopeExperiment10
 *   node scripts/experiment.mjs remove contentScopeExperiment10
 *
 * Run with --help for the options.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
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
import { Workspace, buildConfigs, copyWorkingTree, isShallowClone, overrideFile, usedInHistory } from './config-files.mjs';

/**
 * @typedef {import('./config-conditions.mjs').Platform} Platform
 * @typedef {import('./config-conditions.mjs').Version} Version
 * @typedef {import('./config-conditions.mjs').ConditionBlock} ConditionBlock
 * @typedef {import('./config-conditions.mjs').ConditionalChange} ConditionalChange
 * @typedef {import('./config-conditions.mjs').PatchSettings} PatchSettings
 * @typedef {import('./config-conditions.mjs').Client} Client
 * @typedef {import('./config-files.mjs').JsonPath} JsonPath
 *
 * @typedef {{ name: string, weight: number }} Cohort
 *
 * @typedef {object} Subfeature
 * @property {string} state
 * @property {string} [description]
 * @property {Version} [minSupportedVersion]
 * @property {{ steps: { percent: number }[] }} [rollout]
 * @property {Cohort[]} [cohorts]
 *
 * @typedef {object} FeatureSettings
 * @property {unknown} [additionalCheck]
 * @property {ConditionalChange[]} [conditionalChanges]
 *
 * @typedef {object} MergedFeature
 * @property {string | undefined} state
 * @property {Version | undefined} minSupportedVersion
 * @property {FeatureSettings} settings
 *
 * @typedef {object} Location - where a subfeature or a feature's settings is defined
 * @property {string} file
 * @property {JsonPath} path
 * @property {Platform[]} platforms - the platforms it applies to
 *
 * @typedef {'production' | 'enabled' | 'disabled'} ControlFlavour
 * @typedef {{ cohort: string, feature: string, patchSettings: PatchSettings }} CohortPatch
 *
 * @typedef {object} LoadsCheck - what each cohort of a `create --enable-feature` experiment should load
 * @property {string} slot
 * @property {Cohort[]} cohorts
 * @property {ControlFlavour} control
 * @property {string[]} enableFeatures
 * @property {Platform[]} platforms
 * @property {Map<Platform, Version | undefined>} versions - the version each platform is evaluated at
 *
 * @typedef {object} CreateOptions
 * @property {string} slot - subfeature name, or `auto` for the first unused Android slot
 * @property {string} parent
 * @property {Platform[]} platforms
 * @property {Cohort[]} cohorts
 * @property {number | undefined} rollout
 * @property {Partial<Record<Platform, Version>>} minVersions
 * @property {string | undefined} description
 * @property {string[]} enableFeatures
 * @property {ControlFlavour} control
 * @property {CohortPatch[]} patches
 */

export const EXPERIMENTS_FEATURE = 'contentScopeExperiments';

/** Features whose override settings are merged into the base settings by the build. */
const MERGED_SETTINGS_FEATURES = [
    'customUserAgent',
    'trackerAllowlist',
    'eventHub',
    'webInterferenceDetection',
    'clickToLoad',
    'clickToPlay',
];

/**
 * Features that also load in a dedicated C-S-S bundle on the platform. An off block is scoped to the
 * platform's main bundles, so it would leave them on in the dedicated one.
 *
 * @type {Partial<Record<Platform, string[]>>}
 */
const DEDICATED_BUNDLE_FEATURES = {
    android: [
        'duckAiDataClearing',
        'duckAiChatHistory',
        'brokerProtection',
        'autofillImport',
    ],
    ios: [
        'duckAiDataClearing',
        'duckAiChatHistory',
    ],
    macos: [
        'duckAiDataClearing',
        'duckAiChatHistory',
    ],
};

/**
 * Android only reads the experiment subfeatures it declares, in this order.
 */
export const ANDROID_SLOTS = [
    ...Array.from({ length: 20 }, (_, i) => `contentScopeExperiment${i}`),
    ...Array.from({ length: 100 }, (_, i) => `contentScopeExperiment${String(i + 1).padStart(3, '0')}`),
];

/**
 * @param {string} slot
 */
export function slotUsedBefore(slot) {
    return usedInHistory(slot, [
        'overrides',
        'features',
    ]);
}

/**
 * A warning when a fractional rollout reaches Windows, which enrols by a whole percent rounded down.
 *
 * @param {number} percent
 * @param {Platform[]} platforms
 * @returns {string[]}
 */
export function fractionalRolloutWarnings(percent, platforms) {
    if (Number.isInteger(percent) || !platforms.includes('windows')) return [];
    return [
        `Windows enrols rollouts by a whole percent, rounded down: ${percent}% enrols ${Math.floor(percent)}% there`,
    ];
}

/**
 * The first Android slot that no override uses and that git history has never used. A reused slot keeps
 * earlier enrolments in any cohort whose name still exists.
 *
 * @param {Set<string>} inUse
 * @param {(name: string) => boolean} usedBefore
 */
export function pickSlot(inUse, usedBefore) {
    const slot = ANDROID_SLOTS.find((name) => !inUse.has(name) && !usedBefore(name));
    if (slot === undefined) throw new Error('Every Android experiment slot has been used');
    return slot;
}

/**
 * @param {Workspace} ws
 * @returns {Set<string>} contentScopeExperiments subfeatures in any override
 */
export function slotsInUse(ws) {
    return new Set(
        PLATFORMS.flatMap((platform) => Object.keys(ws.parse(overrideFile(platform)).features?.[EXPERIMENTS_FEATURE]?.features ?? {})),
    );
}

/**
 * @param {unknown} root
 * @param {JsonPath} path
 * @returns {any}
 */
export function valueAt(root, path) {
    return path.reduce((value, key) => /** @type {any} */ (value)?.[key], root);
}

/**
 * @param {Location[]} locations
 * @param {string} file
 * @param {JsonPath} path
 * @param {Platform} platform
 */
function addLocation(locations, file, path, platform) {
    const existing = locations.find((location) => location.file === file);
    if (existing) existing.platforms.push(platform);
    else
        locations.push({
            file,
            path,
            platforms: [
                platform,
            ],
        });
}

/**
 * Where the subfeature is defined on each platform. An override that declares the parent's `features`
 * replaces the base file's subfeatures on that platform.
 *
 * @param {Workspace} ws
 * @param {string} parent
 * @param {string} slot
 * @returns {Location[]}
 */
export function locateSubfeature(ws, parent, slot) {
    /** @type {Location[]} */
    const locations = [];
    const baseFile = ws.featureFile(parent);
    const base = baseFile === undefined ? undefined : ws.parse(baseFile);
    for (const platform of PLATFORMS) {
        const file = overrideFile(platform);
        const feature = ws.parse(file).features?.[parent];
        if (feature?.features !== undefined) {
            if (feature.features[slot] !== undefined)
                addLocation(
                    locations,
                    file,
                    [
                        'features',
                        parent,
                        'features',
                        slot,
                    ],
                    platform,
                );
        } else if (baseFile !== undefined && base.features?.[slot] !== undefined && (feature !== undefined || base.state !== undefined)) {
            addLocation(
                locations,
                baseFile,
                [
                    'features',
                    slot,
                ],
                platform,
            );
        }
    }
    return locations;
}

/**
 * Where the feature's settings are defined on each platform. An override that declares `settings`
 * replaces the base settings on that platform.
 *
 * @param {Workspace} ws
 * @param {string} feature
 * @param {Platform[]} platforms
 * @returns {Location[]}
 */
export function locateSettings(ws, feature, platforms) {
    if (MERGED_SETTINGS_FEATURES.includes(feature)) throw new Error(`${feature} settings are merged by the build; edit them by hand`);
    /** @type {Location[]} */
    const locations = [];
    for (const platform of platforms) {
        const file = overrideFile(platform);
        if (ws.parse(file).features?.[feature]?.settings !== undefined) {
            addLocation(
                locations,
                file,
                [
                    'features',
                    feature,
                    'settings',
                ],
                platform,
            );
            continue;
        }
        const baseFile = ws.featureFile(feature);
        if (baseFile === undefined) throw new Error(`${feature} has no base file and no settings in ${file}`);
        addLocation(
            locations,
            baseFile,
            [
                'settings',
            ],
            platform,
        );
    }
    return locations;
}

/**
 * The feature as the build produces it for the platform, or undefined when the platform doesn't have it.
 *
 * @param {Workspace} ws
 * @param {string} feature
 * @param {Platform} platform
 * @returns {MergedFeature | undefined}
 */
export function mergedFeature(ws, feature, platform) {
    const baseFile = ws.featureFile(feature);
    const base = baseFile === undefined ? {} : ws.parse(baseFile);
    const override = ws.parse(overrideFile(platform)).features?.[feature];
    if (override === undefined && base.state === undefined) return undefined;
    const merged = { ...base, ...override };
    return { state: merged.state, minSupportedVersion: merged.minSupportedVersion, settings: merged.settings ?? {} };
}

/**
 * Whether C-S-S loads the feature for the client: its state is enabled and its `additionalCheck` setting,
 * after conditional changes, is enabled (the default).
 *
 * @param {MergedFeature} feature
 * @param {Client} client
 */
export function featureLoads(feature, client) {
    if (feature.state !== 'enabled') return false;
    const { settings } = applyConditionalChanges(feature.settings, client);
    const check = settings.additionalCheck || 'enabled';
    const state = typeof check === 'object' && check !== null ? /** @type {{ state?: unknown }} */ (check).state : check;
    return state === 'enabled';
}

/**
 * @param {Platform} platform
 * @param {Version | undefined} version
 * @param {Record<string, string>} [cohorts]
 * @returns {Client[]}
 */
export function platformClients(platform, version, cohorts = {}) {
    return PLATFORM_INJECT_NAMES[platform].map((injectName) => ({ injectName, version, cohorts }));
}

/**
 * Whether any of the platform's clients loads the feature.
 *
 * @param {MergedFeature} feature
 * @param {Platform} platform
 * @param {Version | undefined} version
 * @param {Record<string, string>} [cohorts]
 */
function loadsOn(feature, platform, version, cohorts = {}) {
    return platformClients(platform, version, cohorts).some((client) => featureLoads(feature, client));
}

/**
 * Condition blocks matching every client of the platform. iOS and macOS share inject names, so they are
 * told apart by the major version of `version`.
 *
 * @param {Platform} platform
 * @param {Version | undefined} version
 * @returns {ConditionBlock[]}
 */
export function platformScope(platform, version) {
    const injectNames = PLATFORM_INJECT_NAMES[platform];
    if (platform !== 'ios' && platform !== 'macos') return injectNames.map((injectName) => ({ injectName }));
    if (typeof version !== 'string') throw new Error(`${platform} needs a --min-version to tell it apart from the other Apple platform`);
    const major = version.split('.')[0];
    const range = platform === 'ios' ? { minSupportedVersion: `${major}.0.0` } : { maxSupportedVersion: `${major}.9999.9999` };
    return injectNames.map((injectName) => ({ injectName, ...range }));
}

/**
 * @param {string} slot
 * @param {string} cohort
 * @returns {ConditionBlock}
 */
function cohortCondition(slot, cohort) {
    return { experiment: { experimentName: slot, cohort } };
}

/**
 * @param {'enabled' | 'disabled'} state
 * @returns {PatchSettings}
 */
function additionalCheckPatch(state) {
    return [
        { op: 'add', path: '/additionalCheck', value: state },
    ];
}

/**
 * The platforms whose clients the condition covers, as platformScope writes it.
 *
 * @param {ConditionalChange} change
 * @returns {Platform[]}
 */
export function scopedPlatforms(change) {
    const blocks = conditionBlocks(change);
    return PLATFORMS.filter((platform) =>
        blocks.some(
            (block) =>
                block.injectName !== undefined &&
                PLATFORM_INJECT_NAMES[platform].includes(block.injectName) &&
                (platform !== 'ios' || block.minSupportedVersion !== undefined) &&
                (platform !== 'macos' || block.maxSupportedVersion !== undefined),
        ),
    );
}

/**
 * An off block: switches the feature off for every client of the scoped platforms.
 *
 * @param {ConditionalChange} change
 */
export function isOffBlock(change) {
    return (
        JSON.stringify(change.patchSettings) === JSON.stringify(additionalCheckPatch('disabled')) &&
        conditionBlocks(change).every((block) => block.experiment === undefined && block.injectName !== undefined)
    );
}

/**
 * An enable block: switches the feature back on for experiment cohorts after an off block.
 *
 * @param {ConditionalChange} change
 */
function isEnableBlock(change) {
    return (
        JSON.stringify(change.patchSettings) === JSON.stringify(additionalCheckPatch('enabled')) &&
        conditionBlocks(change).every((block) => block.experiment !== undefined)
    );
}

/**
 * @param {Workspace} ws
 * @param {Location} location - a settings location
 * @param {ConditionalChange[]} changes
 */
export function appendChanges(ws, location, changes) {
    if (changes.length === 0) return;
    const settings = valueAt(ws.parse(location.file), location.path);
    if (settings === undefined) {
        ws.edit(location.file, location.path, { conditionalChanges: changes });
    } else if (settings.conditionalChanges === undefined) {
        ws.edit(
            location.file,
            [
                ...location.path,
                'conditionalChanges',
            ],
            changes,
        );
    } else {
        for (const change of changes)
            ws.edit(
                location.file,
                [
                    ...location.path,
                    'conditionalChanges',
                    -1,
                ],
                change,
                { isArrayInsertion: true },
            );
    }
}

/**
 * Add the subfeature to the platform's override. contentScopeExperiments is created when the override lacks
 * it; any other parent must be in the override already.
 *
 * @param {Workspace} ws
 * @param {string} parent
 * @param {Platform} platform
 * @param {string} slot
 * @param {Subfeature} config
 */
export function addSubfeature(ws, parent, platform, slot, config) {
    const file = overrideFile(platform);
    const feature = ws.parse(file).features?.[parent];
    if (feature === undefined) {
        if (parent !== EXPERIMENTS_FEATURE) throw new Error(`${parent} is not in ${file}; add it before adding subfeatures`);
        ws.edit(
            file,
            [
                'features',
                parent,
            ],
            { state: 'enabled', exceptions: [], features: { [slot]: config } },
        );
    } else if (feature.features === undefined) {
        const baseFile = ws.featureFile(parent);
        const baseSubfeatures = baseFile === undefined ? undefined : ws.parse(baseFile).features;
        if (baseSubfeatures !== undefined && Object.keys(baseSubfeatures).length > 0) {
            throw new Error(`Adding ${slot} to ${file} would hide the subfeatures ${parent} defines in ${baseFile}`);
        }
        ws.edit(
            file,
            [
                'features',
                parent,
                'features',
            ],
            { [slot]: config },
        );
    } else if (feature.features[slot] !== undefined) {
        throw new Error(`${slot} already exists in ${file}`);
    } else {
        ws.edit(
            file,
            [
                'features',
                parent,
                'features',
                slot,
            ],
            config,
        );
    }
}

/**
 * The cohort's enabled state per control flavour.
 *
 * @param {string | undefined} cohort - undefined when not enrolled
 * @param {ControlFlavour} control
 * @param {boolean} production
 */
export function expectedLoads(cohort, control, production) {
    if (cohort === undefined) return production;
    if (cohort === 'control') return control === 'production' ? production : control === 'enabled';
    return true;
}

/**
 * Check that each cohort, and the users outside the experiment, load each enabled feature as they should.
 *
 * @param {LoadsCheck} check
 * @param {(feature: string, platform: Platform) => MergedFeature} before - the feature in production
 * @param {(feature: string, platform: Platform) => MergedFeature} after - the feature with the experiment
 * @returns {string[]} the result as table lines
 */
export function checkLoads({ slot, cohorts, control, enableFeatures, platforms, versions }, before, after) {
    const columns = [
        ...cohorts.map((c) => c.name),
        'not enrolled',
    ];
    const lines = [
        `| Platform | Feature | Production | ${columns.join(' | ')} |`,
        `|---|---|---|${columns.map(() => '---|').join('')}`,
    ];
    for (const feature of enableFeatures) {
        for (const platform of platforms) {
            const version = versions.get(platform);
            const production = loadsOn(before(feature, platform), platform, version);
            const cells = [
                ...cohorts.map((c) => c.name),
                undefined,
            ].map((cohort) => {
                const actual = loadsOn(after(feature, platform), platform, version, cohort === undefined ? {} : { [slot]: cohort });
                if (actual !== expectedLoads(cohort, control, production)) {
                    throw new Error(
                        `${feature} on ${platform}, ${cohort ?? 'not enrolled'}: expected ${actual ? 'off' : 'on'}, got ${actual ? 'on' : 'off'}`,
                    );
                }
                return actual ? 'on' : 'off';
            });
            lines.push(`| ${platform} | ${feature} | ${production ? 'on' : 'off'} | ${cells.join(' | ')} |`);
        }
    }
    return lines;
}

/**
 * The feature as the built config for the platform has it.
 *
 * @param {Map<string, any>} configs - built config by platform
 * @param {string} feature
 * @param {Platform} platform
 * @returns {MergedFeature}
 */
function builtFeature(configs, feature, platform) {
    const built = configs.get(platform)?.features?.[feature];
    if (built === undefined) throw new Error(`The built ${platform} config has no ${feature}`);
    return { state: built.state, minSupportedVersion: built.minSupportedVersion, settings: built.settings ?? {} };
}

/**
 * Run checkLoads on the built config: the repository as it is, against the repository with the pending edits.
 *
 * @param {Workspace} ws
 * @param {LoadsCheck} check
 * @returns {Promise<string[]>} the result as table lines
 */
export async function checkBuiltLoads(ws, check) {
    const [
        before,
        after,
    ] = await Promise.all([
        buildConfigs(copyWorkingTree(), check.platforms),
        buildConfigs(copyWorkingTree(ws.pending()), check.platforms),
    ]);
    return checkLoads(
        check,
        (feature, platform) => builtFeature(before, feature, platform),
        (feature, platform) => builtFeature(after, feature, platform),
    );
}

/**
 * @param {Workspace} ws
 * @param {CreateOptions} options
 * @returns {{ slot: string, report: string, warnings: string[], check: LoadsCheck }}
 */
export function createExperiment(ws, options) {
    const { parent, platforms, cohorts, enableFeatures, control, patches } = options;
    /** @type {string[]} */
    const warnings = [];
    if (platforms.length === 0) throw new Error('create needs --platforms');
    if (cohorts.length === 0 || new Set(cohorts.map((c) => c.name)).size !== cohorts.length) throw new Error('Cohort names must be unique');
    for (const cohort of cohorts) {
        if (!Number.isInteger(cohort.weight) || cohort.weight <= 0) throw new Error(`Cohort ${cohort.name} needs a positive whole weight`);
    }
    if (options.rollout !== undefined && !(options.rollout > 0 && options.rollout <= 100))
        throw new Error('--rollout must be above 0 and at most 100');
    if (options.rollout !== undefined) warnings.push(...fractionalRolloutWarnings(options.rollout, platforms));
    for (const patch of patches) {
        if (!cohorts.some((c) => c.name === patch.cohort)) throw new Error(`--patch names unknown cohort ${patch.cohort}`);
    }
    const enabledCohorts = cohorts.map((c) => c.name).filter((name) => name !== 'control' || control === 'enabled');
    if (enableFeatures.length > 0 && enabledCohorts.length === 0) throw new Error('--enable-feature needs a cohort other than control');
    if (parent !== EXPERIMENTS_FEATURE && (enableFeatures.length > 0 || patches.length > 0)) {
        throw new Error(`C-S-S only matches cohorts under ${EXPERIMENTS_FEATURE}, so --enable-feature and --patch need it as the parent`);
    }

    let slot = options.slot;
    if (slot === 'auto') {
        slot = pickSlot(slotsInUse(ws), slotUsedBefore);
        if (isShallowClone())
            warnings.push(`This clone is shallow, so ${slot} may have been used before; run git fetch --unshallow and retry`);
    } else if (parent === EXPERIMENTS_FEATURE && platforms.includes('android') && !ANDROID_SLOTS.includes(slot)) {
        throw new Error(`Android ignores ${slot}; use one of its declared slots, such as ${ANDROID_SLOTS[10]}`);
    }
    if (locateSubfeature(ws, parent, slot).length > 0) throw new Error(`${slot} already exists under ${parent}`);

    /** @type {Map<string, Map<Platform, MergedFeature>>} */
    const before = new Map();
    for (const feature of new Set([
        ...enableFeatures,
        ...patches.map((patch) => patch.feature),
    ])) {
        /** @type {Map<Platform, MergedFeature>} */
        const perPlatform = new Map();
        for (const platform of platforms) {
            const merged = mergedFeature(ws, feature, platform);
            if (merged === undefined) throw new Error(`${feature} is not configured for ${platform}`);
            if (enableFeatures.includes(feature) && merged.state !== 'enabled' && merged.state !== 'disabled') {
                throw new Error(
                    `${feature} is ${merged.state} on ${platform}; switching it per cohort would turn it off for ${merged.state} users outside the experiment`,
                );
            }
            perPlatform.set(platform, merged);
        }
        before.set(feature, perPlatform);
    }

    /** @type {Map<Platform, Version | undefined>} */
    const versions = new Map();
    for (const platform of platforms) {
        let version = options.minVersions[platform];
        if (version === undefined) {
            for (const feature of enableFeatures) {
                const floor = before.get(feature)?.get(platform)?.minSupportedVersion;
                if (floor === undefined) continue;
                version = version === undefined || !sameVersionFamily(version, floor) ? floor : maxVersion(version, floor);
            }
            const experimentsFloor = EXPERIMENTS_MIN_VERSION[platform];
            if (experimentsFloor !== undefined && parent === EXPERIMENTS_FEATURE) {
                version = version === undefined ? experimentsFloor : maxVersion(version, experimentsFloor);
            }
        }
        versions.set(platform, version);
    }

    const sizes = cohorts.map((c) => `${c.name} ${c.weight}`).join(', ');
    const description =
        options.description ??
        `Cohorts ${sizes}${enableFeatures.length ? `; enables ${enableFeatures.join(', ')}, control ${control}` : ''}`;
    for (const platform of platforms) {
        const version = versions.get(platform);
        addSubfeature(ws, parent, platform, slot, {
            state: 'enabled',
            description,
            ...(version !== undefined && { minSupportedVersion: version }),
            ...(options.rollout !== undefined &&
                options.rollout < 100 && {
                    rollout: {
                        steps: [
                            { percent: options.rollout },
                        ],
                    },
                }),
            cohorts,
        });
    }

    for (const feature of enableFeatures) {
        const merged = /** @type {Map<Platform, MergedFeature>} */ (before.get(feature));
        /** @type {Map<Platform, boolean>} */
        const loads = new Map(
            platforms.map((platform) => [
                platform,
                loadsOn(/** @type {MergedFeature} */ (merged.get(platform)), platform, versions.get(platform)),
            ]),
        );
        const offPlatforms = platforms.filter((platform) => !loads.get(platform));
        const stateOff = offPlatforms.filter((platform) => merged.get(platform)?.state !== 'enabled');
        for (const platform of stateOff) {
            if (DEDICATED_BUNDLE_FEATURES[platform]?.includes(feature)) {
                throw new Error(`${feature} also loads in its own C-S-S bundle on ${platform}, which an off block does not cover`);
            }
            const file = overrideFile(platform);
            if (ws.parse(file).features?.[feature] === undefined)
                throw new Error(`${feature} is not in ${file}; add it before enabling it`);
            if (merged.get(platform)?.minSupportedVersion === undefined) {
                throw new Error(
                    `${feature} has no minSupportedVersion on ${platform}; add one first, or enabling it reaches clients too old to apply the off block`,
                );
            }
            ws.edit(
                file,
                [
                    'features',
                    feature,
                    'state',
                ],
                'enabled',
            );
        }
        for (const platform of platforms) {
            if (loads.get(platform) && control !== 'disabled')
                warnings.push(`${feature} is already on for ${platform}, so the experiment changes nothing there`);
        }
        for (const location of locateSettings(ws, feature, platforms)) {
            const stateOffHere = stateOff.filter((platform) => location.platforms.includes(platform));
            const offHere = offPlatforms.some((platform) => location.platforms.includes(platform));
            const onHere = location.platforms.some((platform) => loads.get(platform));
            /** @type {ConditionalChange[]} */
            const changes = [];
            if (stateOffHere.length > 0) {
                changes.push({
                    condition: stateOffHere.flatMap((platform) => platformScope(platform, versions.get(platform))),
                    patchSettings: additionalCheckPatch('disabled'),
                });
            }
            if (offHere) {
                changes.push({
                    condition: enabledCohorts.map((cohort) => cohortCondition(slot, cohort)),
                    patchSettings: additionalCheckPatch('enabled'),
                });
            }
            if (onHere && control === 'disabled' && cohorts.some((c) => c.name === 'control')) {
                changes.push({ condition: cohortCondition(slot, 'control'), patchSettings: additionalCheckPatch('disabled') });
            }
            appendChanges(ws, location, changes);
        }
    }

    /** @type {ConditionalChange[]} */
    const patchChanges = [];
    for (const patch of patches) {
        const change = { condition: cohortCondition(slot, patch.cohort), patchSettings: patch.patchSettings };
        patchChanges.push(change);
        for (const location of locateSettings(ws, patch.feature, platforms))
            appendChanges(ws, location, [
                change,
            ]);
    }

    /** @type {LoadsCheck} */
    const check = { slot, cohorts, control, enableFeatures, platforms, versions };
    const lines = [
        `${slot} under ${parent}: ${description}${options.rollout !== undefined && options.rollout < 100 ? `, rollout ${options.rollout}%` : ''}`,
    ];
    if (enableFeatures.length > 0) {
        lines.push(
            '',
            ...checkLoads(
                check,
                (feature, platform) => /** @type {MergedFeature} */ (before.get(feature)?.get(platform)),
                (feature, platform) => /** @type {MergedFeature} */ (mergedFeature(ws, feature, platform)),
            ),
        );
    }
    patches.forEach((patch, i) => {
        for (const platform of platforms) {
            const merged = /** @type {MergedFeature} */ (mergedFeature(ws, patch.feature, platform));
            for (const client of platformClients(platform, versions.get(platform), { [slot]: patch.cohort })) {
                const { settings, failed } = applyConditionalChanges(merged.settings, client);
                if (failed.some((change) => JSON.stringify(change) === JSON.stringify(patchChanges[i]))) {
                    throw new Error(`The ${patch.feature} patch for ${patch.cohort} fails to apply on ${platform} (${client.injectName})`);
                }
                // A replace or remove on a missing path applies without changing anything.
                const unenrolled = applyConditionalChanges(merged.settings, { ...client, cohorts: {} }).settings;
                if (JSON.stringify(settings) === JSON.stringify(unenrolled)) {
                    warnings.push(`The ${patch.feature} patch for ${patch.cohort} changes nothing on ${platform} (${client.injectName})`);
                }
            }
        }
    });
    return { slot, report: lines.join('\n'), warnings, check };
}

/**
 * @param {Workspace} ws
 * @param {string} parent
 * @param {string} slot
 * @param {Platform[] | undefined} platforms - limit to these; a location shared with other platforms is an error
 */
function selectLocations(ws, parent, slot, platforms) {
    const locations = locateSubfeature(ws, parent, slot);
    if (locations.length === 0) throw new Error(`${slot} is not defined under ${parent}`);
    if (platforms === undefined) return locations;
    return locations.filter((location) => {
        const selected = location.platforms.filter((platform) => platforms.includes(platform));
        if (selected.length > 0 && selected.length < location.platforms.length) {
            throw new Error(`${location.file} defines ${slot} for ${location.platforms.join(', ')}; include all of them`);
        }
        return selected.length > 0;
    });
}

/**
 * Append a rollout step. Steps are never edited: clients track each step to decide whom to enrol next.
 *
 * @param {Workspace} ws
 * @param {{ parent: string, slot: string, percent: number, allowDecrease: boolean, platforms?: Platform[] }} options
 * @returns {string[]} warnings
 */
export function appendRolloutStep(ws, { parent, slot, percent, allowDecrease, platforms }) {
    if (!(percent > 0 && percent <= 100)) throw new Error('--percent must be above 0 and at most 100');
    const locations = selectLocations(ws, parent, slot, platforms);
    const warnings = fractionalRolloutWarnings(
        percent,
        locations.flatMap((location) => location.platforms),
    );
    for (const location of locations) {
        /** @type {Subfeature} */
        const subfeature = valueAt(ws.parse(location.file), location.path);
        const steps = subfeature.rollout?.steps;
        if (!steps?.length) throw new Error(`${slot} in ${location.file} has no rollout, so it already reaches every user`);
        const last = steps[steps.length - 1].percent;
        if (percent === last) throw new Error(`${slot} in ${location.file} is already at ${percent}%`);
        if (percent < last) {
            if (!allowDecrease) throw new Error(`${slot} in ${location.file} is at ${last}%; lowering it needs --allow-decrease`);
            warnings.push(`Lowering ${slot} in ${location.file} from ${last}% to ${percent}%: only Android un-enrols users`);
        }
        ws.edit(
            location.file,
            [
                ...location.path,
                'rollout',
                'steps',
                -1,
            ],
            { percent },
            { isArrayInsertion: true },
        );
    }
    return warnings;
}

/**
 * @param {Workspace} ws
 * @param {{ parent: string, slot: string, state: 'enabled' | 'disabled', platforms?: Platform[] }} options
 */
export function setSubfeatureState(ws, { parent, slot, state, platforms }) {
    for (const location of selectLocations(ws, parent, slot, platforms)) {
        ws.edit(
            location.file,
            [
                ...location.path,
                'state',
            ],
            state,
        );
    }
}

/**
 * Every settings `conditionalChanges` list in the base feature files and overrides.
 *
 * @param {Workspace} ws
 * @returns {{ file: string, feature: string, path: JsonPath, changes: ConditionalChange[] }[]}
 */
function allConditionalChanges(ws) {
    const lists = [];
    for (const [
        feature,
        file,
    ] of Object.entries(ws.featureFiles)) {
        const changes = ws.parse(file).settings?.conditionalChanges;
        if (Array.isArray(changes))
            lists.push({
                file,
                feature,
                path: [
                    'settings',
                    'conditionalChanges',
                ],
                changes,
            });
    }
    for (const platform of PLATFORMS) {
        const file = overrideFile(platform);
        for (const [
            feature,
            config,
        ] of Object.entries(ws.parse(file).features ?? {})) {
            const changes = /** @type {any} */ (config)?.settings?.conditionalChanges;
            if (Array.isArray(changes))
                lists.push({
                    file,
                    feature,
                    path: [
                        'features',
                        feature,
                        'settings',
                        'conditionalChanges',
                    ],
                    changes,
                });
        }
    }
    return lists;
}

/**
 * The indices of the conditional changes written for the slot: those whose every condition names it.
 *
 * @param {ConditionalChange[]} changes
 * @param {string} slot
 * @returns {number[]}
 */
export function experimentChangeIndices(changes, slot) {
    return changes.flatMap((change, index) =>
        conditionBlocks(change).every((block) => block.experiment?.experimentName === slot)
            ? [
                  index,
              ]
            : [],
    );
}

/**
 * The off blocks that only the slot's enable blocks switch back on: those before one of the slot's enable
 * blocks with no other experiment's enable block after them. An off block is shared by every experiment
 * created while it was there.
 *
 * @param {ConditionalChange[]} changes
 * @param {number[]} slotIndices - from experimentChangeIndices
 * @returns {number[]}
 */
export function orphanedOffBlocks(changes, slotIndices) {
    const enableIndices = slotIndices.filter((index) => isEnableBlock(changes[index]));
    if (enableIndices.length === 0) return [];
    const lastEnable = Math.max(...enableIndices);
    return changes.flatMap((change, index) =>
        index < lastEnable &&
        isOffBlock(change) &&
        !changes.some((other, later) => later > index && !slotIndices.includes(later) && isEnableBlock(other))
            ? [
                  index,
              ]
            : [],
    );
}

/**
 * Whether users outside any experiment load each feature, per platform that has it, at the feature's
 * minimum version.
 *
 * @param {Workspace} ws
 * @param {Iterable<string>} features
 * @returns {Map<string, boolean>} keyed by `feature platform`
 */
function productionLoads(ws, features) {
    /** @type {Map<string, boolean>} */
    const loads = new Map();
    for (const feature of features) {
        for (const platform of PLATFORMS) {
            const merged = mergedFeature(ws, feature, platform);
            if (merged !== undefined) loads.set(`${feature} ${platform}`, loadsOn(merged, platform, merged.minSupportedVersion));
        }
    }
    return loads;
}

/**
 * Remove the subfeature and the conditional changes written for it. contentScopeExperiments is removed
 * from an override once it has no subfeatures left. An off block no other experiment needs is removed too,
 * and the feature's state on its platforms set back to disabled, unless `ship` keeps the feature on.
 *
 * @param {Workspace} ws
 * @param {string} parent
 * @param {string} slot
 * @param {{ ship?: boolean }} [options]
 * @returns {string[]} report lines
 */
export function removeExperiment(ws, parent, slot, { ship = false } = {}) {
    const lines = [];
    const lists = allConditionalChanges(ws);
    const features = new Set(
        lists.filter(({ changes }) => experimentChangeIndices(changes, slot).length > 0).map(({ feature }) => feature),
    );
    const before = productionLoads(ws, features);
    for (const location of locateSubfeature(ws, parent, slot)) {
        const remaining = Object.keys(valueAt(ws.parse(location.file), location.path.slice(0, -1)) ?? {});
        if (parent === EXPERIMENTS_FEATURE && location.file.startsWith('overrides/') && remaining.length === 1) {
            ws.edit(
                location.file,
                [
                    'features',
                    parent,
                ],
                undefined,
            );
        } else {
            ws.edit(location.file, location.path, undefined);
        }
        lines.push(`Removed ${slot} from ${location.file}`);
    }
    for (const { file, feature, path, changes } of lists) {
        const indices = experimentChangeIndices(changes, slot);
        const offBlocks = orphanedOffBlocks(changes, indices);
        const removed = [
            ...indices,
            ...offBlocks,
        ].sort((a, b) => a - b);
        if (removed.length > 0 && removed.length === changes.length) {
            ws.edit(file, path, undefined);
        } else {
            for (const index of removed.reverse())
                ws.edit(
                    file,
                    [
                        ...path,
                        index,
                    ],
                    undefined,
                );
        }
        if (indices.length > 0) lines.push(`Removed ${indices.length} conditional changes from ${feature} in ${file}`);
        for (const index of offBlocks) {
            const platforms = scopedPlatforms(changes[index]);
            lines.push(`Removed the ${feature} off block for ${platforms.join(', ')} from ${file}`);
            if (ship) continue;
            for (const platform of platforms) {
                if (ws.parse(overrideFile(platform)).features?.[feature] !== undefined) {
                    ws.edit(
                        overrideFile(platform),
                        [
                            'features',
                            feature,
                            'state',
                        ],
                        'disabled',
                    );
                }
            }
        }
    }
    const after = productionLoads(ws, features);
    const changed = [
        ...before,
    ]
        .filter(
            ([
                key,
                loads,
            ]) => after.get(key) !== loads,
        )
        .map(
            ([
                key,
            ]) => key,
        );
    if (changed.length > 0 && !ship) {
        throw new Error(`Removing ${slot} would change production for ${changed.join(', ')}; check its off blocks by hand`);
    }
    for (const key of changed) lines.push(`${key}: users outside experiments ${after.get(key) ? 'now load it' : 'no longer load it'}`);
    for (const feature of features) {
        const states = PLATFORMS.map((platform) => `${platform} ${mergedFeature(ws, feature, platform)?.state ?? 'absent'}`);
        lines.push(`${feature} state: ${states.join(', ')}`);
    }
    if (lines.length === 0) throw new Error(`Nothing references ${slot}`);
    return lines;
}

/**
 * @param {Workspace} ws
 * @param {string} parent
 * @param {string} slot
 */
export function experimentStatus(ws, parent, slot) {
    const locations = locateSubfeature(ws, parent, slot);
    if (locations.length === 0) throw new Error(`${slot} is not defined under ${parent}`);
    const lines = [
        '| Platforms | File | State | Rollout steps | Cohorts | minSupportedVersion |',
        '|---|---|---|---|---|---|',
    ];
    for (const location of locations) {
        /** @type {Subfeature} */
        const subfeature = valueAt(ws.parse(location.file), location.path);
        const total = (subfeature.cohorts ?? []).reduce((sum, c) => sum + c.weight, 0);
        const cohorts = (subfeature.cohorts ?? []).map((c) => `${c.name} ${Math.round((c.weight / total) * 1000) / 10}%`).join(', ');
        const steps = subfeature.rollout?.steps.map((step) => `${step.percent}%`).join(' → ') ?? '100%';
        lines.push(
            `| ${location.platforms.join(', ')} | ${location.file} | ${subfeature.state} | ${steps} | ${cohorts} | ${subfeature.minSupportedVersion ?? ''} |`,
        );
    }
    const referencing = allConditionalChanges(ws).filter(({ changes }) => experimentChangeIndices(changes, slot).length > 0);
    if (referencing.length > 0) {
        lines.push(
            '',
            'Conditional changes:',
            ...referencing.map(({ feature, file, changes }) => `- ${feature} in ${file}: ${experimentChangeIndices(changes, slot).length}`),
        );
    }
    if (subfeatureDescription(ws, locations[0])) lines.unshift(`${slot}: ${subfeatureDescription(ws, locations[0])}`, '');
    return lines.join('\n');
}

/**
 * @param {Workspace} ws
 * @param {Location} location
 * @returns {string | undefined}
 */
function subfeatureDescription(ws, location) {
    return valueAt(ws.parse(location.file), location.path)?.description;
}

const HELP = `Usage:
  experiment.mjs status  <slot>
  experiment.mjs create  <slot>|auto --platforms <list> [options]
  experiment.mjs rollout <slot> --percent <p> [--allow-decrease]
  experiment.mjs disable <slot>
  experiment.mjs remove  <slot> [--ship]

Common:
  --parent <feature>         feature that holds the subfeature (default: ${EXPERIMENTS_FEATURE})
  --platforms <list>         comma-separated from ${PLATFORMS.join(', ')}
                             (create: required; others: default every platform that has the slot)
  --dry-run                  print the result without writing files

create:
  --cohorts <list>           name:weight pairs (default: control:1,treatment:1)
  --rollout <p>              enrol this percent of users; raise it later with rollout
  --min-version <list>       platform=version pairs for the slot's minSupportedVersion
                             (default: the enabled features' minimum versions; Windows at least ${EXPERIMENTS_MIN_VERSION.windows})
  --description <text>
  --enable-feature <list>    C-S-S features that every cohort except control runs, through additionalCheck;
                             a feature that is off in production is turned on in the override and switched
                             off for everyone else on that platform. The feature's schema in schema/features
                             must allow additionalCheck. Checked against the built config before writing
  --control production|enabled|disabled
                             what control runs (default: production); users outside the rollout run production
  --patch <cohort>=<file>    JSON file { "feature": "...", "patchSettings": [...] } applied for that cohort;
                             repeatable

rollout:
  --percent <p>              appended as a new rollout step
  --allow-decrease           allow a lower percent; only Android un-enrols users

remove: deletes the slot and every conditional change written for it. A feature create turned on goes back
off once no other experiment switches it on, keeping production as it is.
  --ship                     keep that feature on for everyone instead
`;

/**
 * @param {string | undefined} value
 * @param {string} flag
 */
export function parsePercent(value, flag) {
    if (value === undefined) return undefined;
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0 || number > 100) throw new Error(`${flag} needs a percent above 0 and at most 100`);
    return number;
}

/**
 * @param {string | undefined} value
 * @returns {Platform[] | undefined}
 */
function parsePlatforms(value) {
    if (value === undefined) return undefined;
    const platforms = value.split(',').filter(Boolean);
    for (const platform of platforms) {
        if (!PLATFORMS.includes(/** @type {Platform} */ (platform))) throw new Error(`Unknown platform: ${platform}`);
    }
    return /** @type {Platform[]} */ (platforms);
}

/**
 * @param {string} value
 * @returns {Cohort[]}
 */
function parseCohorts(value) {
    return value.split(',').map((pair) => {
        const [
            name,
            weight,
        ] = pair.split(':');
        if (!name || weight === undefined) throw new Error(`Invalid --cohorts entry: ${pair}`);
        return { name, weight: Number(weight) };
    });
}

/**
 * @param {string} value - comma-separated platform=version pairs
 * @param {string} flag
 * @returns {Partial<Record<Platform, Version>>}
 */
export function parseVersions(value, flag) {
    /** @type {Partial<Record<Platform, Version>>} */
    const versions = {};
    for (const pair of value.split(',').filter(Boolean)) {
        const [
            platform,
            version,
        ] = pair.split('=');
        if (!PLATFORMS.includes(/** @type {Platform} */ (platform)) || !version) throw new Error(`Invalid ${flag} entry: ${pair}`);
        versions[/** @type {Platform} */ (platform)] = /^\d+$/.test(version) ? Number(version) : version;
    }
    return versions;
}

/**
 * @param {string[]} values
 * @returns {CohortPatch[]}
 */
function parsePatches(values) {
    return values.map((value) => {
        const separator = value.indexOf('=');
        if (separator < 1) throw new Error(`Invalid --patch: ${value}`);
        const file = value.slice(separator + 1);
        const { feature, patchSettings } = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8'));
        if (typeof feature !== 'string' || !Array.isArray(patchSettings)) throw new Error(`${file} needs "feature" and "patchSettings"`);
        return { cohort: value.slice(0, separator), feature, patchSettings };
    });
}

async function main() {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            parent: { type: 'string', default: EXPERIMENTS_FEATURE },
            platforms: { type: 'string' },
            cohorts: { type: 'string', default: 'control:1,treatment:1' },
            rollout: { type: 'string' },
            'min-version': { type: 'string', default: '' },
            description: { type: 'string' },
            'enable-feature': { type: 'string', default: '' },
            control: { type: 'string', default: 'production' },
            patch: { type: 'string', multiple: true, default: [] },
            percent: { type: 'string' },
            'allow-decrease': { type: 'boolean', default: false },
            ship: { type: 'boolean', default: false },
            'dry-run': { type: 'boolean', default: false },
            help: { type: 'boolean', default: false },
        },
    });
    const [
        command,
        slot,
    ] = positionals;
    if (
        values.help ||
        ![
            'status',
            'create',
            'rollout',
            'disable',
            'remove',
        ].includes(command) ||
        !slot
    ) {
        console.log(HELP);
        process.exit(values.help ? 0 : 1);
    }

    const ws = Workspace.fromRepository();
    const parent = values.parent;
    const platforms = parsePlatforms(values.platforms);
    /** @type {string[]} */
    let warnings = [];

    if (command === 'status') {
        console.log(experimentStatus(ws, parent, slot));
        return;
    } else if (command === 'create') {
        const control = values.control;
        if (control !== 'production' && control !== 'enabled' && control !== 'disabled')
            throw new Error('--control must be production, enabled or disabled');
        const result = createExperiment(ws, {
            slot,
            parent,
            platforms: platforms ?? [],
            cohorts: parseCohorts(values.cohorts),
            rollout: parsePercent(values.rollout, '--rollout'),
            minVersions: parseVersions(values['min-version'], '--min-version'),
            description: values.description,
            enableFeatures: values['enable-feature'].split(',').filter(Boolean),
            control,
            patches: parsePatches(values.patch),
        });
        console.log(result.report);
        warnings = result.warnings;
        if (result.check.enableFeatures.length > 0) {
            await checkBuiltLoads(ws, result.check);
            console.log('\nThe built config gives the same result.');
        }
    } else if (command === 'rollout') {
        const percent = parsePercent(values.percent, '--percent');
        if (percent === undefined) throw new Error('rollout needs --percent');
        warnings = appendRolloutStep(ws, { parent, slot, percent, allowDecrease: values['allow-decrease'], platforms });
    } else if (command === 'disable') {
        setSubfeatureState(ws, { parent, slot, state: 'disabled', platforms });
    } else {
        console.log(removeExperiment(ws, parent, slot, { ship: values.ship }).join('\n'));
    }

    for (const warning of warnings) console.warn(`Warning: ${warning}`);
    console.log(
        `\n${values['dry-run'] ? 'Would change' : 'Changed'}: ${
            [
                ...ws.changed,
            ].join(', ') || 'nothing'
        }`,
    );
    if (!values['dry-run']) await ws.flush();
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}
