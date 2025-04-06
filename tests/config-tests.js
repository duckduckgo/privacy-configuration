const expect = require('chai').expect;
const fs = require('fs');
const { createValidator, formatErrors } = require('./schema-validation');
const platforms = require('./../platforms').map((item) => item.replace('browsers/', 'extension-'));
const immutableJSONPatch = require('immutable-json-patch').immutableJSONPatch;

const platformSpecificSchemas = {
    'v4/android-config.json': 'AndroidV4Config',
    'v3/android-config.json': 'LegacyAndroidConfig',
};

// Test the latest 2 versions of each platform
const latestConfigs = platforms.map((plat) => {
    return {
        name: `v4/${plat}-config.json`,
        body: JSON.parse(fs.readFileSync(`./generated/v4/${plat}-config.json`)),
    };
});

const previousConfigs = platforms.map((plat) => {
    return {
        name: `v3/${plat}-config.json`,
        body: JSON.parse(fs.readFileSync(`./generated/v3/${plat}-config.json`)),
    };
});

describe('Config schema tests', () => {
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

            it('should validate against the full configV4 schema', () => {
                const validate = createValidator(platformSpecificSchemas[config.name] || 'GenericV4Config');
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
                ];
                const deviceSpecificCheck = /(android|ios|windows|macos)/i;
                const featureNameRegex = /^[a-zA-Z0-9]+$/;
                for (const featureName of Object.keys(config.body.features)) {
                    expect(featureName).to.match(featureNameRegex);
                    // Features should not have platform specific names so we can use the same config for all platforms.
                    if (!legacyFeatures.includes(featureName)) {
                        expect(featureName).to.not.match(deviceSpecificCheck);
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

            it('All features should have a corresponding feature file', () => {
                // Note: We should not add more to this list, only remove
                const legacyFeatures = [
                    'webViewBlobDownload',
                    'experimentTest',
                    'eme',
                    'clientContentFeatures',
                ];
                for (const featureName of Object.keys(config.body.features)) {
                    if (legacyFeatures.includes(featureName)) {
                        continue;
                    }
                    const dasherizedFeatureName = featureName.replace(/([a-z0-9])([A-Z0-9])/g, '$1-$2').toLowerCase();
                    const featureFile = `./features/${dasherizedFeatureName}.json`;
                    expect(fs.existsSync(featureFile)).to.be.equal(true, `Feature file not found: ${featureFile}`);
                }
            });

            it('All patchSettings should also be valid', () => {
                const validate = createValidator(platformSpecificSchemas[config.name] || 'GenericV4Config');
                for (const featureName of Object.keys(config.body.features)) {
                    const feature = config.body.features[featureName];
                    if (feature?.settings?.domains) {
                        for (const domain of feature.settings.domains) {
                            if (!domain.patchSettings) {
                                continue;
                            }
                            let featureSettings = feature.settings;
                            featureSettings = immutableJSONPatch(featureSettings, domain.patchSettings);
                            // Clone config and check the schema with the patched featureSettings
                            const clonedConfig = JSON.parse(JSON.stringify(config.body));
                            expect(clonedConfig.features[featureName].settings).to.not.be.equal(featureSettings);
                            clonedConfig.features[featureName].settings = featureSettings;
                            expect(validate(clonedConfig)).to.be.equal(true, formatErrors(validate.errors));
                        }
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
