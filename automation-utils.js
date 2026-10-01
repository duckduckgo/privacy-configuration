import fs from 'fs';
import path from 'path';
import { immutableJSONPatch } from 'immutable-json-patch';
import pkg from 'fast-json-patch';

const { compare } = pkg;

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
 * List of auto-approvable feature paths for summary generation
 */
export const AUTO_APPROVABLE_FEATURE_PATHS = Object.keys(AUTO_APPROVABLE_FEATURES);

/**
 * Checks if a patch path is allowed for auto-approval
 * @param {string} patchPath - The patch path to check
 * @param {string} featurePath - The feature path this patch belongs to
 * @returns {boolean} True if the path is allowed for auto-approval
 */
export function isPathAllowedForFeature(patchPath, featurePath) {
    const allowedPaths = AUTO_APPROVABLE_FEATURES[featurePath];
    if (!allowedPaths) {
        return false;
    }

    // Use exact path matching or path starts with allowed path
    return allowedPaths.some((allowedPath) => {
        const fullAllowedPath = featurePath + allowedPath;
        if (patchPath === fullAllowedPath || patchPath.startsWith(fullAllowedPath + '/')) {
            return true;
        }
        return false;
    });
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
    // Check if all patches are for auto-approvable features and allowed paths
    return patches.every((patch) => {
        // Find which auto-approvable feature this patch belongs to
        const featurePath = AUTO_APPROVABLE_FEATURE_PATHS.find((feature) => patch.path.startsWith(feature));

        if (!featurePath) {
            return false; // Not an auto-approvable feature
        }

        // Check if the path is in the allowed list for this feature
        return isPathAllowedForFeature(patch.path, featurePath);
    });
}

/**
 * Path of the autofill siteSpecificFixes subfeature within a generated config.
 *
 * This subfeature is not listed in AUTO_APPROVABLE_FEATURES because a path
 * allowlist cannot express what makes one of its changes safe. Its entries hold
 * arbitrary JSON patch operations that are only applied at runtime, so the path
 * of the change says nothing about its effect. It is evaluated by
 * evaluateSiteSpecificFixesChange instead.
 */
export const SITE_SPECIFIC_FIXES_PATH = '/features/autofill/features/siteSpecificFixes';

/**
 * Settings keys a site-scoped autofill fix is allowed to affect.
 */
export const SITE_SPECIFIC_FIXES_ALLOWED_KEYS = [
    'formBoundarySelector',
    'formTypeSettings',
    'inputTypeSettings',
    'failsafeSettings',
];

/**
 * Condition keys that keep a conditionalChanges entry scoped to named domains.
 * Anything else (urlPattern, experiment, internal, preview, ...) can widen the
 * change beyond the sites listed in the PR, so it is left for a human.
 */
const DOMAIN_SCOPED_CONDITION_KEYS = [
    'domain',
];

/**
 * Patch operations a site fix may use. `move` and `copy` read from elsewhere in
 * the settings and `test` is inert, so they are left for a human.
 */
const SUPPORTED_PATCH_OPS = [
    'add',
    'replace',
    'remove',
];

function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `"${key}":${stableStringify(value[key])}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
}

function getSiteSpecificFixesSettings(config) {
    return config?.features?.autofill?.features?.siteSpecificFixes?.settings;
}

/**
 * Returns the settings a conditionalChanges entry is patched against, i.e. the
 * subfeature defaults without the conditional entries themselves.
 */
function getBaselineSettings(settings) {
    const baseline = { ...settings };
    delete baseline.conditionalChanges;
    return baseline;
}

/**
 * Extracts the domains a condition is scoped to, or null when the condition can
 * match sites that are not named in it.
 * @param {Object|Array} condition - A conditionalChanges condition block or array of blocks
 * @returns {string[]|null} The domains matched, or null when not domain-scoped
 */
export function getScopedDomains(condition) {
    const blocks = Array.isArray(condition)
        ? condition
        : [
              condition,
          ];
    if (blocks.length === 0) {
        return null;
    }

    const domains = [];
    for (const block of blocks) {
        if (!block || typeof block !== 'object' || Array.isArray(block)) {
            return null;
        }
        const keys = Object.keys(block);
        if (keys.length === 0 || !keys.every((key) => DOMAIN_SCOPED_CONDITION_KEYS.includes(key))) {
            return null;
        }
        const blockDomains = Array.isArray(block.domain)
            ? block.domain
            : [
                  block.domain,
              ];
        if (!blockDomains.length || !blockDomains.every((domain) => typeof domain === 'string' && domain.length > 0)) {
            return null;
        }
        domains.push(...blockDomains);
    }

    return domains;
}

/**
 * Checks the shape of a conditionalChanges entry's operations.
 *
 * immutable-json-patch is permissive: replacing a path that does not exist, or
 * removing a key that is absent, silently succeeds. Applying a patch therefore
 * cannot be the only check, or a fix that quietly does nothing would look the
 * same as one that works.
 *
 * @param {Array} patchSettings - The operations from a conditionalChanges entry
 * @returns {string[]} Problems found, empty when the operations look sound
 */
export function validatePatchOperations(patchSettings) {
    if (!Array.isArray(patchSettings) || patchSettings.length === 0) {
        return [
            'has no patchSettings operations',
        ];
    }

    const problems = [];
    for (const operation of patchSettings) {
        if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
            problems.push('has an operation that is not an object');
            continue;
        }
        if (!SUPPORTED_PATCH_OPS.includes(operation.op)) {
            problems.push(`uses the unsupported op \`${operation.op}\``);
            continue;
        }
        if (typeof operation.path !== 'string' || operation.path === '' || operation.path === '/') {
            problems.push('replaces the entire settings object');
            continue;
        }
        const touchedKey = operation.path.split('/')[1];
        if (!SITE_SPECIFIC_FIXES_ALLOWED_KEYS.includes(touchedKey)) {
            problems.push(`writes \`${operation.path}\`, which is outside the site-fix settings`);
        }
    }

    return problems;
}

/**
 * Applies a conditionalChanges entry's patchSettings, reporting failures rather
 * than throwing so malformed patches can be surfaced as review reasons.
 */
function applyPatchSettings(settings, patchSettings) {
    if (!Array.isArray(patchSettings)) {
        return { ok: false, error: 'patchSettings is not an array' };
    }
    try {
        return { ok: true, settings: immutableJSONPatch(settings, patchSettings) };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

/**
 * Builds the settings each domain actually ends up with, by applying every
 * conditionalChanges entry that targets it in order. Entries that are not
 * domain-scoped are applied to every domain, since they can match anywhere.
 */
function computeEffectiveSettingsByDomain(settings) {
    const baseline = getBaselineSettings(settings);
    const entries = Array.isArray(settings?.conditionalChanges) ? settings.conditionalChanges : [];

    const domains = new Set();
    for (const entry of entries) {
        for (const domain of getScopedDomains(entry?.condition) || []) {
            domains.add(domain);
        }
    }

    const byDomain = {};
    const failures = [];

    for (const domain of domains) {
        let effective = baseline;
        for (const entry of entries) {
            const scopedDomains = getScopedDomains(entry?.condition);
            const applies = scopedDomains === null || scopedDomains.includes(domain);
            if (!applies || !entry?.patchSettings) {
                continue;
            }
            const result = applyPatchSettings(effective, entry.patchSettings);
            if (!result.ok) {
                failures.push(`patch for \`${domain}\` failed to apply: ${result.error}`);
                break;
            }
            effective = result.settings;
        }
        byDomain[domain] = effective;
    }

    return { baseline, byDomain, failures };
}

/**
 * Decides whether autofill siteSpecificFixes changes are safe to auto-approve.
 *
 * Rather than trusting the shape of the diff, this applies the conditional
 * patches and inspects what they actually do: the subfeature defaults must be
 * untouched, every new or edited entry must be scoped to named domains and
 * apply cleanly, and the resulting per-domain settings may only differ in the
 * site-fix keys.
 *
 * @param {Object} baseConfig - The generated config before the change
 * @param {Object} updatedConfig - The generated config after the change
 * @returns {Object} Result with approval status and the reasons review is needed
 */
export function evaluateSiteSpecificFixesChange(baseConfig, updatedConfig) {
    const baseSettings = getSiteSpecificFixesSettings(baseConfig);
    const updatedSettings = getSiteSpecificFixesSettings(updatedConfig);

    if (!baseSettings || !updatedSettings) {
        return {
            approved: false,
            reasons: [
                'siteSpecificFixes settings could not be read from both configs',
            ],
        };
    }

    const reasons = [];

    // The defaults apply to every site, so any change to them needs a human.
    const baselineChanges = compare(getBaselineSettings(baseSettings), getBaselineSettings(updatedSettings));
    if (baselineChanges.length > 0) {
        reasons.push(`siteSpecificFixes defaults changed: ${baselineChanges.map((change) => `\`${change.path || '/'}\``).join(', ')}`);
    }

    // Only entries the PR introduces or edits are held to the scoping rules;
    // entries already on the base branch were reviewed when they landed.
    const baseEntries = Array.isArray(baseSettings.conditionalChanges) ? baseSettings.conditionalChanges : [];
    const updatedEntries = Array.isArray(updatedSettings.conditionalChanges) ? updatedSettings.conditionalChanges : [];
    const baseEntryHashes = new Set(baseEntries.map(stableStringify));

    const updatedBaseline = getBaselineSettings(updatedSettings);
    for (const entry of updatedEntries) {
        if (baseEntryHashes.has(stableStringify(entry))) {
            continue;
        }
        const scopedDomains = getScopedDomains(entry?.condition);
        if (scopedDomains === null) {
            reasons.push(`new conditionalChanges entry is not scoped to specific domains: \`${stableStringify(entry?.condition)}\``);
            continue;
        }

        const label = scopedDomains.join(', ');
        const problems = validatePatchOperations(entry?.patchSettings);
        if (problems.length > 0) {
            reasons.push(...problems.map((problem) => `new conditionalChanges entry for \`${label}\` ${problem}`));
            continue;
        }

        const result = applyPatchSettings(updatedBaseline, entry.patchSettings);
        if (!result.ok) {
            reasons.push(`new conditionalChanges entry for \`${label}\` is malformed: ${result.error}`);
            continue;
        }
        if (compare(updatedBaseline, result.settings).length === 0) {
            reasons.push(`new conditionalChanges entry for \`${label}\` does not change anything, so the fix would be inert`);
        }
    }

    // Compare what each domain actually resolves to before and after.
    const baseEffective = computeEffectiveSettingsByDomain(baseSettings);
    const updatedEffective = computeEffectiveSettingsByDomain(updatedSettings);
    reasons.push(...baseEffective.failures, ...updatedEffective.failures);

    const allDomains = new Set([
        ...Object.keys(baseEffective.byDomain),
        ...Object.keys(updatedEffective.byDomain),
    ]);

    for (const domain of allDomains) {
        const before = baseEffective.byDomain[domain] ?? baseEffective.baseline;
        const after = updatedEffective.byDomain[domain] ?? updatedEffective.baseline;
        for (const change of compare(before, after)) {
            const touchedKey = change.path.split('/')[1];
            if (!SITE_SPECIFIC_FIXES_ALLOWED_KEYS.includes(touchedKey)) {
                reasons.push(`change for \`${domain}\` affects \`${change.path || '/'}\`, which is outside the site-fix settings`);
            }
        }
    }

    return { approved: reasons.length === 0, reasons };
}

/**
 * Analyzes patches to determine if they should be auto-approved
 * @param {Array} patches - Array of JSON patches from fast-json-patch
 * @param {Object} [context] - The generated configs the patches were derived from
 * @param {Object} [context.baseConfig] - The config before the change
 * @param {Object} [context.updatedConfig] - The config after the change
 * @returns {Object} Analysis result with approval status and reasoning
 */
export function analyzePatchesForApproval(patches, context = {}) {
    if (patches.length === 0) {
        return {
            shouldApprove: false,
            reason: 'No changes detected',
        };
    }

    const siteSpecificFixesPatches = patches.filter((patch) => patch.path.startsWith(SITE_SPECIFIC_FIXES_PATH));
    const remainingPatches = patches.filter((patch) => !patch.path.startsWith(SITE_SPECIFIC_FIXES_PATH));

    let siteSpecificFixesReasons = [];
    if (siteSpecificFixesPatches.length > 0) {
        if (!context.baseConfig || !context.updatedConfig) {
            siteSpecificFixesReasons = [
                'siteSpecificFixes changes cannot be evaluated without both configs',
            ];
        } else {
            siteSpecificFixesReasons = evaluateSiteSpecificFixesChange(context.baseConfig, context.updatedConfig).reasons;
        }
    }

    // Check if changes are only to auto-approvable allowed paths
    if (isAllowedChangesOnly(remainingPatches) && siteSpecificFixesReasons.length === 0) {
        return {
            shouldApprove: true,
            reason: 'Auto-approved: Changes only to auto-approvable feature domains/exceptions',
        };
    }

    // Check if any changes are outside allowed paths
    const disallowedPatches = [];
    for (const patch of remainingPatches) {
        const featurePath = AUTO_APPROVABLE_FEATURE_PATHS.find((feature) => patch.path.startsWith(feature));
        const isDisallowed = featurePath ? !isPathAllowedForFeature(patch.path, featurePath) : true;
        if (isDisallowed) {
            disallowedPatches.push(patch);
        }
    }
    if (siteSpecificFixesReasons.length > 0) {
        disallowedPatches.push(...siteSpecificFixesPatches);
    }

    // This case covers changes to non-auto-approvable features
    return {
        shouldApprove: false,
        reason: 'Manual review required: Changes to disallowed paths',
        disallowedPatches,
        siteSpecificFixesReasons,
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
        const featurePath = AUTO_APPROVABLE_FEATURE_PATHS.find((feature) => patch.path.startsWith(feature));
        if (featurePath && isPathAllowedForFeature(patch.path, featurePath)) {
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
