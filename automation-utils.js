import fs from 'fs';
import path from 'path';

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
    // Define auto-approvable features and their allowed paths
    const autoApprovableFeatures = {
        '/features/elementHiding': ['/settings/domains', '/exceptions'],
        // Add fingerprinting features - allow exceptions for all
        '/features/fingerprintingTemporaryStorage': ['/exceptions'],
        '/features/fingerprintingAudio': ['/exceptions'],
        '/features/fingerprintingBattery': ['/exceptions'],
        '/features/fingerprintingCanvas': ['/exceptions'],
        '/features/fingerprintingHardware': ['/exceptions'],
        '/features/fingerprintingScreenSize': ['/exceptions'],
    };

    // Check if all patches are for auto-approvable features and allowed paths
    return patches.every((patch) => {
        // Find which auto-approvable feature this patch belongs to
        const featurePath = Object.keys(autoApprovableFeatures).find((feature) =>
            patch.path.startsWith(feature)
        );

        if (!featurePath) {
            return false; // Not an auto-approvable feature
        }

        // Check if the path is in the allowed list for this feature
        const allowedPaths = autoApprovableFeatures[featurePath];
        return allowedPaths.some((allowedPath) => patch.path.includes(allowedPath));
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
    const disallowedPaths = patches.filter((patch) => {
        // Define auto-approvable features and their allowed paths
        const autoApprovableFeatures = {
            '/features/elementHiding': ['/settings/domains', '/exceptions'],
            '/features/fingerprintingTemporaryStorage': ['/exceptions'],
            '/features/fingerprintingAudio': ['/exceptions'],
            '/features/fingerprintingBattery': ['/exceptions'],
            '/features/fingerprintingCanvas': ['/exceptions'],
            '/features/fingerprintingHardware': ['/exceptions'],
            '/features/fingerprintingScreenSize': ['/exceptions'],
        };

        // Find which auto-approvable feature this patch belongs to
        const featurePath = Object.keys(autoApprovableFeatures).find((feature) =>
            patch.path.startsWith(feature)
        );

        if (featurePath) {
            const allowedPaths = autoApprovableFeatures[featurePath];
            return !allowedPaths.some((allowedPath) => patch.path.includes(allowedPath));
        }
        return true; // Any non-auto-approvable feature changes are disallowed
    });

    if (disallowedPaths.length > 0) {
        return {
            shouldApprove: false,
            reason: `Manual review required: Changes to disallowed paths: ${disallowedPaths.map((p) => p.path).join(', ')}`,
        };
    }

    return {
        shouldApprove: false,
        reason: 'Manual review required: Changes outside element hiding feature',
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

    // Define auto-approvable features
    const autoApprovableFeatures = [
        '/features/elementHiding',
        '/features/fingerprintingTemporaryStorage',
        '/features/fingerprintingAudio',
        '/features/fingerprintingBattery',
        '/features/fingerprintingCanvas',
        '/features/fingerprintingHardware',
        '/features/fingerprintingScreenSize',
    ];

    patches.forEach((patch) => {
        // Count by operation
        summary.byOperation[patch.op] = (summary.byOperation[patch.op] || 0) + 1;

        // Count by path
        const pathKey = patch.path.split('/').slice(0, 3).join('/'); // Top 3 levels
        summary.byPath[pathKey] = (summary.byPath[pathKey] || 0) + 1;

        // Count auto-approvable vs other changes
        if (autoApprovableFeatures.some((feature) => patch.path.startsWith(feature))) {
            summary.autoApprovableChanges++;
        } else {
            summary.otherChanges++;
        }
    });

    return summary;
}
