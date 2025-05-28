import fs from 'fs';
import fetch from 'node-fetch';

import {
    addCnameEntriesToAllowlist,
    inlineReasonArrays,
    mergeAllowlistedTrackers,
    addHashToFeatures,
    stripReasons,
    getBaseFeatureConfigs,
} from './util.js';

import { OVERRIDE_DIR, GENERATED_DIR, LISTS_DIR, BROWSERS_SUBDIR, CURRENT_CONFIG_VERSION, UNPROTECTED_LIST_NAME } from './constants.js';

import platforms from './platforms.js';
import { compatFunctions, removeEolFeatures } from './compatibility.js';
import { immutableJSONPatch, getIn } from 'immutable-json-patch';
import { deepMerge } from 'ts-json-schema-generator';

const defaultConfig = {
    readme: 'https://github.com/duckduckgo/privacy-configuration',
    version: Date.now(),
    reference: {
        features: getBaseFeatureConfigs(),
    },
    unprotectedTemporary: [],
};

// Env flag that can be used to override stripping of 'reason' strings from the config.
const keepReasons = process.argv.includes('--keep-reasons');

const tdsPath = 'live';

async function getTds() {
    let tds;
    if (tdsPath === 'live') {
        console.log('Fetching remote TDS');
        const response = await fetch('https://staticcdn.duckduckgo.com/trackerblocking/v3/tds.json');
        tds = await response.json();
        console.log('Fetched remote TDS');
    } else {
        console.log('Using local TDS');
        tds = JSON.parse(fs.readFileSync(tdsPath));
    }
    return tds;
}

/**
 * Write a config file to disk
 *
 * @param {string} platform - platform to write
 * @param {object} config - the object to write
 */
function writeConfigToDisk(platform, config) {
    let configName = platform;
    if (platform.includes(BROWSERS_SUBDIR)) {
        configName = platform.replace(BROWSERS_SUBDIR, 'extension-');
    }

    // Write config and convert to backwards compatible versions
    let prevConfig = null;
    const unmodifiedConfig = JSON.parse(JSON.stringify(config));
    const MIN_SUPPORTED_VERSION = 2;
    for (let i = CURRENT_CONFIG_VERSION; i > MIN_SUPPORTED_VERSION; i--) {
        const version = `v${i}`;
        mkdirIfNeeded(`${GENERATED_DIR}/${version}`);

        if (i === CURRENT_CONFIG_VERSION && !keepReasons) {
            stripReasons(config);
        }

        if (!prevConfig) {
            prevConfig = config;
        } else {
            if (!compatFunctions[version]) {
                throw new Error(`No compat function for config version ${version}`);
            }

            prevConfig = compatFunctions[version](prevConfig, unmodifiedConfig, platform);
        }

        const compatConfig = JSON.parse(JSON.stringify(prevConfig));
        addHashToFeatures(compatConfig);

        removeEolFeatures(compatConfig, i);
        fs.writeFileSync(`${GENERATED_DIR}/${version}/${configName}-config.json`, JSON.stringify(compatConfig));//, null, 2));
    }
}

/**
 * Create the specified directory if it doesn't exist
 *
 * @param {string} dir - directory path to create
 */
function mkdirIfNeeded(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
}

const unprotectedDomains = new Set();
function addExceptionsToUnprotected(exceptions) {
    for (const exception of exceptions) {
        unprotectedDomains.add(exception.domain);
    }
    return exceptions.map((obj) => obj.domain);
}

const listData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/${UNPROTECTED_LIST_NAME}`));
addExceptionsToUnprotected(listData.exceptions);
// TODO add back:
// addExceptionsToUnprotected(defaultConfig.features.contentBlocking.exceptions);

// Include global unprotected-temporary.json exceptions into selected features domain exceptions
const featuresToIncludeTempUnprotectedExceptions = [
    'ampLinks',
    'autoconsent',
    'breakageReporting',
    'clickToLoad',
    'clickToPlay',
    'contentBlocking',
    'cookie',
    'elementHiding',
    'exceptionHandler',
    'fingerprintingAudio',
    'fingerprintingBattery',
    'fingerprintingCanvas',
    'fingerprintingHardware',
    'fingerprintingScreenSize',
    'fingerprintingTemporaryStorage',
    'googleRejected',
    'gpc',
    'harmfulApis',
    'https',
    'navigatorInterface',
    'nonTracking3pCookies',
    'performanceMetrics',
    'referrer',
    'requestFilterer',
    'runtimeChecks',
    'serviceworkerInitiatedRequests',
    'trackerAllowlist',
    'trackingCookies1p',
    'trackingCookies3p',
    'trackingParameters',
    'unprotectedTemporary',
    'webCompat',
];
function applyGlobalUnprotectedTempExceptionsToFeatures(key, baseConfig, globalExceptions) {
    if (featuresToIncludeTempUnprotectedExceptions.includes(key)) {
        baseConfig.features[key].exceptions = baseConfig.features[key].exceptions || [];
        baseConfig.features[key].exceptions = baseConfig.features[key].exceptions.concat(globalExceptions);
    }
}
/** TODO add back
for (const key of Object.keys(defaultConfig.features)) {
    applyGlobalUnprotectedTempExceptionsToFeatures(key, defaultConfig, listData.exceptions);
}
*/

// Create generated directory
mkdirIfNeeded(GENERATED_DIR);

function isFeatureMissingState(feature) {
    return !('state' in feature);
}

// Handle platform specific overrides and write configs to disk
async function buildPlatforms() {
    const platformConfigs = {};
    const tds = await getTds();

    for (const platform of platforms) {
        // let platformConfig = JSON.parse(JSON.stringify(defaultConfig));
        const overridePath = `${OVERRIDE_DIR}/${platform}-override.json`;

        // Use extension config as the base for browser configs
        // Extension comes first in the list of platforms so its config should be defined
        // in the platformConfigs array
        // TODO restore
        //if (platform.includes(BROWSERS_SUBDIR)) {
        //    platformConfig = JSON.parse(JSON.stringify(platformConfigs.extension));
        //}

        // Handle feature overrides
        const platformOverride = JSON.parse(fs.readFileSync(overridePath)); // throws error on missing platform file
        let platformConfig = platformOverride;
        for (const key of Object.keys(platformConfig.features)) {
            let feature = platformOverride.features[key];
            if (platformOverride.features[key].exceptions) {
                if (key === 'contentBlocking') {
                    addExceptionsToUnprotected(platformOverride.features[key].exceptions);
                }
                platformConfig.features[key].exceptions = platformConfig.features[key].exceptions.concat(
                    platformOverride.features[key].exceptions,
                );
            }

            // Ensure the correct enabled state for Click to Load entities.
             /* TODO restore elsewhere
            if (key === 'clickToLoad' || key === 'clickToPlay') {
                const clickToLoadSettings = platformConfig?.features?.[key]?.settings;
                if (clickToLoadSettings) {
                    const clickToLoadSettingsOverride = platformOverride?.features?.[key]?.settings;
                    for (const entity of Object.keys(clickToLoadSettings)) {
                        clickToLoadSettings[entity].state =
                            clickToLoadSettingsOverride?.[entity]?.state || clickToLoadSettings[entity].state || 'disabled';
                    }
                }
            }
            */

            function deepMerge(toValue, fromData) {
                if (Array.isArray(toValue) && Array.isArray(fromData)) {
                    return [...toValue, ...fromData];
                } else if (typeof toValue === 'object' && typeof fromData === 'object') {
                    return { ...toValue, ...fromData };
                }
                return fromData; // Fallback to fromData if types don't match
            }

            if ('patchFeature' in feature) {
                feature.reference = defaultConfig.reference.features;
                console.log(`Applying patch for feature ${key}:`, feature.patchFeature);
                const outputPatches = feature.patchFeature.map((patch) => {
                    const document = feature;
                    if (patch.op === 'merge') {
                        console.log(`Merging patch for feature ${key}:`, patch);
                        if (patch.from && patch.path) {
                            const fromData = getIn(document, patch.from)
                            const toValue = getIn(document, patch.path)
                            const output = {
                                op: 'replace',
                                path: patch.path,
                                value: deepMerge(toValue, fromData)
                            }
                            console.log(`Merged patch for feature ${key}:`, output);
                            return output;
                        }
                    }
                    return patch;
                });
                feature = immutableJSONPatch(feature, outputPatches, {
                    before: (document, patch) => {
                        console.log(`Applying patch for feature ${key}:`, patch);
                        if (patch.op === 'merge') {
                            if (patch.from && patch.path) {
                                const fromData = getIn(document, patch.from)
                                const toValue = getIn(document, patch.path)
                                // Deep merge the from data into the to value
                                return {
                                    operation: {
                                        op: 'replace',
                                        path: patch.path,
                                        value: deepMerge(toValue, fromData)
                                    },
                                }

                            }
                        }
                    }
                });
                // TODO understand why patches aren't applied.
                delete feature.patchFeature;
                delete feature.reference;
                platformConfig.features[key] = feature;
            }
        }

        // Remove appTP feature from platforms that don't use it since it's a large feature
         /* TODO restore elsewhere
        if ('appTrackerProtection' in platformConfig.features && platformConfig.features.appTrackerProtection.state === 'disabled') {
            delete platformConfig.features.appTrackerProtection;
        }
        */

        if (platformOverride.unprotectedTemporary) {
            addExceptionsToUnprotected(platformOverride.unprotectedTemporary);
            for (const key of Object.keys(platformConfig.features)) {
                applyGlobalUnprotectedTempExceptionsToFeatures(key, platformConfig, platformOverride.unprotectedTemporary);
            }
        }

        if (platformOverride.experimentalVariants) {
            platformConfig.experimentalVariants = platformOverride.experimentalVariants;
        }

        // TODO add back
        // addCnameEntriesToAllowlist(tds, platformConfig.features.trackerAllowlist.settings.allowlistedTrackers);
        platformConfig = inlineReasonArrays(platformConfig);
        delete platformConfig.reference;
        platformConfigs[platform] = platformConfig;

        // Write config to disk
        // Make a copy to avoid mutating the original object
        writeConfigToDisk(platform, JSON.parse(JSON.stringify(platformConfig)));
    }
    return platformConfigs;
}

buildPlatforms().then((platformConfigs) => {
    // Generate legacy Safari format
    const legacyTextDomains = [...unprotectedDomains].join('\n');
    fs.writeFileSync(`${GENERATED_DIR}/trackers-unprotected-temporary.txt`, legacyTextDomains);
});
