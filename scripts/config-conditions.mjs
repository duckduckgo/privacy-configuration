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
 * @property {string | string[]} [domain]
 * @property {unknown} [urlPattern]
 * @property {{ top?: boolean, frame?: boolean }} [context]
 * @property {boolean} [internal]
 * @property {boolean} [preview]
 * @property {string} [minContentScopeScriptsVersion]
 * @property {string} [maxContentScopeScriptsVersion]
 *
 * @typedef {import('immutable-json-patch').JSONPatchDocument} PatchSettings
 * @typedef {{ condition?: ConditionBlock | ConditionBlock[], domain?: string | string[], patchSettings?: PatchSettings }} ConditionalChange
 *
 * @typedef {object} Client
 * @property {string} injectName
 * @property {Version | undefined} version
 * @property {Record<string, string>} cohorts - assigned cohort by experiment name
 * @property {string} [domain] - the page's hostname
 * @property {string} [urlPattern] - the `urlPattern` the page's URL matches, as JSON writes it
 * @property {boolean} [frame] - whether the page is a subframe
 * @property {boolean} [internal] - whether the build is internal
 * @property {boolean} [preview] - whether the build is a preview
 * @property {string} [contentScopeScriptsVersion] - the C-S-S release
 *
 * A client that leaves a page, frame or build key undefined matches no block naming it: the state on
 * an arbitrary page in a release build.
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

/** A C-S-S release, which `minContentScopeScriptsVersion` and `maxContentScopeScriptsVersion` take. */
const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * Match a condition as C-S-S does.
 *
 * @param {ConditionBlock | ConditionBlock[]} condition
 * @param {Client} client
 */
export function matchCondition(condition, client) {
    return conditionBlocks({ condition }).some((block) => matchBlock(block, client));
}

/**
 * Whether a hostname is the domain or a subdomain of it, as C-S-S matches it.
 *
 * @param {string} hostname
 * @param {string} domain
 */
export function matchHostname(hostname, domain) {
    return hostname === domain || hostname.endsWith(`.${domain}`);
}

/**
 * How C-S-S matches each condition key. A block with a key not listed never matches.
 *
 * @type {Record<string, (block: ConditionBlock, client: Client) => boolean>}
 */
const CONDITION_CHECKS = {
    injectName: (block, client) => block.injectName === client.injectName,
    minSupportedVersion: ({ minSupportedVersion: min }, { version }) =>
        min !== undefined && version !== undefined && typeof version === typeof min && compareVersions(version, min) >= 0,
    maxSupportedVersion: ({ maxSupportedVersion: max }, { version }) =>
        max !== undefined && version !== undefined && typeof version === typeof max && compareVersions(version, max) <= 0,
    experiment: ({ experiment }, client) => experiment !== undefined && client.cohorts[experiment.experimentName] === experiment.cohort,
    // A list of domains never matches
    domain: ({ domain }, client) => typeof domain === 'string' && client.domain !== undefined && matchHostname(client.domain, domain),
    urlPattern: ({ urlPattern }, client) => client.urlPattern !== undefined && JSON.stringify(urlPattern) === client.urlPattern,
    context: ({ context }, { frame }) => frame !== undefined && Boolean(frame ? context?.frame : context?.top),
    internal: ({ internal }, client) => internal !== undefined && client.internal !== undefined && Boolean(internal) === client.internal,
    preview: ({ preview }, client) => preview !== undefined && client.preview !== undefined && Boolean(preview) === client.preview,
    minContentScopeScriptsVersion: ({ minContentScopeScriptsVersion: min }, { contentScopeScriptsVersion: version }) =>
        typeof min === 'string' && RELEASE_VERSION_PATTERN.test(min) && version !== undefined && compareVersions(version, min) >= 0,
    maxContentScopeScriptsVersion: ({ maxContentScopeScriptsVersion: max }, { contentScopeScriptsVersion: version }) =>
        typeof max === 'string' && RELEASE_VERSION_PATTERN.test(max) && version !== undefined && compareVersions(version, max) <= 0,
};

/**
 * @param {ConditionBlock} block
 * @param {Client} client
 */
function matchBlock(block, client) {
    return Object.keys(block).every((key) => Object.hasOwn(CONDITION_CHECKS, key) && CONDITION_CHECKS[key](block, client));
}

/**
 * The entries C-S-S matches against a client: `conditionalChanges` when settings have it, otherwise
 * `domains`. It never reads both.
 *
 * @param {{ conditionalChanges?: ConditionalChange[], domains?: ConditionalChange[] }} settings
 * @returns {ConditionalChange[]}
 */
export function conditionalEntries(settings) {
    return (settings.conditionalChanges ? settings.conditionalChanges : settings.domains) ?? [];
}

/**
 * The condition of an entry, with `domain` short for a block per domain. Null for an entry with
 * neither, which every client matches.
 *
 * @param {ConditionalChange} entry
 * @returns {ConditionBlock | ConditionBlock[] | null}
 */
export function entryCondition(entry) {
    if (entry.condition !== undefined) return entry.condition;
    if (entry.domain === undefined) return null;
    return Array.isArray(entry.domain) ? entry.domain.map((domain) => ({ domain })) : { domain: entry.domain };
}

/**
 * The JSON pointers an operation reads before it writes: the target of `replace`, `remove` and
 * `test`, and the `from` of `move` and `copy`.
 *
 * @param {import('immutable-json-patch').JSONPatchOperation} operation
 * @returns {string[]}
 */
function readPointers(operation) {
    switch (operation.op) {
        case 'replace':
        case 'remove':
        case 'test':
            return [
                operation.path,
            ];
        case 'move':
        case 'copy':
            return [
                operation.from,
            ];
        default:
            return [];
    }
}

/**
 * Whether a JSON pointer names a value in the document.
 *
 * @param {unknown} document
 * @param {string} pointer
 */
function pointerResolves(document, pointer) {
    let current = document;
    for (const segment of pointer.split('/').slice(1)) {
        const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
        if (Array.isArray(current)) {
            if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= current.length) return false;
            current = current[Number(key)];
        } else if (typeof current === 'object' && current !== null && Object.hasOwn(current, key)) {
            current = /** @type {Record<string, unknown>} */ (current)[key];
        } else {
            return false;
        }
    }
    return true;
}

/**
 * Apply the matching conditional changes in order. A block whose patch fails is skipped, as in C-S-S.
 *
 * With `requireTargets`, an operation reading a pointer that names no value, such as a `replace` at
 * a mistyped path, fails its block too. C-S-S applies such an operation as a no-op, which leaves the
 * block applied without the change it was written for.
 *
 * @template {{ conditionalChanges?: ConditionalChange[], domains?: ConditionalChange[] }} Settings
 * @param {Settings} settings
 * @param {Client} client
 * @param {{ requireTargets?: boolean }} [options]
 * @returns {{ settings: Settings, failed: ConditionalChange[] }}
 */
export function applyConditionalChanges(settings, client, { requireTargets = false } = {}) {
    let current = settings;
    /** @type {ConditionalChange[]} */
    const failed = [];
    for (const change of conditionalEntries(settings)) {
        const condition = entryCondition(change);
        if (condition !== null && !matchCondition(condition, client)) continue;
        try {
            let patched = current;
            for (const operation of change.patchSettings ?? []) {
                const missing = requireTargets ? readPointers(operation).find((pointer) => !pointerResolves(patched, pointer)) : undefined;
                if (missing !== undefined) throw new Error(`${operation.op} reads ${missing}, which names no value`);
                patched = immutableJSONPatch(patched, [
                    operation,
                ]);
            }
            current = patched;
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
