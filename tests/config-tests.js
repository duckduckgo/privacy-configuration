import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { createValidator, formatErrors } from './schema-validation.js';
import platforms from './../platforms.js';
import { immutableJSONPatch } from 'immutable-json-patch';
import { getBaseFeatureConfigs, readJsoncFile } from '../util.js';

const platformOutput = platforms.map((item) => item.replace('browsers/', 'extension-'));

const platformSpecificSchemas = {
    'v5/android-config.json': 'AndroidCurrentConfig',
    'v4/android-config.json': 'LegacyAndroidConfig',
};

// Test the latest 2 versions of each platform
const latestConfigs = platformOutput.map((plat) => {
    return {
        name: `v5/${plat}-config.json`,
        body: JSON.parse(fs.readFileSync(`./generated/v5/${plat}-config.json`)),
    };
});

const previousConfigs = platformOutput.map((plat) => {
    return {
        name: `v4/${plat}-config.json`,
        body: JSON.parse(fs.readFileSync(`./generated/v4/${plat}-config.json`)),
    };
});

describe('Config schema tests', () => {
    const featurePlatformUsage = {};
    for (const otherConfig of latestConfigs) {
        for (const featureName of Object.keys(otherConfig.body.features)) {
            // Skip over counting extension specific platforms
            if (otherConfig.name.match(/extension-[a-z0-9]+-config/)) {
                continue;
            }
            if (!(featureName in otherConfig.body.features)) {
                continue;
            }
            featurePlatformUsage[featureName] = (featurePlatformUsage[featureName] || 0) + 1;
        }
    }

    for (const config of latestConfigs) {
        describe(`${config.name}`, () => {
            // appTrackerProtection should only be on the Android config since it is a large feature
            const shouldContainAppTP = config.name.split('/')[1] === 'android-config.json';
            it('should contain appTrackerProtection or not', () => {
                expect('appTrackerProtection' in config.body.features).to.be.equal(
                    shouldContainAppTP,
                    `appTrackerProtection expected: ${shouldContainAppTP}`,
                );
            });

            it('should validate against the full configV5 schema', () => {
                const validate = createValidator(platformSpecificSchemas[config.name] || 'CurrentGenericConfig');
                expect(validate(config.body)).to.be.equal(true, formatErrors(validate.errors));
            });

            it('all features should be named correctly', () => {
                const legacyFeatures = [
                    'androidBrowserConfig',
                    'androidNewStateKillSwitch',
                    'windowsDownloadLink',
                    'windowsExternalPreviewReleases',
                    'windowsFireWindow',
                    'windowsNewTabPageExperiment',
                    'windowsPermissionUsage',
                    'windowsPrecisionScroll',
                    'windowsSpellChecker',
                    'windowsStartupBoost',
                    'windowsWaitlist',
                    'windowsWebviewFailures',
                    'windowsWebViewPermissionsSavesInProfile',
                    'macOSBrowserConfig',
                    'iOSBrowserConfig',
                ];
                const deviceSpecificCheck = /(android|ios|windows|macos)/i;
                const featureNameRegex = /^[a-zA-Z0-9]+$/;
                for (const featureName of Object.keys(config.body.features)) {
                    if (config.name.includes('windows-config.json') && featureName.endsWith('_DDGWV')) {
                        // Allow _DDGWV feature overrides for Windows temporarily
                        const ddgwvFeatureRegex = /^[a-zA-Z0-9]+_DDGWV$/;
                        expect(featureName).to.match(
                            ddgwvFeatureRegex,
                            `_DDGWV feature override '${featureName}' should match pattern: baseName_DDGWV`,
                        );
                    } else {
                        expect(featureName).to.match(featureNameRegex);
                        // Features should not have platform specific names so we can use the same config for all platforms.
                        if (!legacyFeatures.includes(featureName)) {
                            expect(featureName).to.not.match(deviceSpecificCheck);
                        }
                    }

                    // All subfeatures should also be named correctly
                    const feature = config.body.features[featureName];
                    if (feature.features) {
                        for (const subfeatureName of Object.keys(feature.features)) {
                            expect(subfeatureName).to.match(featureNameRegex);
                            expect(subfeatureName).to.not.match(deviceSpecificCheck);
                        }
                    }
                }
            });

            it('All features should have a corresponding feature file if used in more than one platform', () => {
                // Note: We should not add more to this list, only remove
                const legacyFeatures = [
                    'webViewBlobDownload',
                    'experimentTest',
                    'eme',
                    'clientContentFeatures',
                ];
                expect(featurePlatformUsage).to.be.an('object');
                expect(Object.keys(featurePlatformUsage)).to.have.length.greaterThan(0);

                for (const featureName of Object.keys(config.body.features)) {
                    // Skip over counting extension specific platforms
                    if (config.name.match(/extension-[a-z0-9]+-config/)) {
                        continue;
                    }
                    if (legacyFeatures.includes(featureName)) {
                        continue;
                    }
                    const dasherizedFeatureName = featureName.replace(/([a-z0-9])([A-Z0-9])/g, '$1-$2').toLowerCase();
                    const featureFile = `./features/${dasherizedFeatureName}.json`;
                    const featureFileExists = fs.existsSync(featureFile);
                    // Only check for other platforms if the feature file does not exist
                    expect(!featureFileExists && featurePlatformUsage[featureName] > 1).to.be.equal(
                        false,
                        `Feature file not found: ${featureFile} when it's used in ${config.name} and other platforms`,
                    );
                }
            });

            it('All patchSettings should also be valid', () => {
                const validate = createValidator(platformSpecificSchemas[config.name] || 'CurrentGenericConfig');
                function applyPatchAndValidate(featureName, feature, conditionalChange, config) {
                    for (const change of conditionalChange) {
                        if (!change.patchSettings) {
                            continue;
                        }
                        let featureSettings = feature.settings;
                        featureSettings = immutableJSONPatch(featureSettings, change.patchSettings);
                        // Clone config and check the schema with the patched featureSettings
                        const clonedConfig = JSON.parse(JSON.stringify(config.body));
                        expect(clonedConfig.features[featureName].settings).to.not.be.equal(featureSettings);
                        clonedConfig.features[featureName].settings = featureSettings;
                        expect(validate(clonedConfig)).to.be.equal(true, formatErrors(validate.errors));
                    }
                }

                const legacyFeatures = ['networkProtection'];
                for (const featureName of Object.keys(config.body.features)) {
                    // Ignore a non C-S-S feature that uses "domains"
                    if (legacyFeatures.includes(featureName)) {
                        continue;
                    }
                    const feature = config.body.features[featureName];
                    if (feature?.settings?.conditionalChanges) {
                        applyPatchAndValidate(featureName, feature, feature.settings.conditionalChanges, config);
                    }
                    if (feature?.settings?.domains) {
                        applyPatchAndValidate(featureName, feature, feature.settings.domains, config);
                    }
                }
            });

            it('All experiment cohorts should be named correctly', () => {
                const cohortNameRegex = /^[a-zA-Z0-9]+$/;
                /** @type {Record<string, import('../schema/feature').GenericFeature>} */
                const features = config.body.features;
                for (const featureName of Object.keys(config.body.features)) {
                    for (const subfeatureName of Object.keys(features[featureName].features || {})) {
                        const subFeature = features[featureName].features[subfeatureName];
                        if (subFeature.cohorts) {
                            for (const cohort of subFeature.cohorts) {
                                expect(cohort.name).to.match(cohortNameRegex);
                            }
                        }
                    }
                }
            });

            if (config.name.includes('windows-config.json')) {
                // Only run this test for Windows config to validate _DDGWV features
                it('Windows config _DDGWV features should be valid overrides of their base features', () => {
                    // Find all _DDGWV features and their corresponding base features
                    const baseFeatures = {};
                    for (const featureName of Object.keys(config.body.features)) {
                        if (featureName.endsWith('_DDGWV')) {
                            const baseFeatureName = featureName.replace('_DDGWV', '');

                            expect(config.body.features[baseFeatureName]).to.be.an(
                                'object',
                                `_DDGWV feature override '${featureName}' should have a corresponding base feature '${baseFeatureName}'`,
                            );

                            baseFeatures[featureName] = {
                                ddgwvFeature: config.body.features[featureName],
                                baseFeature: config.body.features[baseFeatureName],
                                baseFeatureName,
                            };
                        }
                    }

                    // Validate each _DDGWV feature is a proper override
                    for (const [
                        ddgwvFeatureName,
                        { ddgwvFeature, baseFeature, baseFeatureName },
                    ] of Object.entries(baseFeatures)) {
                        // Check that settings structure matches (if present)
                        if (baseFeature.settings && ddgwvFeature.settings) {
                            const baseSettingsKeys = Object.keys(baseFeature.settings).sort();
                            const ddgwvSettingsKeys = Object.keys(ddgwvFeature.settings).sort();

                            expect(ddgwvSettingsKeys).to.deep.equal(
                                baseSettingsKeys,
                                `_DDGWV feature override '${ddgwvFeatureName}' settings keys should match base feature '${baseFeatureName}' settings keys`,
                            );
                        } else if (baseFeature.settings || ddgwvFeature.settings) {
                            expect.fail(
                                `_DDGWV feature override '${ddgwvFeatureName}' and base feature '${baseFeatureName}' should both have or not have settings`,
                            );
                        }

                        expect(ddgwvFeature.minSupportedVersion).to.deep.equal(
                            baseFeature.minSupportedVersion,
                            `_DDGWV feature override '${ddgwvFeatureName}' minSupportedVersion should match base feature '${baseFeatureName}' minSupportedVersion`,
                        );

                        // Check that if both features have subfeatures, they have the same subfeature names
                        if (baseFeature.features && ddgwvFeature.features) {
                            const baseSubfeatureNames = Object.keys(baseFeature.features).sort();
                            const ddgwvSubfeatureNames = Object.keys(ddgwvFeature.features).sort();

                            expect(ddgwvSubfeatureNames).to.deep.equal(
                                baseSubfeatureNames,
                                `_DDGWV feature override '${ddgwvFeatureName}' subfeatures should match base feature '${baseFeatureName}' subfeatures`,
                            );

                            // For each subfeature, check fields that should match
                            for (const subfeatureName of baseSubfeatureNames) {
                                const baseSubfeature = baseFeature.features[subfeatureName];
                                const ddgwvSubfeature = ddgwvFeature.features[subfeatureName];

                                // Check minSupportedVersion
                                expect(ddgwvSubfeature.minSupportedVersion).to.deep.equal(
                                    baseSubfeature.minSupportedVersion,
                                    `_DDGWV feature override '${ddgwvFeatureName}.${subfeatureName}' minSupportedVersion should match base feature '${baseFeatureName}.${subfeatureName}' minSupportedVersion`,
                                );

                                // Check rollout (if present)
                                if (baseSubfeature.rollout && ddgwvSubfeature.rollout) {
                                    expect(ddgwvSubfeature.rollout).to.deep.equal(
                                        baseSubfeature.rollout,
                                        `_DDGWV feature override '${ddgwvFeatureName}.${subfeatureName}' rollout should match base feature '${baseFeatureName}.${subfeatureName}' rollout`,
                                    );
                                } else if (baseSubfeature.rollout || ddgwvSubfeature.rollout) {
                                    expect.fail(
                                        `_DDGWV feature override '${ddgwvFeatureName}.${subfeatureName}' and base feature '${baseFeatureName}.${subfeatureName}' should both have or not have rollout`,
                                    );
                                }

                                // Check cohorts (if present)
                                if (baseSubfeature.cohorts && ddgwvSubfeature.cohorts) {
                                    expect(ddgwvSubfeature.cohorts).to.deep.equal(
                                        baseSubfeature.cohorts,
                                        `_DDGWV feature override '${ddgwvFeatureName}.${subfeatureName}' cohorts should match base feature '${baseFeatureName}.${subfeatureName}' cohorts`,
                                    );
                                } else if (baseSubfeature.cohorts || ddgwvSubfeature.cohorts) {
                                    expect.fail(
                                        `_DDGWV feature override '${ddgwvFeatureName}.${subfeatureName}' and base feature '${baseFeatureName}.${subfeatureName}' should both have or not have cohorts`,
                                    );
                                }
                            }
                        } else if (baseFeature.features || ddgwvFeature.features) {
                            expect.fail(
                                `_DDGWV feature override '${ddgwvFeatureName}' and base feature '${baseFeatureName}' should both have or not have subfeatures`,
                            );
                        }
                    }
                });
            }
        });
    }

    for (const config of previousConfigs) {
        describe(`${config.name}`, () => {
            // appTrackerProtection should only be on the Android config since it is a large feature
            const shouldContainAppTP = config.name.split('/')[1] === 'android-config.json';
            it('should contain appTrackerProtection or not', () => {
                expect('appTrackerProtection' in config.body.features).to.be.equal(
                    shouldContainAppTP,
                    `appTrackerProtection expected: ${shouldContainAppTP}`,
                );
            });

            it('should validate against the legacy schema', () => {
                const validate = createValidator(platformSpecificSchemas[config.name] || 'LegacyConfig');
                expect(validate(config.body)).to.be.equal(true, formatErrors(validate.errors));
            });
        });
    }
});

describe('Config schema tests', () => {
    it('All subfeatures must be defined in their overrides files if they apply', () => {
        const baseFeatures = getBaseFeatureConfigs();
        for (const platform of platforms) {
            const dirname = import.meta.dirname;
            const overrideConfig = readJsoncFile(path.join(dirname, `/../overrides/${platform}-override.json`));
            // Skip over extension platforms:
            if (platform.startsWith('browsers/')) {
                continue;
            }
            for (const [
                featureName,
                baseFeature,
            ] of Object.entries(baseFeatures)) {
                const overrideFeature = overrideConfig.features[featureName];
                // Skip over if we have no override for this feature
                if (!overrideFeature) continue;
                if (!('features' in overrideFeature)) continue;
                // Skip over if we have no subfeatures
                if (!('features' in baseFeature)) continue;
                for (const [subFeatureName] of Object.entries(baseFeature.features)) {
                    expect(overrideFeature.features[subFeatureName]).to.be.an(
                        'object',
                        `Missing override for ${platform} ${featureName}.${subFeatureName}`,
                    );
                }
            }
        }
    });
});
