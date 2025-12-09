import fs from 'fs';
import fetch from 'node-fetch';

import {
    addCnameEntriesToAllowlist,
    inlineReasonArrays,
    mergeAllowlistedTrackers,
    addHashToFeatures,
    stripReasons,
    getBaseFeatureConfigs,
    readJsoncFile,
} from './util.js';

import { OVERRIDE_DIR, GENERATED_DIR, LISTS_DIR, BROWSERS_SUBDIR, CURRENT_CONFIG_VERSION, UNPROTECTED_LIST_NAME } from './constants.js';

import platforms from './platforms.js';
import { compatFunctions, removeEolFeatures } from './compatibility.js';

const defaultConfig = {
    readme: 'https://github.com/duckduckgo/privacy-configuration',
    version: Date.now(),
    features: getBaseFeatureConfigs(),
    unprotectedTemporary: [],
};

// Env flag that can be used to override stripping of 'reason' strings from the config.
const keepReasons = process.argv.includes('--keep-reasons');

// Add this near the top, after other flag definitions
const debugOutput = process.argv.includes('--debug');

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
        fs.writeFileSync(
            `${GENERATED_DIR}/${version}/${configName}-config.json`,
            debugOutput ? JSON.stringify(compatConfig, null, 2) : JSON.stringify(compatConfig),
        );
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

const listData = readJsoncFile(`${LISTS_DIR}/${UNPROTECTED_LIST_NAME}`);
addExceptionsToUnprotected(listData.exceptions);
addExceptionsToUnprotected(defaultConfig.features.contentBlocking.exceptions);

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
        baseConfig.features[key].exceptions = baseConfig.features[key].exceptions.concat(globalExceptions);
    }
}
for (const key of Object.keys(defaultConfig.features)) {
    applyGlobalUnprotectedTempExceptionsToFeatures(key, defaultConfig, listData.exceptions);
}

// Create generated directory
mkdirIfNeeded(GENERATED_DIR);

function isFeatureMissingState(feature) {
    return !('state' in feature);
}

// We previously rolled out all features to all platforms, so this is a safety whilst we deprecate that behavior.
// Don't add new items to this list, we should just add fearures to overrides/ files instead with explicit state.
const legacyDisabledFeatures = [
    'adBlockExtension',
    'androidBrowserConfig',
    'androidNewStateKillSwitch',
    'ampLinks',
    'appTrackerProtection',
    'auraExperiment',
    'autoconsent',
    'autofillService',
    'bookmarksSorting',
    'brokenSiteReportExperiment',
    'changeOmnibarPosition',
    'clickToLoad',
    'clickToPlay',
    'clientBrandHint',
    'contextualOnboarding',
    'cookie',
    'customUserAgent',
    'duckPlayer',
    'exceptionHandler',
    'extendedOnboarding',
    'fingerprintingBattery',
    'fingerprintingCanvas',
    'fingerprintingTemporaryStorage',
    'googleRejected',
    'harmfulApis',
    'incontextSignup',
    'mediaPlaybackRequiresUserGesture',
    'messageBridge',
    'newTabContinueSetUp',
    'nonTracking3pCookies',
    'privacyDashboard',
    'referrer',
    'serviceworkerInitiatedRequests',
    'settingsPage',
    'showOnAppLaunch',
    'swipingTabs',
    'tabManager',
    'textZoom',
    'trackingCookies1p',
    'trackingCookies3p',
    'voiceSearch',
    'webViewBlobDownload',
    'windowsDownloadLink',
    'windowsExternalPreviewReleases',
    'windowsFireWindow',
    'windowsPermissionUsage',
    'windowsPrecisionScroll',
    'windowsSpellChecker',
    'windowsStartupBoost',
    'windowsWaitlist',
    'windowsWebViewPermissionsSavesInProfile',
    'windowsWebviewFailures',
];

// Handle platform specific overrides and write configs to disk
async function buildPlatforms() {
    const platformConfigs = {};
    const tds = await getTds();

    for (const platform of platforms) {
        let platformConfig = JSON.parse(JSON.stringify(defaultConfig));
        const overridePath = `${OVERRIDE_DIR}/${platform}-override.json`;

        // Use extension config as the base for browser configs
        // Extension comes first in the list of platforms so its config should be defined
        // in the platformConfigs array
        if (platform.includes(BROWSERS_SUBDIR)) {
            platformConfig = JSON.parse(JSON.stringify(platformConfigs.extension));
        }

        // Handle feature overrides
        const platformOverride = readJsoncFile(overridePath); // throws error on missing platform file
        for (const key of Object.keys(platformConfig.features)) {
            if (platformOverride.features[key]) {
                // Override existing keys
                for (const platformKey of Object.keys(platformOverride.features[key])) {
                    if (platformKey === 'exceptions') {
                        continue;
                    }

                    // ensure certain settings are treated as additive, and aren't overwritten
                    if (
                        [
                            'customUserAgent',
                            'trackerAllowlist',
                        ].includes(key) &&
                        platformKey === 'settings'
                    ) {
                        const settings = {};
                        const overrideSettings = platformOverride.features[key][platformKey];
                        for (const settingsKey in overrideSettings) {
                            const baseSettings = platformConfig.features[key].settings[settingsKey];
                            if (settingsKey === 'allowlistedTrackers') {
                                settings[settingsKey] = mergeAllowlistedTrackers(baseSettings || {}, overrideSettings[settingsKey]);
                                continue;
                            } else if (
                                [
                                    'omitVersionSites',
                                    'omitApplicationSites',
                                ].includes(settingsKey)
                            ) {
                                settings[settingsKey] = baseSettings.concat(overrideSettings[settingsKey]);
                                continue;
                            }
                            settings[settingsKey] = overrideSettings[settingsKey];
                        }
                        platformConfig.features[key][platformKey] = settings;
                    } else if ((key === 'clickToLoad' || key === 'clickToPlay') && platformKey === 'settings') {
                        // Handle Click to Load settings override later, so that individual entities
                        // are disabled/enabled correctly (and disabled by default).
                        continue;
                    } else {
                        platformConfig.features[key][platformKey] = platformOverride.features[key][platformKey];
                    }
                }

                if (platformOverride.features[key].exceptions) {
                    if (key === 'contentBlocking') {
                        addExceptionsToUnprotected(platformOverride.features[key].exceptions);
                    }
                    platformConfig.features[key].exceptions = platformConfig.features[key].exceptions.concat(
                        platformOverride.features[key].exceptions,
                    );
                }
            }

            // Ensure the correct enabled state for Click to Load entities.
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

            if (isFeatureMissingState(platformConfig.features[key], key)) {
                if (legacyDisabledFeatures.includes(key)) {
                    platformConfig.features[key].state = 'disabled';
                } else {
                    // Remove the feature if we're not explicitly enabling it in overrides/
                    delete platformConfig.features[key];
                }
            }
        }

        // Add platform specific features
        for (const key of Object.keys(platformOverride.features)) {
            if (platformConfig.features[key]) {
                continue;
            }

            platformConfig.features[key] = { ...platformOverride.features[key] };
        }

        // Remove appTP feature from platforms that don't use it since it's a large feature
        if ('appTrackerProtection' in platformConfig.features && platformConfig.features.appTrackerProtection.state === 'disabled') {
            delete platformConfig.features.appTrackerProtection;
        }

        if (platformOverride.unprotectedTemporary) {
            addExceptionsToUnprotected(platformOverride.unprotectedTemporary);
            for (const key of Object.keys(platformConfig.features)) {
                applyGlobalUnprotectedTempExceptionsToFeatures(key, platformConfig, platformOverride.unprotectedTemporary);
            }
        }

        if (platformOverride.experimentalVariants) {
            platformConfig.experimentalVariants = platformOverride.experimentalVariants;
        }

        addCnameEntriesToAllowlist(tds, platformConfig.features.trackerAllowlist.settings.allowlistedTrackers);
        platformConfig = inlineReasonArrays(platformConfig);
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
