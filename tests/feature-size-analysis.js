import fs from 'fs';
import path from 'path';
import { expect } from 'chai';
import { CURRENT_CONFIG_VERSION } from '../constants.js';

/**
 * Feature size analysis tests. These tests analyze the size contribution of individual
 * features within config files and enforce growth limits.
 */
describe('Feature size analysis', () => {
    const GENERATED_DIR = path.join(import.meta.dirname, '..', 'generated');

    const getConfigFiles = () => {
        if (!fs.existsSync(GENERATED_DIR)) {
            throw new Error('Generated directory does not exist. Run `npm run build` first.');
        }

        // Use current version from constants
        const latestVersion = `v${CURRENT_CONFIG_VERSION}`;
        const versionDir = path.join(GENERATED_DIR, latestVersion);

        if (!fs.existsSync(versionDir)) {
            throw new Error(`Version directory ${latestVersion} does not exist in generated/`);
        }
        const configFiles = fs.readdirSync(versionDir).filter((file) => file.endsWith('-config.json'));

        return configFiles.map((file) => ({
            version: latestVersion,
            filename: file,
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
                    sizeKB: (sizeInBytes / 1024).toFixed(2),
                    config: featureConfig,
                });
            },
        );

        // Sort by size descending
        return featureSizes.sort((a, b) => b.size - a.size);
    };

    const findMaxFeatureSizes = () => {
        const configFiles = getConfigFiles();
        const maxSizes = {};

        configFiles.forEach(({ filepath, filename }) => {
            const config = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
            const featureSizes = analyzeFeatureSizes(config);

            featureSizes.forEach(({ name, size }) => {
                if (!maxSizes[name] || size > maxSizes[name].size) {
                    maxSizes[name] = {
                        size,
                        platform: filename.replace('-config.json', ''),
                        sizeKB: (size / 1024).toFixed(2),
                    };
                }
            });
        });

        return maxSizes;
    };

    describe('Feature size reporting', () => {
        it('should analyze and report individual feature sizes across all platforms', () => {
            const configFiles = getConfigFiles();

            console.log('\n=== Feature Size Analysis ===');

            const allFeatureData = [];

            configFiles.forEach(({ filepath, filename }) => {
                const config = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
                const featureSizes = analyzeFeatureSizes(config);
                const platform = filename.replace('-config.json', '');

                console.log(`\n--- ${platform.toUpperCase()} ---`);
                console.log('Top 10 largest features:');

                featureSizes.slice(0, 10).forEach((feature, index) => {
                    console.log(
                        `${(index + 1).toString().padStart(2)}. ${feature.name.padEnd(25)} ${feature.sizeKB.toString().padStart(8)}KB`,
                    );
                });

                allFeatureData.push({
                    platform,
                    features: featureSizes,
                });
            });

            // Find max sizes across all platforms
            const maxSizes = findMaxFeatureSizes();

            console.log('\n=== Maximum Feature Sizes Across All Platforms ===');
            const sortedMaxSizes = Object.entries(maxSizes)
                .map(
                    ([
                        name,
                        data,
                    ]) => ({ name, ...data }),
                )
                .sort((a, b) => b.size - a.size);

            sortedMaxSizes.slice(0, 20).forEach((feature, index) => {
                console.log(
                    `${(index + 1).toString().padStart(2)}. ${feature.name.padEnd(30)} ${feature.sizeKB.toString().padStart(8)}KB (${feature.platform})`,
                );
            });

            // Find overall largest feature
            const largestFeature = sortedMaxSizes[0];
            if (largestFeature) {
                console.log(`\nLargest feature: ${largestFeature.name} at ${largestFeature.sizeKB}KB on ${largestFeature.platform}`);
                console.log(`10% growth allowance would be: ${(parseFloat(largestFeature.sizeKB) * 1.1).toFixed(2)}KB`);
            }

            console.log('===============================\n');

            // Store data for use in other tests
            global.featureAnalysisData = {
                maxSizes,
                largestFeature,
                allFeatureData,
            };

            // Verify we have analysis data
            expect(Object.keys(maxSizes).length).to.be.greaterThan(0);
        });
    });

    describe('Feature size growth limits', () => {
        let analysisData;

        beforeEach(() => {
            // Run the analysis if not already done
            if (!global.featureAnalysisData) {
                const maxSizes = findMaxFeatureSizes();
                const sortedMaxSizes = Object.entries(maxSizes)
                    .map(
                        ([
                            name,
                            data,
                        ]) => ({ name, ...data }),
                    )
                    .sort((a, b) => b.size - a.size);

                global.featureAnalysisData = {
                    maxSizes,
                    largestFeature: sortedMaxSizes[0],
                };
            }
            analysisData = global.featureAnalysisData;
        });

        it('should enforce platform-specific growth limits on the largest feature', function () {
            if (!analysisData.largestFeature) {
                this.skip();
                return;
            }

            // Platform-specific base sizes for autoconsent feature
            const ANDROID_BASE_SIZE_KB = 829.09; // Current autoconsent size on Android
            const OTHER_PLATFORMS_BASE_SIZE_KB = 829.09; // Current autoconsent size on iOS/macOS/Windows

            const configFiles = getConfigFiles();

            configFiles.forEach(({ filepath, filename }) => {
                const config = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
                const featureSizes = analyzeFeatureSizes(config);
                const platform = filename.replace('-config.json', '');

                // Determine base size and limit based on platform
                const isAndroid = platform === 'android';
                const baseSizeKB = isAndroid ? ANDROID_BASE_SIZE_KB : OTHER_PLATFORMS_BASE_SIZE_KB;
                const allowedSizeKB = baseSizeKB * 1.1; // 10% growth allowance
                const allowedSizeBytes = allowedSizeKB * 1024;

                const autoconsentFeature = featureSizes.find((f) => f.name === 'autoconsent');

                if (autoconsentFeature) {
                    expect(
                        autoconsentFeature.size,
                        `Feature 'autoconsent' on ${platform} is ${autoconsentFeature.sizeKB}KB, ` +
                            `exceeding 10% growth limit of ${allowedSizeKB.toFixed(2)}KB ` +
                            `(base: ${baseSizeKB}KB for ${isAndroid ? 'Android' : 'other platforms'})`,
                    ).to.be.at.most(allowedSizeBytes);
                }
            });
        });

        it('should track significant feature size increases', function () {
            if (!analysisData.maxSizes) {
                this.skip();
                return;
            }

            const { maxSizes } = analysisData;
            const configFiles = getConfigFiles();
            const significantIncreases = [];

            configFiles.forEach(({ filepath, filename }) => {
                const config = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
                const featureSizes = analyzeFeatureSizes(config);
                const platform = filename.replace('-config.json', '');

                featureSizes.forEach((feature) => {
                    const baselineSize = maxSizes[feature.name]?.size || 0;
                    if (baselineSize > 0) {
                        const growthPercent = ((feature.size - baselineSize) / baselineSize) * 100;

                        // Flag features that grew by more than 25%
                        if (growthPercent > 25) {
                            significantIncreases.push({
                                feature: feature.name,
                                platform,
                                currentSize: feature.sizeKB,
                                baselineSize: (baselineSize / 1024).toFixed(2),
                                growthPercent: growthPercent.toFixed(1),
                            });
                        }
                    }
                });
            });

            if (significantIncreases.length > 0) {
                console.log('\n⚠️  Features with significant size increases (>25%):');
                significantIncreases.forEach(({ feature, platform, currentSize, baselineSize, growthPercent }) => {
                    console.log(`   ${feature} on ${platform}: ${baselineSize}KB → ${currentSize}KB (+${growthPercent}%)`);
                });
                console.log('');
            }

            // Verify we processed the analysis
            expect(configFiles.length).to.be.greaterThan(0);
        });
    });
});
