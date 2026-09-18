#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the root directory of the p-r-c repo
const rootDir = path.resolve(__dirname, '..');

// Directories to analyze
const featuresDir = path.join(rootDir, 'features');
const schemaDir = path.join(rootDir, 'schema');
const schemaFeaturesDir = path.join(schemaDir, 'features');

/**
 * Get all feature JSON files
 */
function getFeatureFiles() {
    try {
        const files = fs.readdirSync(featuresDir);
        return files.filter((file) => file.endsWith('.json'));
    } catch (error) {
        console.error('Error reading features directory:', error.message);
        return [];
    }
}

/**
 * Get all schema TypeScript files
 */
function getSchemaFiles() {
    try {
        const files = fs.readdirSync(schemaFeaturesDir);
        return files.filter((file) => file.endsWith('.ts'));
    } catch (error) {
        console.error('Error reading schema features directory:', error.message);
        return [];
    }
}

/**
 * Extract feature name from JSON file content
 */
function extractFeatureNameFromJson(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const json = JSON.parse(content);

        // Check if it has settings (indicates it's a feature with configuration)
        if (json.settings !== undefined || json.exceptions !== undefined) {
            return path.basename(filePath, '.json');
        }

        return null;
    } catch (error) {
        console.error(`Error parsing ${filePath}:`, error.message);
        return null;
    }
}

/**
 * Convert camelCase to kebab-case
 */
function camelToKebab(str) {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/**
 * Check if a feature is platform-specific by looking at override files
 */
function getPlatformSpecificFeatures() {
    const allFeatures = new Map();

    try {
        // Check each platform's override file
        const platforms = [
            'android',
            'ios',
            'macos',
            'windows',
        ];

        for (const platform of platforms) {
            const overrideFile = path.join(rootDir, 'overrides', `${platform}-override.json`);
            if (fs.existsSync(overrideFile)) {
                const content = fs.readFileSync(overrideFile, 'utf8');
                const override = JSON.parse(content);

                if (override.features) {
                    for (const featureName of Object.keys(override.features)) {
                        // Convert camelCase to kebab-case for matching
                        const kebabName = camelToKebab(featureName);
                        if (!allFeatures.has(kebabName)) {
                            allFeatures.set(kebabName, []);
                        }
                        allFeatures.get(kebabName).push(platform);
                    }
                }
            }
        }

        // Filter to only features that exist on exactly one platform
        const platformSpecificFeatures = new Map();
        for (const [
            featureName,
            platforms,
        ] of allFeatures) {
            if (platforms.length === 1) {
                platformSpecificFeatures.set(featureName, platforms);
            }
        }

        return platformSpecificFeatures;
    } catch (error) {
        console.error('Error reading override files:', error.message);
        return new Map();
    }
}

/**
 * Check if a feature is platform-specific
 */
function isPlatformSpecific(featureName, platformSpecificFeatures) {
    return platformSpecificFeatures.has(featureName);
}

/**
 * Check if a feature has settings configuration
 */
function hasSettings(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const json = JSON.parse(content);
        return json.settings !== undefined;
    } catch (error) {
        return false;
    }
}

/**
 * Extract feature name from TypeScript schema file
 */
function extractFeatureNameFromSchema(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');

        // Look for export type patterns like: export type AutoconsentFeature<VersionType>
        const exportMatch = content.match(/export type (\w+)Feature</);
        if (exportMatch) {
            // Convert PascalCase to kebab-case
            const pascalCase = exportMatch[1];
            const kebabCase = pascalCase.replace(/([A-Z])/g, '-$1').toLowerCase();
            return kebabCase.replace(/^-/, ''); // Remove leading dash
        }

        // Look for other patterns like AndroidBrowserConfig
        const configMatch = content.match(/export type (\w+)Config</);
        if (configMatch) {
            const pascalCase = configMatch[1];
            const kebabCase = pascalCase.replace(/([A-Z])/g, '-$1').toLowerCase();
            return kebabCase.replace(/^-/, ''); // Remove leading dash
        }

        // Look for Settings patterns like MaliciousSiteProtectionSettings
        const settingsMatch = content.match(/export type (\w+)Settings/);
        if (settingsMatch) {
            const pascalCase = settingsMatch[1];
            const kebabCase = pascalCase.replace(/([A-Z])/g, '-$1').toLowerCase();
            return kebabCase.replace(/^-/, ''); // Remove leading dash
        }

        // Look for any export type pattern
        const anyExportMatch = content.match(/export type (\w+)/);
        if (anyExportMatch) {
            const pascalCase = anyExportMatch[1];
            const kebabCase = pascalCase.replace(/([A-Z])/g, '-$1').toLowerCase();
            return kebabCase.replace(/^-/, ''); // Remove leading dash
        }

        // Fallback: use filename without extension
        return path.basename(filePath, '.ts');
    } catch (error) {
        console.error(`Error reading schema file ${filePath}:`, error.message);
        return null;
    }
}

/**
 * Analyze schema coverage
 */
function analyzeSchemaCoverage() {
    console.log('🔍 Analyzing schema coverage in privacy-remote-configuration...\n');

    // Get all files
    const featureFiles = getFeatureFiles();
    const schemaFiles = getSchemaFiles();

    console.log(`📊 Found ${featureFiles.length} feature JSON files`);
    console.log(`📊 Found ${schemaFiles.length} schema TypeScript files\n`);

    // Get platform-specific features from override files
    const platformSpecificFeaturesMap = getPlatformSpecificFeatures();

    // Extract feature names from JSON files
    const featuresWithConfig = new Set();
    const platformSpecificFeatures = new Set();
    const platformSpecificWithSettings = new Set();
    const featuresWithoutSchemaWithSettings = new Set();

    for (const file of featureFiles) {
        const featureName = extractFeatureNameFromJson(path.join(featuresDir, file));
        if (featureName && featureName !== '_template') {
            featuresWithConfig.add(featureName);

            // Track platform-specific features
            if (isPlatformSpecific(featureName, platformSpecificFeaturesMap)) {
                platformSpecificFeatures.add(featureName);
                if (hasSettings(path.join(featuresDir, file))) {
                    platformSpecificWithSettings.add(featureName);
                }
            }
        }
    }

    // Extract feature names from schema files
    const schemaFeatures = new Set();
    for (const file of schemaFiles) {
        const featureName = extractFeatureNameFromSchema(path.join(schemaFeaturesDir, file));
        if (featureName) {
            schemaFeatures.add(featureName);
        }
    }

    // Calculate coverage (excluding platform-specific features)
    const nonPlatformFeatures = new Set();
    for (const feature of featuresWithConfig) {
        if (!isPlatformSpecific(feature, platformSpecificFeaturesMap)) {
            nonPlatformFeatures.add(feature);
        }
    }

    const totalFeatures = nonPlatformFeatures.size;
    const featuresWithSchema = new Set();

    for (const feature of nonPlatformFeatures) {
        if (schemaFeatures.has(feature)) {
            featuresWithSchema.add(feature);
        }
    }

    const schemaCoverage = totalFeatures > 0 ? (featuresWithSchema.size / totalFeatures) * 100 : 0;

    // Generate report
    console.log('📋 SCHEMA COVERAGE REPORT');
    console.log('='.repeat(50));
    console.log(`Total features with configuration: ${totalFeatures} (excluding platform-specific)`);
    console.log(`Platform-specific features: ${platformSpecificFeatures.size}`);
    console.log(`Features with schema: ${featuresWithSchema.size}`);
    console.log('');
    console.log(`📈 Schema coverage: ${schemaCoverage.toFixed(1)}%`);
    console.log('');

    // List features without any schema (excluding platform-specific)
    const featuresWithoutSchema = new Set();
    for (const feature of nonPlatformFeatures) {
        if (!featuresWithSchema.has(feature)) {
            featuresWithoutSchema.add(feature);

            // Check if this feature has settings
            const featureFile = `${feature}.json`;
            if (featureFiles.includes(featureFile) && hasSettings(path.join(featuresDir, featureFile))) {
                featuresWithoutSchemaWithSettings.add(feature);
            }
        }
    }

    if (featuresWithoutSchema.size > 0) {
        console.log('❌ Features without any schema:');
        Array.from(featuresWithoutSchema)
            .sort()
            .forEach((feature) => {
                const hasSettingsFlag = featuresWithoutSchemaWithSettings.has(feature) ? ' (has settings)' : '';
                console.log(`   - ${feature}${hasSettingsFlag}`);
            });
        console.log('');
    }

    // List features with schema
    if (featuresWithSchema.size > 0) {
        console.log('✅ Features with schema:');
        Array.from(featuresWithSchema)
            .sort()
            .forEach((feature) => {
                console.log(`   - ${feature}`);
            });
        console.log('');
    }

    // List platform-specific features
    if (platformSpecificFeatures.size > 0) {
        console.log('🔧 Platform-specific features:');
        Array.from(platformSpecificFeatures)
            .sort()
            .forEach((feature) => {
                const platforms = platformSpecificFeaturesMap.get(feature) || [];
                const hasSettingsFlag = platformSpecificWithSettings.has(feature) ? ' (has settings)' : '';
                console.log(`   - ${feature} (${platforms.join(', ')})${hasSettingsFlag}`);
            });
        console.log('');
    }

    // Summary
    console.log('📊 SUMMARY');
    console.log('='.repeat(50));
    console.log(`Schema coverage: ${schemaCoverage.toFixed(1)}%`);
    console.log(`Features needing schema: ${featuresWithoutSchema.size}`);
    console.log(`Features needing schema with settings: ${featuresWithoutSchemaWithSettings.size}`);
    console.log(`Platform-specific features: ${platformSpecificFeatures.size}`);
    console.log(`Platform-specific features with settings: ${platformSpecificWithSettings.size}`);

    return {
        totalFeatures,
        schemaCoverage,
        featuresWithoutSchema: Array.from(featuresWithoutSchema).sort(),
        featuresWithoutSchemaWithSettings: Array.from(featuresWithoutSchemaWithSettings).sort(),
        featuresWithSchema: Array.from(featuresWithSchema).sort(),
        platformSpecificFeatures: Array.from(platformSpecificFeatures).sort(),
        platformSpecificWithSettings: Array.from(platformSpecificWithSettings).sort(),
    };
}

// Run the analysis
if (import.meta.url === `file://${process.argv[1]}`) {
    analyzeSchemaCoverage();
}

export { analyzeSchemaCoverage };
