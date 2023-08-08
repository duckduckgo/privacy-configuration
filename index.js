const fs = require('fs')

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args))

const { addCnameEntriesToAllowlist, inlineReasonArrays, mergeAllowlistedTrackers, addHashToFeatures } = require('./util')

const { OVERRIDE_DIR, GENERATED_DIR, LISTS_DIR, BROWSERS_SUBDIR, CURRENT_CONFIG_VERSION } = require('./constants')

const defaultConfig = {
    readme: 'https://github.com/duckduckgo/privacy-configuration',
    version: Date.now(),
    features: {}
}

const platforms = require('./platforms')
const compatibility = require('./compatibility')

const tdsPath = 'live'

async function getTds () {
    let tds
    if (tdsPath === 'live') {
        console.log('Fetching remote TDS')
        const response = await fetch('https://staticcdn.duckduckgo.com/trackerblocking/v3/tds.json')
        tds = await response.json()
        console.log('Fetched remote TDS')
    } else {
        console.log('Using local TDS')
        tds = JSON.parse(fs.readFileSync(tdsPath))
    }
    return tds
}

/**
 * Write a config file to disk
 *
 * @param {string} platform - platform to write
 * @param {object} config - the object to write
 */
function writeConfigToDisk (platform, config) {
    let configName = platform
    if (platform.includes(BROWSERS_SUBDIR)) {
        configName = platform.replace(BROWSERS_SUBDIR, 'extension-')
    }

    // Write config and convert to backwards compatible versions
    let prevConfig = null
    for (let i = CURRENT_CONFIG_VERSION; i > 0; i--) {
        const version = `v${i}`
        mkdirIfNeeded(`${GENERATED_DIR}/${version}`)

        if (!prevConfig) {
            prevConfig = config
        } else {
            if (!compatibility.compatFunctions[version]) {
                throw new Error(`No compat function for config version ${version}`)
            }

            prevConfig = compatibility.compatFunctions[version](prevConfig)
        }

        const compatConfig = JSON.parse(JSON.stringify(prevConfig))
        addHashToFeatures(compatConfig)
        compatibility.removeEolFeatures(compatConfig, i)
        fs.writeFileSync(`${GENERATED_DIR}/${version}/${configName}-config.json`, JSON.stringify(compatConfig, null, 4))
    }
}

/**
 * Create the specified directory if it doesn't exist
 *
 * @param {string} dir - directory path to create
 */
function mkdirIfNeeded (dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir)
    }
}

const unprotectedListName = 'unprotected-temporary.json'

// Grab all exception lists
const jsonListNames = fs.readdirSync(LISTS_DIR).filter(listName => {
    return listName !== unprotectedListName && listName !== '_template.json'
})
for (const jsonList of jsonListNames) {
    const listData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/${jsonList}`))
    const configKey = jsonList.replace(/[.]json$/, '').replace(/-([a-z0-9])/g, function (g) { return g[1].toUpperCase() })

    delete listData._meta
    defaultConfig.features[configKey] = listData
}

const unprotectedDomains = new Set()
function addExceptionsToUnprotected (exceptions) {
    for (const exception of exceptions) {
        unprotectedDomains.add(exception.domain)
    }
    return exceptions.map((obj) => obj.domain)
}

const listData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/${unprotectedListName}`))
defaultConfig.unprotectedTemporary = listData.exceptions

addExceptionsToUnprotected(defaultConfig.unprotectedTemporary)
addExceptionsToUnprotected(defaultConfig.features.contentBlocking.exceptions)

// Create generated directory
mkdirIfNeeded(GENERATED_DIR)

function isFeatureMissingState (feature) {
    return !('state' in feature)
}

// Handle platform specific overrides and write configs to disk
async function buildPlatforms () {
    const platformConfigs = {}
    const tds = await getTds()

    for (const platform of platforms) {
        let platformConfig = JSON.parse(JSON.stringify(defaultConfig))
        const overridePath = `${OVERRIDE_DIR}/${platform}-override.json`

        // Use extension config as the base for browser configs
        // Extension comes first in the list of platforms so its config should be defined
        // in the platformConfigs array
        if (platform.includes(BROWSERS_SUBDIR)) {
            platformConfig = JSON.parse(JSON.stringify(platformConfigs.extension))
        }

        // Handle feature overrides
        const platformOverride = JSON.parse(fs.readFileSync(overridePath)) // throws error on missing platform file
        for (const key of Object.keys(platformConfig.features)) {
            if (platformOverride.features[key]) {
                // Override existing keys
                for (const platformKey of Object.keys(platformOverride.features[key])) {
                    if (platformKey === 'exceptions') {
                        continue
                    }

                    // ensure certain settings are treated as additive, and aren't overwritten
                    if (['customUserAgent', 'trackerAllowlist'].includes(key) && platformKey === 'settings') {
                        const settings = {}
                        const overrideSettings = platformOverride.features[key][platformKey]
                        for (const settingsKey in overrideSettings) {
                            const baseSettings = platformConfig.features[key].settings[settingsKey]
                            if (settingsKey === 'allowlistedTrackers') {
                                settings[settingsKey] = mergeAllowlistedTrackers(baseSettings || {}, overrideSettings[settingsKey])
                                continue
                            } else if (['omitVersionSites', 'omitApplicationSites'].includes(settingsKey)) {
                                settings[settingsKey] = baseSettings.concat(overrideSettings[settingsKey])
                                continue
                            }
                            settings[settingsKey] = overrideSettings[settingsKey]
                        }
                        platformConfig.features[key][platformKey] = settings
                    } else if ((key === 'clickToLoad' || key === 'clickToPlay') && platformKey === 'settings') {
                        // Handle Click to Load settings override later, so that individual entities
                        // are disabled/enabled correctly (and disabled by default).
                        continue
                    } else {
                        platformConfig.features[key][platformKey] = platformOverride.features[key][platformKey]
                    }
                }

                if (platformOverride.features[key].exceptions) {
                    if (key === 'contentBlocking') {
                        addExceptionsToUnprotected(platformOverride.features[key].exceptions)
                    }
                    platformConfig.features[key].exceptions = platformConfig.features[key].exceptions.concat(platformOverride.features[key].exceptions)
                }
            }

            // Ensure the correct enabled state for Click to Load entities.
            if (key === 'clickToLoad' || key === 'clickToPlay') {
                const clickToLoadSettings = platformConfig?.features?.[key]?.settings
                if (clickToLoadSettings) {
                    const clickToLoadSettingsOverride = platformOverride?.features?.[key]?.settings
                    for (const entity of Object.keys(clickToLoadSettings)) {
                        clickToLoadSettings[entity].state =
                            clickToLoadSettingsOverride?.[entity]?.state || clickToLoadSettings[entity].state || 'disabled'
                    }
                }
            }

            if (isFeatureMissingState(platformConfig.features[key])) {
                platformConfig.features[key].state = 'disabled'
            }
        }

        // Add platform specific features
        for (const key of Object.keys(platformOverride.features)) {
            if (platformConfig.features[key]) {
                continue
            }

            platformConfig.features[key] = { ...platformOverride.features[key] }
            if (isFeatureMissingState(platformConfig.features[key])) {
                platformConfig.features[key].state = 'disabled'
            }
        }

        // Remove appTP feature from platforms that don't use it since it's a large feature
        if ('appTrackerProtection' in platformConfig.features && platformConfig.features.appTrackerProtection.state === 'disabled') {
            delete platformConfig.features.appTrackerProtection
        }

        if (platformOverride.unprotectedTemporary) {
            addExceptionsToUnprotected(platformOverride.unprotectedTemporary)
            platformConfig.unprotectedTemporary = platformConfig.unprotectedTemporary.concat(platformOverride.unprotectedTemporary)
        }

        addCnameEntriesToAllowlist(tds, platformConfig.features.trackerAllowlist.settings.allowlistedTrackers)
        platformConfig = inlineReasonArrays(platformConfig)
        platformConfigs[platform] = platformConfig

        writeConfigToDisk(platform, platformConfig)
    }
    return platformConfigs
}

buildPlatforms().then((platformConfigs) => {
    // Generate legacy formats
    const legacyTextDomains = [...unprotectedDomains].join('\n')
    fs.writeFileSync(`${GENERATED_DIR}/trackers-unprotected-temporary.txt`, legacyTextDomains)
    fs.writeFileSync(`${GENERATED_DIR}/trackers-whitelist-temporary.txt`, legacyTextDomains)
    const legacyNaming = {
        fingerprintingCanvas: 'canvas',
        trackingCookies3p: 'cookie',
        fingerprintingAudio: 'audio',
        fingerprintingTemporaryStorage: 'temporary-storage',
        referrer: 'referrer',
        fingerprintingBattery: 'battery',
        fingerprintingScreenSize: 'screen-size',
        fingerprintingHardware: 'hardware',
        googleRejected: 'floc',
        gpc: 'gpc',
        autofill: 'autofill'
    }
    const protections = {}
    for (const key in legacyNaming) {
        const feature = platformConfigs.extension.features[key]
        const legacyConfig = {
            enabled: feature.state === 'enabled',
            sites: feature.exceptions.map((obj) => obj.domain),
            scripts: []
        }
        protections[legacyNaming[key]] = legacyConfig
    }
    fs.writeFileSync(`${GENERATED_DIR}/protections.json`, JSON.stringify(protections, null, 4))
    fs.writeFileSync(`${GENERATED_DIR}/fingerprinting.json`, JSON.stringify(protections, null, 4))
})
