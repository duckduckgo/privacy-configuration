#!/usr/bin/env node

/**
 * Standalone script to analyze feature sizes in privacy configuration files.
 * This script provides detailed reporting on individual feature sizes across all platforms
 * and can be used for monitoring and optimization purposes.
 *
 * Usage: node scripts/analyze-feature-sizes.js [options]
 *
 * Options:
 *   --json                Output results as JSON
 *   --top <number>       Show top N features (default: 10)
 *   --platform <name>    Analyze specific platform only
 *   --feature <name>     Show details for specific feature
 *   --help              Show this help message
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GENERATED_DIR = path.join(__dirname, '..', 'generated');

// Parse command line arguments
const args = process.argv.slice(2);
const getArgValue = (argName) => {
    const index = args.indexOf(argName);
    return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
};

const options = {
    json: args.includes('--json'),
    top: parseInt(getArgValue('--top')) || 10,
    platform: getArgValue('--platform'),
    feature: getArgValue('--feature'),
    help: args.includes('--help'),
};

if (options.help) {
    console.log(`
Analyze feature sizes in privacy configuration files

Usage: node scripts/analyze-feature-sizes.js [options]

Options:
  --json                Output results as JSON
  --top <number>        Show top N features (default: 10)
  --platform <name>     Analyze specific platform only
  --feature <name>      Show details for specific feature
  --help               Show this help message

Examples:
  node scripts/analyze-feature-sizes.js
  node scripts/analyze-feature-sizes.js --top 5
  node scripts/analyze-feature-sizes.js --platform android
  node scripts/analyze-feature-sizes.js --feature autoconsent
  node scripts/analyze-feature-sizes.js --json > feature-sizes.json
    `);
    process.exit(0);
}

const getConfigFiles = () => {
    if (!fs.existsSync(GENERATED_DIR)) {
        console.error('Generated directory does not exist. Run `npm run build` first.');
        process.exit(1);
    }

    const versions = fs
        .readdirSync(GENERATED_DIR)
        .filter((dir) => dir.startsWith('v') && fs.statSync(path.join(GENERATED_DIR, dir)).isDirectory());

    // Use latest version (highest version number)
    const latestVersion = versions.sort((a, b) => {
        const aNum = parseInt(a.replace('v', ''));
        const bNum = parseInt(b.replace('v', ''));
        return bNum - aNum;
    })[0];

    if (!latestVersion) {
        console.error('No version directories found in generated/');
        process.exit(1);
    }

    const versionDir = path.join(GENERATED_DIR, latestVersion);
    let configFiles = fs.readdirSync(versionDir).filter((file) => file.endsWith('-config.json'));

    // Filter by platform if specified
    if (options.platform) {
        configFiles = configFiles.filter((file) => file.includes(options.platform) || file.startsWith(options.platform));

        if (configFiles.length === 0) {
            console.error(`No config files found for platform: ${options.platform}`);
            console.error(
                `Available platforms: ${fs
                    .readdirSync(versionDir)
                    .filter((f) => f.endsWith('-config.json'))
                    .map((f) => f.replace('-config.json', ''))
                    .join(', ')}`,
            );
            process.exit(1);
        }
    }

    return configFiles.map((file) => ({
        version: latestVersion,
        filename: file,
        platform: file.replace('-config.json', ''),
        filepath: path.join(versionDir, file),
    }));
};

const analyzeFeatureSizes = (config) => {
    if (!config.features) {
        return [];
    }

    const featureSizes = [];

    Object.entries(config.features).forEach(
        ([
            featureName,
            featureConfig,
        ]) => {
            const featureJson = JSON.stringify(featureConfig);
            const sizeInBytes = Buffer.byteLength(featureJson, 'utf8');

            featureSizes.push({
                name: featureName,
                size: sizeInBytes,
                sizeKB: parseFloat((sizeInBytes / 1024).toFixed(2)),
                config: featureConfig,
            });
        },
    );

    // Sort by size descending
    return featureSizes.sort((a, b) => b.size - a.size);
};

const findMaxFeatureSizes = (configFiles) => {
    const maxSizes = {};

    configFiles.forEach(({ filepath, platform }) => {
        const config = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        const featureSizes = analyzeFeatureSizes(config);

        featureSizes.forEach(({ name, size, sizeKB }) => {
            if (!maxSizes[name] || size > maxSizes[name].size) {
                maxSizes[name] = {
                    size,
                    platform,
                    sizeKB,
                };
            }
        });
    });

    return maxSizes;
};

const main = () => {
    const configFiles = getConfigFiles();
    const results = {
        version: configFiles[0]?.version,
        analysisDate: new Date().toISOString(),
        platforms: [],
        maxSizes: {},
        largestFeature: null,
        totalConfigSizes: {},
        summary: {},
    };

    // Analyze each platform
    configFiles.forEach(({ filepath, filename, platform }) => {
        const config = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        const featureSizes = analyzeFeatureSizes(config);
        const configSizeKB = parseFloat((fs.statSync(filepath).size / 1024).toFixed(1));

        const platformData = {
            platform,
            filename,
            configSizeKB,
            featureCount: featureSizes.length,
            features: featureSizes.slice(0, options.top),
        };

        results.platforms.push(platformData);
        results.totalConfigSizes[platform] = configSizeKB;

        // Show specific feature details if requested
        if (options.feature) {
            const feature = featureSizes.find((f) => f.name === options.feature);
            if (feature) {
                if (!results.featureDetails) {
                    results.featureDetails = {};
                }
                results.featureDetails[platform] = feature;
            }
        }
    });

    // Find max sizes across all platforms
    results.maxSizes = findMaxFeatureSizes(configFiles);
    const sortedMaxSizes = Object.entries(results.maxSizes)
        .map(
            ([
                name,
                data,
            ]) => ({ name, ...data }),
        )
        .sort((a, b) => b.size - a.size);

    results.largestFeature = sortedMaxSizes[0];

    // Generate summary statistics
    const allFeatures = Object.keys(results.maxSizes);
    const totalFeatureSize = sortedMaxSizes.reduce((sum, f) => sum + f.size, 0);
    const averageFeatureSize = totalFeatureSize / allFeatures.length;

    results.summary = {
        totalFeatures: allFeatures.length,
        totalFeatureSizeKB: parseFloat((totalFeatureSize / 1024).toFixed(2)),
        averageFeatureSizeKB: parseFloat((averageFeatureSize / 1024).toFixed(2)),
        platformSpecificLimits: {
            android: {
                baseFeatureSize: 310.2,
                growthLimit: parseFloat((310.2 * 1.1).toFixed(2)),
            },
            otherPlatforms: {
                baseFeatureSize: 829.09,
                growthLimit: parseFloat((829.09 * 1.1).toFixed(2)),
            },
        },
    };

    if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
    }

    // Human-readable output
    console.log(`\n=== Privacy Configuration Feature Size Analysis ===`);
    console.log(`Version: ${results.version}`);
    console.log(`Analysis Date: ${new Date(results.analysisDate).toLocaleString()}`);
    console.log(`Total Features: ${results.summary.totalFeatures}`);

    if (options.feature) {
        console.log(`\n=== Feature Details: ${options.feature} ===`);
        if (results.featureDetails) {
            Object.entries(results.featureDetails).forEach(
                ([
                    platform,
                    feature,
                ]) => {
                    console.log(`${platform.padEnd(20)} ${feature.sizeKB.toString().padStart(8)}KB`);
                },
            );
        } else {
            console.log(`Feature '${options.feature}' not found in any platform configuration.`);
        }
        return;
    }

    // Platform analysis
    results.platforms.forEach(({ platform, configSizeKB, featureCount, features }) => {
        console.log(`\n--- ${platform.toUpperCase()} (${configSizeKB}KB total, ${featureCount} features) ---`);
        console.log(`Top ${options.top} largest features:`);

        features.forEach((feature, index) => {
            const percentage = ((feature.size / (configSizeKB * 1024)) * 100).toFixed(1);
            console.log(
                `${(index + 1).toString().padStart(2)}. ${feature.name.padEnd(25)} ${feature.sizeKB.toString().padStart(8)}KB (${percentage}%)`,
            );
        });
    });

    // Max sizes across platforms
    console.log(`\n=== Maximum Feature Sizes Across All Platforms ===`);
    sortedMaxSizes.slice(0, Math.max(options.top, 20)).forEach((feature, index) => {
        console.log(
            `${(index + 1).toString().padStart(2)}. ${feature.name.padEnd(30)} ${feature.sizeKB.toString().padStart(8)}KB (${feature.platform})`,
        );
    });

    // Summary
    console.log(`\n=== Summary ===`);
    console.log(
        `Largest feature: ${results.largestFeature.name} at ${results.largestFeature.sizeKB}KB on ${results.largestFeature.platform}`,
    );
    console.log(`Growth limits (autoconsent):`);
    console.log(`  Android: ${(310.2 * 1.1).toFixed(2)}KB (10% over 310.2KB base)`);
    console.log(`  Other platforms: ${(829.09 * 1.1).toFixed(2)}KB (10% over 829.09KB base)`);
    console.log(`Average feature size: ${results.summary.averageFeatureSizeKB}KB`);
    console.log(`Total feature data: ${results.summary.totalFeatureSizeKB}KB across ${results.summary.totalFeatures} features`);

    // Warnings
    const largeFeatures = sortedMaxSizes.filter((f) => f.sizeKB > 100);
    if (largeFeatures.length > 0) {
        console.log(`\n⚠️  Features over 100KB:`);
        largeFeatures.forEach((f) => {
            console.log(`   ${f.name}: ${f.sizeKB}KB on ${f.platform}`);
        });
    }

    console.log(`===============================\n`);
};

main();
