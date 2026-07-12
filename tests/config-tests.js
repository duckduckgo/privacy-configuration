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

                const legacyFeatures = [
                    'networkProtection',
                ];
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
                for (const [
                    subFeatureName,
                ] of Object.entries(baseFeature.features)) {
                    expect(overrideFeature.features[subFeatureName]).to.be.an(
                        'object',
                        `Missing override for ${platform} ${featureName}.${subFeatureName}`,
                    );
                }
            }
        }
    });
});

describe('EventHub validation tests', () => {
    for (const config of latestConfigs) {
        const eventHub = /** @type {import('../schema/features/event-hub').EventHubFeature<number> | undefined} */ (
            config.body.features?.eventHub
        );
        if (!eventHub?.settings?.telemetry) continue;

        const telemetry = eventHub.settings.telemetry;

        describe(`${config.name} eventHub`, () => {
            it('telemetry entry names should be valid pixel names', () => {
                // Segments of [a-zA-Z][a-zA-Z0-9]* separated by underscores,
                // e.g. "webTelemetry_adwalls_day" (at least two segments must
                // be specified)
                const pixelNameRegex = /^[a-zA-Z][a-zA-Z0-9]*(_[a-zA-Z][a-zA-Z0-9]*)+$/;
                for (const name of Object.keys(telemetry)) {
                    expect(name).to.match(
                        pixelNameRegex,
                        `Telemetry name '${name}' is not a valid pixel name (must match ${pixelNameRegex})`,
                    );
                }
            });

            it('trigger must be a valid period or immediate trigger', () => {
                for (const [
                    name,
                    entry,
                ] of Object.entries(telemetry)) {
                    const trigger = entry.trigger;
                    expect(trigger).to.be.an('object', `Telemetry '${name}' is missing trigger`);
                    // `type` is optional and defaults to 'period'.
                    const type = trigger.type ?? 'period';
                    expect(type).to.be.oneOf(
                        [
                            'period',
                            'immediate',
                        ],
                        `Telemetry '${name}' has invalid trigger.type '${trigger.type}'`,
                    );
                    if (type === 'immediate') {
                        // Immediate triggers fire per event: no period, and a `source` naming the event.
                        expect(trigger.period, `Immediate telemetry '${name}' must not specify a period`).to.equal(undefined);
                        expect(trigger.source, `Immediate telemetry '${name}' source must be a string`).to.be.a('string');
                        expect(trigger.source.length, `Immediate telemetry '${name}' source must not be empty`).to.be.greaterThan(0);
                    } else {
                        // Period triggers carry a period and no trigger-level source.
                        expect(trigger.period, `Period telemetry '${name}' is missing trigger.period`).to.be.an('object');
                        expect(trigger.source, `Period telemetry '${name}' must not specify a trigger-level source`).to.equal(undefined);
                    }
                }
            });

            it('each telemetry entry declares a parameters object, and non-immediate entries have at least one', () => {
                for (const [
                    name,
                    entry,
                ] of Object.entries(telemetry)) {
                    const params = entry.parameters;
                    expect(params).to.be.an('object', `Telemetry '${name}' is missing parameters`);
                    // Immediate pixels fire once per event and may legitimately carry no parameters (e.g. a
                    // per-provider captcha pixel, where the provider is the pixel itself). Skip the check only
                    // for immediate triggers rather than matching on 'period', so any future trigger type is
                    // still required to carry at least one parameter until it's explicitly exempted here.
                    if ((entry.trigger.type ?? 'period') !== 'immediate') {
                        expect(Object.keys(params).length).to.be.greaterThan(
                            0,
                            `Non-immediate telemetry '${name}' must have at least one parameter`,
                        );
                    }
                }
            });

            // Partition entries by trigger type once, defaulting a missing type to 'period' (the
            // back-compat default). Grouping the type-specific checks under these buckets means each
            // check only iterates the entries it applies to, and a future trigger type cannot slip
            // through a period-only check (as it would with an `=== 'immediate'` skip guard).
            const periodEntries = Object.entries(telemetry).filter(
                ([
                    ,
                    entry,
                ]) => (entry.trigger.type ?? 'period') === 'period',
            );
            const immediateEntries = Object.entries(telemetry).filter(
                ([
                    ,
                    entry,
                ]) => entry.trigger.type === 'immediate',
            );

            describe('period telemetry entries', () => {
                it('trigger period must specify at least one non-negative time unit', () => {
                    const timeUnits = [
                        'seconds',
                        'minutes',
                        'hours',
                        'days',
                    ];
                    for (const [
                        name,
                        entry,
                    ] of periodEntries) {
                        const period = entry.trigger.period;
                        expect(period).to.be.an('object', `Telemetry '${name}' is missing trigger.period`);
                        const hasTimeUnit = timeUnits.some((unit) => unit in period);
                        expect(hasTimeUnit).to.equal(
                            true,
                            `Telemetry '${name}' period must specify at least one of: ${timeUnits.join(', ')}`,
                        );
                        for (const unit of timeUnits) {
                            if (unit in period) {
                                expect(period[unit]).to.be.at.least(0, `Telemetry '${name}' period.${unit} must not be negative`);
                            }
                        }
                    }
                });

                it('total trigger period must be greater than zero', () => {
                    for (const [
                        name,
                        entry,
                    ] of periodEntries) {
                        const period = entry.trigger.period;
                        const totalSeconds =
                            (period.seconds || 0) + (period.minutes || 0) * 60 + (period.hours || 0) * 3600 + (period.days || 0) * 86400;
                        expect(totalSeconds).to.be.greaterThan(
                            0,
                            `Telemetry '${name}' total period is ${totalSeconds}s — must be greater than zero`,
                        );
                    }
                });

                // Clients read an integer `trigger.period.seconds` and ignore days/hours/minutes, so
                // config generation must collapse any authored unit object to a single integer `seconds`.
                it('trigger period must be collapsed to a single integer seconds value', () => {
                    for (const [
                        name,
                        entry,
                    ] of periodEntries) {
                        const period = entry.trigger.period;
                        expect(Object.keys(period)).to.deep.equal(
                            [
                                'seconds',
                            ],
                            `Telemetry '${name}' period must be collapsed to only { seconds }, got: ${JSON.stringify(period)}`,
                        );
                        expect(Number.isInteger(period.seconds)).to.equal(
                            true,
                            `Telemetry '${name}' period.seconds must be an integer, got: ${period.seconds}`,
                        );
                        expect(period.seconds).to.be.greaterThan(0, `Telemetry '${name}' period.seconds must be greater than zero`);
                    }
                });
            });

            describe('immediate telemetry entries', () => {
                // The counter template aggregates a count across a window, which is meaningless for a
                // pixel that fires once per event. Disallow it on immediate triggers for now.
                it('must not use counter parameters', () => {
                    for (const [
                        name,
                        entry,
                    ] of immediateEntries) {
                        for (const [
                            paramName,
                            param,
                        ] of Object.entries(entry.parameters || {})) {
                            expect(param.template).to.not.equal(
                                'counter',
                                `Immediate telemetry '${name}' parameter '${paramName}' must not use the 'counter' template`,
                            );
                        }
                    }
                });
            });

            // `eventHub_baseline_*` pixels fire purely on their period to
            // provide a baseline / denominator: the `baseline` parameter is a
            // counter sourced from an empty "baseline" stream, so its count
            // stays at 0 and the single unbounded `0+` bucket always matches.
            // For now these pixels may carry no other parameters.
            const BASELINE_NAME_PREFIX = 'eventHub_baseline_';
            describe('baseline telemetry entries', () => {
                it('eventHub_baseline_* pixels may only declare the baseline parameter', () => {
                    for (const [
                        name,
                        entry,
                    ] of Object.entries(telemetry)) {
                        if (!name.startsWith(BASELINE_NAME_PREFIX)) continue;
                        const paramNames = Object.keys(entry.parameters || {});
                        expect(paramNames).to.deep.equal(
                            [
                                'baseline',
                            ],
                            `Baseline pixel '${name}' may only declare the 'baseline' parameter (no other parameters allowed for now), got: ${paramNames.join(', ')}`,
                        );
                    }
                });

                it('the baseline parameter is a counter sourced from "baseline" (fired even if no detector emits it)', () => {
                    for (const [
                        name,
                        entry,
                    ] of Object.entries(telemetry)) {
                        if (!name.startsWith(BASELINE_NAME_PREFIX)) continue;
                        const param = (entry.parameters || {}).baseline;
                        expect(param, `Baseline pixel '${name}' must declare a 'baseline' parameter`).to.be.an('object');
                        expect(param.template).to.equal(
                            'counter',
                            `Baseline pixel '${name}' baseline parameter must use the 'counter' template`,
                        );
                        expect(param.source).to.equal('baseline', `Baseline pixel '${name}' baseline parameter source must be 'baseline'`);
                        expect(param.buckets).to.deep.equal(
                            { '0+': { gte: 0 } },
                            `Baseline pixel '${name}' baseline parameter buckets must be exactly 0+`,
                        );
                    }
                });
            });

            for (const [
                entryName,
                entry,
            ] of Object.entries(telemetry)) {
                for (const [
                    paramName,
                    param,
                ] of Object.entries(entry.parameters || {})) {
                    describe(`${entryName}.${paramName}`, () => {
                        const isImmediateTrigger = entry.trigger?.type === 'immediate';

                        if (param.template === 'data' && isImmediateTrigger) {
                            // Immediate-trigger data params forward the triggering event's payload; the
                            // event stream is named by the trigger's `source`, so a param-level `source`
                            // is disallowed.
                            it('source must be omitted on immediate-trigger data params', () => {
                                expect(
                                    param.source,
                                    `Parameter '${entryName}.${paramName}' must not specify source on an immediate trigger`,
                                ).to.equal(undefined);
                            });
                        } else {
                            // Counter params and period data params identify their event stream via `source`.
                            it('source should be a non-empty string', () => {
                                expect(param.source).to.be.a('string', `Parameter '${entryName}.${paramName}' source must be a string`);
                                expect(param.source.length).to.be.greaterThan(
                                    0,
                                    `Parameter '${entryName}.${paramName}' source must not be empty`,
                                );
                            });
                        }

                        // Only the "counter" template defines buckets; other templates (e.g. "data",
                        // which forwards a value from the event payload) carry none, so skip the
                        // bucket-schema checks below for them.
                        if (param.template !== 'counter') {
                            if (param.template === 'data') {
                                it('dataKey should be a non-empty string', () => {
                                    expect(param.dataKey).to.be.a(
                                        'string',
                                        `Parameter '${entryName}.${paramName}' dataKey must be a string`,
                                    );
                                    expect(param.dataKey.length).to.be.greaterThan(
                                        0,
                                        `Parameter '${entryName}.${paramName}' dataKey must not be empty`,
                                    );
                                });
                            }
                            return;
                        }

                        it('buckets should not be empty', () => {
                            expect(param.buckets).to.be.an('object', `Parameter '${entryName}.${paramName}' buckets must be an object`);
                            const bucketNames = Object.keys(param.buckets);
                            expect(bucketNames.length).to.be.greaterThan(
                                0,
                                `Parameter '${entryName}.${paramName}' buckets must not be empty`,
                            );
                        });

                        it('lt must be greater than gte', () => {
                            for (const [
                                name,
                                bucket,
                            ] of Object.entries(param.buckets)) {
                                if (bucket.lt !== undefined) {
                                    expect(bucket.lt).to.be.greaterThan(
                                        bucket.gte,
                                        `Bucket '${name}' lt (${bucket.lt}) must be greater than gte (${bucket.gte})`,
                                    );
                                }
                            }
                        });

                        it('every lt must match another bucket gte (no gaps)', () => {
                            const gteValues = new Set(Object.values(param.buckets).map((b) => b.gte));
                            for (const [
                                name,
                                bucket,
                            ] of Object.entries(param.buckets)) {
                                if (bucket.lt !== undefined) {
                                    expect(gteValues.has(bucket.lt)).to.equal(
                                        true,
                                        `Bucket '${name}' lt (${bucket.lt}) does not match any bucket's gte`,
                                    );
                                }
                            }
                        });

                        it('gte values must be unique across buckets', () => {
                            const seen = new Set();
                            for (const [
                                name,
                                bucket,
                            ] of Object.entries(param.buckets)) {
                                expect(seen.has(bucket.gte)).to.equal(false, `Duplicate gte value ${bucket.gte} in bucket '${name}'`);
                                seen.add(bucket.gte);
                            }
                        });

                        it('lt values must be unique across buckets', () => {
                            const seen = new Set();
                            for (const [
                                name,
                                bucket,
                            ] of Object.entries(param.buckets)) {
                                if (bucket.lt !== undefined) {
                                    expect(seen.has(bucket.lt)).to.equal(false, `Duplicate lt value ${bucket.lt} in bucket '${name}'`);
                                    seen.add(bucket.lt);
                                }
                            }
                        });

                        it('should have at most one unbounded bucket (missing lt)', () => {
                            const unbounded = Object.entries(param.buckets).filter(
                                ([
                                    ,
                                    b,
                                ]) => b.lt === undefined,
                            );
                            expect(unbounded.length).to.be.at.most(
                                1,
                                `Found ${unbounded.length} unbounded buckets: ${unbounded
                                    .map(
                                        ([
                                            n,
                                        ]) => n,
                                    )
                                    .join(', ')}`,
                            );
                        });
                    });
                }
            }
        });
    }
});

describe('EventHub telemetry override merge', () => {
    // Windows declares only its platform-specific telemetry entries in its override; the build
    // must merge in the base event-hub entries so the platform does not drift as base entries change.
    const windowsConfig = latestConfigs.find((c) => c.name === 'v5/windows-config.json');
    const telemetry = windowsConfig?.body?.features?.eventHub?.settings?.telemetry || {};
    const baseTelemetry = readJsoncFile('./features/event-hub.json').settings.telemetry;

    it('inherits base telemetry entries not declared in the windows override', () => {
        for (const baseName of Object.keys(baseTelemetry)) {
            expect(telemetry, `Windows eventHub telemetry is missing inherited base entry '${baseName}'`).to.have.property(baseName);
        }
    });

    it('keeps windows-specific telemetry entries', () => {
        expect(telemetry).to.have.property('webTelemetry_youtube_videoAd_day');
    });
});

describe('webInterferenceDetection interferenceTypes override merge', () => {
    // Android declares only its platform-specific interference types in its override; the build
    // must merge in the base types so the platform does not drift as base types change.
    const androidConfig = latestConfigs.find((c) => c.name === 'v5/android-config.json');
    const interferenceTypes = androidConfig?.body?.features?.webInterferenceDetection?.settings?.interferenceTypes || {};
    const baseInterferenceTypes = readJsoncFile('./features/web-interference-detection.json').settings.interferenceTypes;

    it('inherits base interference types not declared in the android override', () => {
        for (const baseName of Object.keys(baseInterferenceTypes)) {
            expect(interferenceTypes, `Android webInterferenceDetection is missing inherited base type '${baseName}'`).to.have.property(
                baseName,
            );
        }
    });

    it('keeps android-specific interference types', () => {
        expect(interferenceTypes).to.have.property('youtubeAds');
    });
});

describe('EventHub schema source rules', () => {
    const validate = createValidator('EventHubSettings');

    const periodEntry = (param) => ({
        telemetry: {
            test_pixel_day: {
                state: 'enabled',
                trigger: { period: { seconds: 86400 } },
                parameters: { value: param },
            },
        },
    });

    const immediateEntry = (param) => ({
        telemetry: {
            test_pixel_immediate: {
                state: 'enabled',
                trigger: { type: 'immediate', source: 'someEvent' },
                parameters: { value: param },
            },
        },
    });

    const baselineEntry = (name) => ({
        telemetry: {
            [name]: {
                state: 'enabled',
                trigger: { period: { seconds: 86400 } },
                parameters: { baseline: { template: 'counter', source: 'baseline', buckets: { '0+': { gte: 0 } } } },
            },
        },
    });

    it('accepts a period data param that specifies a source', () => {
        const settings = periodEntry({ template: 'data', source: 'someStream', dataKey: 'loginState' });
        expect(validate(settings), formatErrors(validate.errors)).to.equal(true);
    });

    it('rejects a period data param that omits its source', () => {
        const settings = periodEntry({ template: 'data', dataKey: 'loginState' });
        expect(validate(settings)).to.equal(false);
    });

    it('accepts an immediate data param that omits its source', () => {
        const settings = immediateEntry({ template: 'data', dataKey: 'loginState' });
        expect(validate(settings), formatErrors(validate.errors)).to.equal(true);
    });

    it('accepts an eventHub_baseline_* pixel whose baseline counter has no matching detector source', () => {
        const settings = baselineEntry('eventHub_baseline_day');
        expect(validate(settings), formatErrors(validate.errors)).to.equal(true);
    });
});
