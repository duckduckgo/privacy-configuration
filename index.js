const fs = require('fs')
const jsonpatch = require('fast-json-patch')
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args))

const { addCnameEntriesToAllowlist, inlineReasonArrays, addHashToFeatures } = require('./util')

const GENERATED_DIR = 'generated'
const LISTS_DIR = 'features'
const BROWSERS_SUBDIR = 'browsers/'

const defaultConfig = {
    readme: 'https://github.com/duckduckgo/privacy-configuration',
    version: Date.now(),
    features: {}
}

const platforms = require('./platforms')

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
function writeConfigToDisk (platform, config, v1Config) {
    let configName = platform
    if (platform.includes(BROWSERS_SUBDIR)) {
        configName = platform.replace(BROWSERS_SUBDIR, 'extension-')
    }

    // Now that the features have been finalized, write out their hashes
    addHashToFeatures(config)
    addHashToFeatures(v1Config)

    fs.writeFileSync(`${GENERATED_DIR}/v2/${configName}-config.json`, JSON.stringify(config, null, 4))
    fs.writeFileSync(`${GENERATED_DIR}/v1/${configName}-config.json`, JSON.stringify(v1Config, null, 4))
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

function generateV1Config (platformConfig) {
    const v1Config = JSON.parse(JSON.stringify(platformConfig))

    // Disable features with a minSupported version.
    // This key is not supported in v1 and any features with this key
    // will need to be disabled.
    for (const feature of Object.keys(v1Config.features)) {
        if (v1Config.features[feature].minSupportedVersion) {
            delete v1Config.features[feature].minSupportedVersion
            v1Config.features[feature].state = 'disabled'
        }

        if (v1Config.features[feature].eol === 'v1') {
            // This feature's support ends in v1 so remove it from platformConfig
            delete v1Config.features[feature].eol
            delete platformConfig.features[feature]
        }
    }

    return v1Config
}

const unprotectedListName = 'unprotected-temporary.json'

// Grab all exception lists
const jsonListNames = fs.readdirSync(LISTS_DIR).filter(listName => {
    return listName !== unprotectedListName && listName !== '_template.json'
})
const patches = {}
for (const jsonList of jsonListNames) {
    const listData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/${jsonList}`))
    const configKey = jsonList.replace(/[.]json$/, '').replace(/-([a-z0-9])/g, function (g) { return g[1].toUpperCase() })

    delete listData._meta
    patches[configKey] = listData._patches
    delete listData._patches
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
// Create version directories
mkdirIfNeeded(`${GENERATED_DIR}/v1`)
mkdirIfNeeded(`${GENERATED_DIR}/v2`)

// Handle platform specific overrides and write configs to disk
async function buildPlatforms () {
    const platformConfigs = {}
    const tds = await getTds()

    for (const platform of platforms) {
        let platformConfig = JSON.parse(JSON.stringify(defaultConfig))

        for (const feature of Object.keys(platformConfig.features)) {
            if (patches[feature]?.[platform]) {
                console.log(`Applying patches for ${feature} on ${platform}`)
                jsonpatch.applyPatch(platformConfig.features[feature], patches[feature][platform])
            }
        }

        // Remove appTP feature from platforms that don't use it since it's a large feature
        if ('appTrackerProtection' in platformConfig.features && platformConfig.features.appTrackerProtection.state === 'disabled') {
            delete platformConfig.features.appTrackerProtection
        }

        addCnameEntriesToAllowlist(tds, platformConfig.features.trackerAllowlist.settings.allowlistedTrackers)
        platformConfig = inlineReasonArrays(platformConfig)
        platformConfigs[platform] = platformConfig

        const v1PlatformConfig = generateV1Config(platformConfig)

        writeConfigToDisk(platform, platformConfig, v1PlatformConfig)
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
