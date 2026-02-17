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
    '/features/trackerAllowlist': ['/settings/allowlistedTrackers'],
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
    '/features/*': ['/exceptions'],
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

    // Handle wildcard patterns
    if (featurePath === '/features/*') {
        // Extract actual feature path from patch path
        const pathParts = patchPath.split('/');
        if (pathParts.length >= 3) {
            const actualFeaturePath = `/${pathParts[1]}/${pathParts[2]}`;

            // Check if remaining path matches allowed patterns
            return allowedPaths.some((allowedPath) => {
                const fullAllowedPath = actualFeaturePath + allowedPath;
                if (patchPath === fullAllowedPath || patchPath.startsWith(fullAllowedPath + '/')) {
                    return true;
                }
                return false;
            });
        }
        return false;
    }

    // Use exact path matching or path starts with allowed path (existing behavior)
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
 * Finds the matching feature path for a patch, including wildcard patterns
 * @param {string} patchPath - The patch path to match
 * @returns {string|null} The matching feature path or null if not found
 */
function findMatchingFeaturePath(patchPath) {
    // First try exact matches (existing behavior)
    const exactMatch = AUTO_APPROVABLE_FEATURE_PATHS.find((feature) => feature !== '/features/*' && patchPath.startsWith(feature));

    if (exactMatch) {
        return exactMatch;
    }

    // Then try wildcard patterns
    if (patchPath.startsWith('/features/')) {
        // Extract feature name from path like /features/someFeature/... -> someFeature
        const pathParts = patchPath.split('/');
        if (pathParts.length >= 3) {
            const featureName = pathParts[2];
            // Only match if this is a direct feature path, not a nested path
            if (featureName && !featureName.includes('/')) {
                return '/features/*';
            }
        }
    }

    return null;
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
        const featurePath = findMatchingFeaturePath(patch.path);

        if (!featurePath) {
            return false; // Not an auto-approvable feature
        }

        // Check if the path is in the allowed list for this feature
        return isPathAllowedForFeature(patch.path, featurePath);
    });
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
    const disallowedPatches = [];
    for (const patch of patches) {
        const featurePath = findMatchingFeaturePath(patch.path);
        const isDisallowed = featurePath ? !isPathAllowedForFeature(patch.path, featurePath) : true;
        if (isDisallowed) {
            disallowedPatches.push(patch);
        }
    }

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
        const featurePath = findMatchingFeaturePath(patch.path);
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
