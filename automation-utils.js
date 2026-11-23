import fs from 'fs';
import path from 'path';
import { immutableJSONPatch } from 'immutable-json-patch';

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
 * Escapes a key for use as a JSON pointer segment
 * @param {string} key - The object key
 * @returns {string} The escaped segment
 */
function toPointerSegment(key) {
    return key.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Finds sub-feature rollouts whose only change is appending steps that raise the percentage.
 * Clients persist each step, so a raise must append; editing or removing a step needs review.
 * See docs/rollouts-and-experiments.md
 * @param {Object} baseConfig - The config before the change
 * @param {Object} updatedConfig - The config after the change
 * @returns {Set<string>} JSON pointers of `rollout/steps` arrays that only had raises appended
 */
export function findRolloutStepAppends(baseConfig, updatedConfig) {
    const appendedPaths = new Set();
    for (const [
        featureKey,
        feature,
    ] of Object.entries(updatedConfig?.features ?? {})) {
        for (const [
            subFeatureKey,
            subFeature,
        ] of Object.entries(feature?.features ?? {})) {
            const steps = subFeature?.rollout?.steps;
            const baseSteps = baseConfig?.features?.[featureKey]?.features?.[subFeatureKey]?.rollout?.steps;
            if (!Array.isArray(steps) || !Array.isArray(baseSteps) || baseSteps.length === 0 || steps.length <= baseSteps.length) {
                continue;
            }

            // Existing steps must be untouched
            if (!baseSteps.every((step, i) => JSON.stringify(step) === JSON.stringify(steps[i]))) {
                continue;
            }

            // Each new step must only set a percentage higher than the one before, up to 100
            let previousPercent = baseSteps[baseSteps.length - 1]?.percent;
            const onlyRaises = steps.slice(baseSteps.length).every((step) => {
                const isRaise =
                    Object.keys(step ?? {}).join() === 'percent' &&
                    typeof step.percent === 'number' &&
                    typeof previousPercent === 'number' &&
                    step.percent > previousPercent &&
                    step.percent <= 100;
                previousPercent = step.percent;
                return isRaise;
            });

            if (onlyRaises) {
                appendedPaths.add(`/features/${toPointerSegment(featureKey)}/features/${toPointerSegment(subFeatureKey)}/rollout/steps`);
            }
        }
    }
    return appendedPaths;
}

/**
 * Checks if a single patch is auto-approvable
 * @param {Object} patch - A JSON patch from fast-json-patch
 * @param {Set<string>} rolloutStepAppends - Paths from findRolloutStepAppends
 * @returns {boolean} True if the patch is auto-approvable
 */
function isPatchAutoApprovable(patch, rolloutStepAppends) {
    const featurePath = AUTO_APPROVABLE_FEATURE_PATHS.find((feature) => patch.path.startsWith(feature));
    if (featurePath && isPathAllowedForFeature(patch.path, featurePath)) {
        return true;
    }
    return [
        ...rolloutStepAppends,
    ].some((stepsPath) => patch.path === stepsPath || patch.path.startsWith(stepsPath + '/'));
}

/**
 * Checks if changes are only to allowed paths in auto-approvable features
 * @param {Array} patches - Array of JSON patches from fast-json-patch
 * @param {Set<string>} [rolloutStepAppends] - Paths from findRolloutStepAppends
 * @returns {boolean} True if changes are only to allowed paths
 */
export function isAllowedChangesOnly(patches, rolloutStepAppends = new Set()) {
    return patches.every((patch) => isPatchAutoApprovable(patch, rolloutStepAppends));
}

/**
 * Analyzes patches to determine if they should be auto-approved
 * @param {Array} patches - Array of JSON patches from fast-json-patch
 * @param {Set<string>} [rolloutStepAppends] - Paths from findRolloutStepAppends
 * @returns {Object} Analysis result with approval status and reasoning
 */
export function analyzePatchesForApproval(patches, rolloutStepAppends = new Set()) {
    if (patches.length === 0) {
        return {
            shouldApprove: false,
            reason: 'No changes detected',
        };
    }

    // Check if changes are only to auto-approvable allowed paths
    if (isAllowedChangesOnly(patches, rolloutStepAppends)) {
        return {
            shouldApprove: true,
            reason: 'Auto-approved: Changes only to auto-approvable feature domains/exceptions or rollout raises',
        };
    }

    // This case covers changes to non-auto-approvable features
    return {
        shouldApprove: false,
        reason: 'Manual review required: Changes to disallowed paths',
        disallowedPatches: patches.filter((patch) => !isPatchAutoApprovable(patch, rolloutStepAppends)),
    };
}

/**
 * Generates a summary of changes for reporting
 * @param {Array} patches - Array of JSON patches from fast-json-patch
 * @param {Set<string>} [rolloutStepAppends] - Paths from findRolloutStepAppends
 * @returns {Object} Summary of changes by operation type and path
 */
export function generateChangeSummary(patches, rolloutStepAppends = new Set()) {
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
        if (isPatchAutoApprovable(patch, rolloutStepAppends)) {
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
