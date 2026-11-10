/**
 * Evaluate feature settings conditional changes as content-scope-scripts does, for a given client.
 */

import { immutableJSONPatch } from 'immutable-json-patch';

/**
 * @typedef {'android' | 'ios' | 'macos' | 'windows' | 'extension'} Platform
 * @typedef {string | number} Version
 *
 * @typedef {object} ConditionBlock
 * @property {string} [injectName]
 * @property {Version} [minSupportedVersion]
 * @property {Version} [maxSupportedVersion]
 * @property {{ experimentName: string, cohort: string }} [experiment]
 *
 * @typedef {import('immutable-json-patch').JSONPatchDocument} PatchSettings
 * @typedef {{ condition: ConditionBlock | ConditionBlock[], patchSettings: PatchSettings }} ConditionalChange
 *
 * @typedef {object} Client
 * @property {string} injectName
 * @property {Version | undefined} version
 * @property {Record<string, string>} cohorts - assigned cohort by experiment name
 */

/** @type {Platform[]} */
export const PLATFORMS = [
    'android',
    'ios',
    'macos',
    'windows',
    'extension',
];

/**
 * Every C-S-S bundle each platform injects. iOS and macOS share the Apple bundles and are told apart by
 * version family.
 *
 * @type {Record<Platform, string[]>}
 */
export const PLATFORM_INJECT_NAMES = {
    android: [
        'android',
        'android-adsjs',
    ],
    ios: [
        'apple',
        'apple-isolated',
    ],
    macos: [
        'apple',
        'apple-isolated',
    ],
    windows: [
        'windows',
    ],
    extension: [
        'chrome-mv3',
        'firefox',
    ],
};

/**
 * The lowest version that reads content scope experiments, on platforms where it is above the first version
 * with C-S-S conditional changes.
 *
 * @type {Partial<Record<Platform, Version>>}
 */
export const EXPERIMENTS_MIN_VERSION = {
    windows: '0.178.0',
};

/**
 * Compare versions as C-S-S does: numbers numerically, strings part by part.
 *
 * @param {Version} a
 * @param {Version} b
 * @returns {number} negative, zero or positive as `a` is lower, equal or higher
 */
export function compareVersions(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    const partsA = String(a).split('.').map(Number);
    const partsB = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const diff = (partsA[i] || 0) - (partsB[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

/**
 * Versions in the same family are comparable: both numbers, or strings with the same major part. iOS
 * (7.x) and macOS (1.x) share the Apple bundles and are told apart by family.
 *
 * @param {Version} a
 * @param {Version} b
 */
export function sameVersionFamily(a, b) {
    if (typeof a === 'number' || typeof b === 'number') return typeof a === typeof b;
    return a.split('.')[0] === b.split('.')[0];
}

/**
 * @param {Version} a
 * @param {Version} b
 */
export function maxVersion(a, b) {
    return compareVersions(a, b) >= 0 ? a : b;
}

/**
 * Match a condition as C-S-S does. Blocks scoped to a domain, URL pattern, frame context, internal or
 * preview build never match, so the result is the state on an arbitrary page in a release build.
 *
 * @param {ConditionBlock | ConditionBlock[]} condition
 * @param {Client} client
 */
export function matchCondition(condition, client) {
    return conditionBlocks({ condition }).some((block) => matchBlock(block, client));
}

/**
 * @param {ConditionBlock} block
 * @param {Client} client
 */
function matchBlock(block, client) {
    for (const key of Object.keys(block)) {
        if (
            ![
                'injectName',
                'minSupportedVersion',
                'maxSupportedVersion',
                'experiment',
            ].includes(key)
        )
            return false;
    }
    const { injectName, minSupportedVersion, maxSupportedVersion, experiment } = block;
    const { version } = client;
    if (injectName !== undefined && injectName !== client.injectName) return false;
    if (minSupportedVersion !== undefined) {
        if (version === undefined || typeof version !== typeof minSupportedVersion) return false;
        if (compareVersions(version, minSupportedVersion) < 0) return false;
    }
    if (maxSupportedVersion !== undefined) {
        if (version === undefined || typeof version !== typeof maxSupportedVersion) return false;
        if (compareVersions(version, maxSupportedVersion) > 0) return false;
    }
    if (experiment !== undefined && client.cohorts[experiment.experimentName] !== experiment.cohort) return false;
    return true;
}

/**
 * Apply the matching conditional changes in order. A block whose patch fails is skipped, as in C-S-S.
 *
 * @template {{ conditionalChanges?: ConditionalChange[] }} Settings
 * @param {Settings} settings
 * @param {Client} client
 * @returns {{ settings: Settings, failed: ConditionalChange[] }}
 */
export function applyConditionalChanges(settings, client) {
    let current = settings;
    /** @type {ConditionalChange[]} */
    const failed = [];
    for (const change of settings.conditionalChanges ?? []) {
        if (!matchCondition(change.condition, client)) continue;
        try {
            current = immutableJSONPatch(current, change.patchSettings);
        } catch {
            failed.push(change);
        }
    }
    return { settings: current, failed };
}

/**
 * The condition blocks of a conditional change.
 *
 * @param {{ condition: ConditionBlock | ConditionBlock[] }} change
 * @returns {ConditionBlock[]}
 */
export function conditionBlocks(change) {
    return Array.isArray(change.condition)
        ? change.condition
        : [
              change.condition,
          ];
}
