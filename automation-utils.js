import fs from 'fs';
import path from 'path';
import { immutableJSONPatch } from 'immutable-json-patch';
import tldts from 'tldts';

/**
 * Auto-approvable features configuration
 * Defines which features can be auto-approved and their allowed paths
 */
export const AUTO_APPROVABLE_FEATURES = {
    '/features/elementHiding': [
        '/settings/domains',
        '/exceptions',
    ],
    '/features/fingerprintingTemporaryStorage': [
        '/exceptions',
    ],
    '/features/fingerprintingAudio': [
        '/exceptions',
    ],
    '/features/fingerprintingBattery': [
        '/exceptions',
    ],
    '/features/fingerprintingCanvas': [
        '/exceptions',
    ],
    '/features/fingerprintingHardware': [
        '/exceptions',
    ],
    '/features/fingerprintingScreenSize': [
        '/exceptions',
    ],
    '/features/trackerAllowlist': [
        '/settings/allowlistedTrackers',
    ],
    '/features/gpc': [
        '/exceptions',
    ],
    '/features/webCompat': [
        '/exceptions',
    ],
    '/features/clickToLoad': [
        '/exceptions',
    ],
    '/features/eme': [
        '/exceptions',
    ],
    '/features/autoconsent': [
        '/exceptions',
        '/settings/disabledCMPs',
    ],
    '/features/customUserAgent': [
        '/exceptions',
        '/settings/ddgFixedSites',
        '/settings/omitApplicationSites',
        '/settings/defaultSites',
    ],
    '/features/mediaPlaybackRequiresUserGesture': [
        '/exceptions',
    ],
};

/**
 * Features whose settings carry per-site JSON patches in `settings.domains` and
 * `settings.conditionalChanges`.
 *
 * The diff reader indexes into each of these features as well as diffing from
 * the config root. Rather than reporting a per-site entry as an opaque array
 * element, each of its patchSettings operations is reported at the absolute
 * settings path it writes, tagged with the domains it is scoped to. Entries
 * that can reach beyond the sites they name are reported as-is so they need
 * review.
 *
 * The listed paths are the ones a domain-scoped patch may write and still be
 * auto-approved. They do not allow the same paths to be changed for every site.
 */
export const DOMAIN_PATCH_FEATURES = {
    '/features/autofill/features/siteSpecificFixes': [
        '/settings/formBoundarySelector',
        '/settings/formTypeSettings',
        '/settings/inputTypeSettings',
        '/settings/failsafeSettings',
    ],
};

/**
 * Settings keys holding per-site patch entries, and the key in each entry that
 * scopes it.
 */
const DOMAIN_PATCH_ENTRY_KEYS = {
    domains: 'domain',
    conditionalChanges: 'condition',
};

/**
 * Patch operations a per-site entry may use. `move` and `copy` read from
 * elsewhere in the settings and `test` is inert, so they are left for a human.
 */
const DOMAIN_PATCH_OPS = [
    'add',
    'replace',
    'remove',
];

/**
 * List of auto-approvable feature paths for summary generation
 */
export const AUTO_APPROVABLE_FEATURE_PATHS = Object.keys(AUTO_APPROVABLE_FEATURES);

/**
 * Checks whether a path is the given path or sits beneath it
 * @param {string} patchPath - The path to check
 * @param {string} parentPath - The path it may sit under
 * @returns {boolean} True if patchPath is parentPath or one of its descendants
 */
function isPathWithin(patchPath, parentPath) {
    return patchPath === parentPath || patchPath.startsWith(parentPath + '/');
}

/**
 * Finds the most specific feature path a patch path belongs to, so a nested
 * feature takes precedence over its parent.
 * @param {string} patchPath - The patch path to look up
 * @param {string[]} featurePaths - Candidate feature paths
 * @returns {string|undefined} The matching feature path
 */
function findFeaturePath(patchPath, featurePaths) {
    return featurePaths.filter((featurePath) => isPathWithin(patchPath, featurePath)).sort((a, b) => b.length - a.length)[0];
}

/**
 * Checks if a patch path is allowed for auto-approval
 * @param {string} patchPath - The patch path to check
 * @param {string} featurePath - The feature path this patch belongs to
 * @param {Object<string, string[]>} [allowlist] - Allowed paths keyed by feature path
 * @returns {boolean} True if the path is allowed for auto-approval
 */
export function isPathAllowedForFeature(patchPath, featurePath, allowlist = AUTO_APPROVABLE_FEATURES) {
    const allowedPaths = allowlist[featurePath];
    if (!allowedPaths) {
        return false;
    }

    // Use exact path matching or path starts with allowed path
    return allowedPaths.some((allowedPath) => isPathWithin(patchPath, featurePath + allowedPath));
}

/**
 * Checks if a single patch is allowed for auto-approval. Patches indexed from a
 * per-site entry carry a `domain` and are checked against DOMAIN_PATCH_FEATURES;
 * all others are checked against AUTO_APPROVABLE_FEATURES.
 * @param {Object} patch - A JSON patch, optionally tagged with `domain`
 * @returns {boolean} True if the patch is allowed for auto-approval
 */
export function isPatchAllowed(patch) {
    const allowlist = patch.domain ? DOMAIN_PATCH_FEATURES : AUTO_APPROVABLE_FEATURES;
    const featurePath = findFeaturePath(patch.path, Object.keys(allowlist));
    return !!featurePath && isPathAllowedForFeature(patch.path, featurePath, allowlist);
}

/**
 * Reads all files in a directory recursively and returns them as an object
 * @param {string} directory - The directory path to read
 * @returns {Object} Object with file paths as keys and file contents as values
 */
export function readFilesRecursively(directory) {
    const filenames = fs.readdirSync(directory);
    const files = {};

    filenames.forEach((filename) => {
        const filePath = path.join(directory, filename);
        const fileStats = fs.statSync(filePath);

        if (fileStats.isDirectory()) {
            const nestedFiles = readFilesRecursively(filePath);
            for (const [
                nestedFilePath,
                nestedFileContent,
            ] of Object.entries(nestedFiles)) {
                files[path.join(filename, nestedFilePath)] = nestedFileContent;
            }
        } else {
            files[filename] = fs.readFileSync(filePath, 'utf-8');
        }
    });

    return files;
}

/**
 * Removes superfluous info from the file contents to improve diff readability
 * @param {string} fileContent - The raw file content
 * @param {string} filePath - The file path (used to determine file type)
 * @returns {string} The cleaned file content
 */
export function mungeFileContents(fileContent, filePath) {
    if (filePath.endsWith('.json')) {
        const fileJSON = JSON.parse(fileContent);
        delete fileJSON.version;
        if ('features' in fileJSON) {
            for (const key of Object.keys(fileJSON.features)) {
                if ('hash' in fileJSON.features[key]) {
                    delete fileJSON.features[key].hash;
                }
            }
        }
        return JSON.stringify(fileJSON, null, 4);
    }
    return fileContent;
}

/**
 * Checks if changes are only to allowed paths in auto-approvable features
 * @param {Array} patches - Array of JSON patches from fast-json-patch
 * @returns {boolean} True if changes are only to allowed paths
 */
export function isAllowedChangesOnly(patches) {
    return patches.every(isPatchAllowed);
}

/**
 * Analyzes patches to determine if they should be auto-approved
 * @param {Array} patches - Array of JSON patches from fast-json-patch
 * @returns {Object} Analysis result with approval status and reasoning
 */
export function analyzePatchesForApproval(patches) {
    if (patches.length === 0) {
        return {
            shouldApprove: false,
            reason: 'No changes detected',
        };
    }

    // Check if changes are only to auto-approvable allowed paths
    if (isAllowedChangesOnly(patches)) {
        return {
            shouldApprove: true,
            reason: 'Auto-approved: Changes only to auto-approvable feature domains/exceptions',
        };
    }

    // Check if any changes are outside allowed paths
    const disallowedPatches = patches.filter((patch) => !isPatchAllowed(patch));

    // This case covers changes to non-auto-approvable features
    return {
        shouldApprove: false,
        reason: 'Manual review required: Changes to disallowed paths',
        disallowedPatches,
    };
}

/**
 * Generates a summary of changes for reporting
 * @param {Array} patches - Array of JSON patches from fast-json-patch
 * @returns {Object} Summary of changes by operation type and path
 */
export function generateChangeSummary(patches) {
    const summary = {
        total: patches.length,
        byOperation: {},
        byPath: {},
        autoApprovableChanges: 0,
        otherChanges: 0,
    };

    patches.forEach((patch) => {
        // Count by operation
        summary.byOperation[patch.op] = (summary.byOperation[patch.op] || 0) + 1;

        // Count by path
        const pathKey = patch.path.split('/').slice(0, 3).join('/'); // Top 3 levels
        summary.byPath[pathKey] = (summary.byPath[pathKey] || 0) + 1;

        // Count auto-approvable vs other changes
        if (isPatchAllowed(patch)) {
            summary.autoApprovableChanges++;
        } else {
            summary.otherChanges++;
        }
    });

    return summary;
}

/**
 * Checks if a feature has conditionalChanges
 * @param {Object} feature - The feature object to check
 * @returns {boolean} True if the feature has conditionalChanges
 */
export function hasConditionalChanges(feature) {
    return !!feature?.settings?.conditionalChanges;
}

/**
 * Applies conditionalChanges patches to feature settings
 * @param {Object} feature - The feature object containing settings and conditionalChanges
 * @returns {Object|false} The feature settings after applying all conditionalChanges patches, or false on error
 */
export function applyConditionalChanges(feature) {
    if (!hasConditionalChanges(feature)) {
        return feature.settings;
    }

    let patchedSettings = feature.settings;

    for (const change of feature.settings.conditionalChanges) {
        if (change.patchSettings) {
            try {
                patchedSettings = immutableJSONPatch(patchedSettings, change.patchSettings);
            } catch (error) {
                console.warn(`Failed to apply conditionalChanges patch: ${error.message}`);
                return false;
            }
        }
    }

    return patchedSettings;
}

/**
 * Applies conditionalChanges patches to all features in a config object
 * @param {Object} config - The config object containing features
 * @returns {Object|false} The config object with all conditionalChanges patches applied, or false on error
 */
export function applyConditionalChangesToConfig(config) {
    if (!config?.features) {
        return config;
    }

    const patchedConfig = JSON.parse(JSON.stringify(config));

    for (const [
        featureName,
        feature,
    ] of Object.entries(patchedConfig.features)) {
        // Per-site patches on these features are reported by indexDomainPatches instead.
        if (`/features/${featureName}` in DOMAIN_PATCH_FEATURES) {
            continue;
        }
        if (hasConditionalChanges(feature)) {
            const patchedSettings = applyConditionalChanges(feature);
            if (patchedSettings === false) {
                return false;
            }
            patchedConfig.features[featureName] = {
                ...feature,
                settings: patchedSettings,
            };
        }
    }

    return patchedConfig;
}

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (isPlainObject(value)) {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
}

/**
 * Resolves a JSON pointer against an object
 * @param {Object} obj - The object to read from
 * @param {string} pointer - A JSON pointer such as `/features/autofill`
 * @returns {*} The value at the pointer, or undefined if it does not exist
 */
export function getAtPath(obj, pointer) {
    if (pointer === '') {
        return obj;
    }
    return pointer
        .slice(1)
        .split('/')
        .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
        .reduce((node, segment) => (node && typeof node === 'object' ? node[segment] : undefined), obj);
}

/**
 * Checks that a domain names a specific site.
 *
 * Clients match domains as a hostname suffix, so a public suffix such as `com`,
 * `co.uk` or `github.io` would apply a patch to every site under it.
 * `localhost` is allowed because fixes conventionally target it for testing.
 * @param {unknown} domain - The domain to check
 * @returns {boolean} True when the domain is safe to treat as a single site
 */
export function isScopableDomain(domain) {
    if (typeof domain !== 'string') {
        return false;
    }
    if (domain === 'localhost') {
        return true;
    }
    const parsed = tldts.parse(domain, { allowPrivateDomains: true });
    return parsed.hostname === domain && (parsed.isIcann || parsed.isPrivate) && parsed.domain !== null;
}

/**
 * Extracts the domains a per-site patch entry is scoped to.
 *
 * `domains` entries match their `domain` value. `conditionalChanges` entries
 * are only treated as scoped when every condition block is a single `domain`
 * string; any other condition (urlPattern, experiment, internal, ...) can match
 * sites the entry does not name.
 * @param {unknown} entry - An entry from `settings.domains` or `settings.conditionalChanges`
 * @param {string} entryKey - Which of those settings keys the entry came from
 * @returns {string[]|null} The domains the entry applies to, or null when it is not domain-scoped
 */
export function getScopedDomains(entry, entryKey) {
    const scopeKey = DOMAIN_PATCH_ENTRY_KEYS[entryKey];
    if (!isPlainObject(entry) || !Object.keys(entry).every((key) => key === scopeKey || key === 'patchSettings')) {
        return null;
    }

    let domains;
    if (entryKey === 'domains') {
        domains = Array.isArray(entry.domain)
            ? entry.domain
            : [
                  entry.domain,
              ];
    } else {
        const blocks = Array.isArray(entry.condition)
            ? entry.condition
            : [
                  entry.condition,
              ];
        if (!blocks.every((block) => isPlainObject(block) && Object.keys(block).length === 1 && 'domain' in block)) {
            return null;
        }
        domains = blocks.map((block) => block.domain);
    }

    if (domains.length === 0 || !domains.every(isScopableDomain)) {
        return null;
    }
    return domains;
}

/**
 * Checks that every patchSettings operation writes a single settings path,
 * so the path it reports is the only thing it can change.
 * @param {unknown} patchSettings - The operations from a per-site entry
 * @returns {boolean} True when every operation can be reported by its path
 */
function hasIndexablePatchOperations(patchSettings) {
    return (
        Array.isArray(patchSettings) &&
        patchSettings.length > 0 &&
        patchSettings.every(
            (operation) =>
                isPlainObject(operation) &&
                DOMAIN_PATCH_OPS.includes(operation.op) &&
                typeof operation.path === 'string' &&
                operation.path.startsWith('/') &&
                operation.path !== '/',
        )
    );
}

/**
 * Pairs up identical entries between two arrays, ignoring order, and returns
 * the ones left over on each side.
 * @param {Array} baseEntries - Entries before the change
 * @param {Array} updatedEntries - Entries after the change
 * @returns {Array<{change: 'add'|'remove', entry: *, index: number}>} The added and removed entries
 */
function diffEntries(baseEntries, updatedEntries) {
    const countHashes = (entries) => {
        const counts = new Map();
        for (const entry of entries) {
            const hash = stableStringify(entry);
            counts.set(hash, (counts.get(hash) || 0) + 1);
        }
        return counts;
    };
    const collectUnmatched = (entries, otherCounts, change) =>
        entries.flatMap((entry, index) => {
            const hash = stableStringify(entry);
            if (otherCounts.get(hash) > 0) {
                otherCounts.set(hash, otherCounts.get(hash) - 1);
                return [];
            }
            return [
                { change, entry, index },
            ];
        });

    return [
        ...collectUnmatched(baseEntries, countHashes(updatedEntries), 'remove'),
        ...collectUnmatched(updatedEntries, countHashes(baseEntries), 'add'),
    ];
}

/**
 * Indexes into each feature in DOMAIN_PATCH_FEATURES so its per-site patch
 * entries are reported by what they write.
 *
 * Patches the root diff produced inside `settings.domains` and
 * `settings.conditionalChanges` of those features are replaced. Each added or
 * removed entry that is scoped to specific domains and uses plain
 * add/replace/remove operations becomes one patch per operation, at the
 * absolute path that operation writes and tagged with its `domain`. Any other
 * entry is reported at its array index so it needs review.
 *
 * @param {Array} patches - Patches from diffing the configs from the root
 * @param {Object} baseConfig - The config before the change
 * @param {Object} updatedConfig - The config after the change
 * @returns {Array} The root patches with per-site entries indexed
 */
export function indexDomainPatches(patches, baseConfig, updatedConfig) {
    const indexedPaths = [];
    const indexedPatches = [];

    for (const featurePath of Object.keys(DOMAIN_PATCH_FEATURES)) {
        const baseSettings = getAtPath(baseConfig, featurePath)?.settings;
        const updatedSettings = getAtPath(updatedConfig, featurePath)?.settings;

        for (const entryKey of Object.keys(DOMAIN_PATCH_ENTRY_KEYS)) {
            const baseEntries = baseSettings?.[entryKey] ?? [];
            const updatedEntries = updatedSettings?.[entryKey] ?? [];
            // Anything that is not an array is left to the root diff.
            if (!Array.isArray(baseEntries) || !Array.isArray(updatedEntries)) {
                continue;
            }

            const entriesPath = `${featurePath}/settings/${entryKey}`;
            indexedPaths.push(entriesPath);

            for (const { change, entry, index } of diffEntries(baseEntries, updatedEntries)) {
                const domains = getScopedDomains(entry, entryKey);
                if (domains && hasIndexablePatchOperations(entry.patchSettings)) {
                    for (const operation of entry.patchSettings) {
                        indexedPatches.push({
                            op: change === 'add' ? operation.op : 'remove',
                            path: `${featurePath}/settings${operation.path}`,
                            domain: domains.join(', '),
                        });
                    }
                } else if (change === 'add') {
                    indexedPatches.push({ op: 'add', path: `${entriesPath}/${index}`, value: entry });
                } else {
                    indexedPatches.push({ op: 'remove', path: `${entriesPath}/${index}` });
                }
            }
        }
    }

    return [
        ...patches.filter((patch) => !indexedPaths.some((indexedPath) => isPathWithin(patch.path, indexedPath))),
        ...indexedPatches,
    ];
}
