const fs = require('fs')

const OVERRIDE_DIR = 'overrides'
const GENERATED_DIR = 'generated'
const LISTS_DIR = 'features'

const defaultConfig = {
    readme: 'https://github.com/duckduckgo/privacy-configuration',
    version: Date.now(),
    features: {}
}

const platforms = require('./platforms')

/**
 * Write a config file to disk
 *
 * @param {string} platform - platform to write
 * @param {object} config - the object to write
 */
function writeConfigToDisk (platform, config) {
    fs.writeFileSync(`${GENERATED_DIR}/${platform}-config.json`, JSON.stringify(config, null, 4))
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

if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(GENERATED_DIR)
}

function isFeatureDisabled (feature) {
    return !('state' in feature) || feature.state === 'disabled'
}

// Handle platform specific overrides and write configs to disk
for (const platform of platforms) {
    const platformConfig = JSON.parse(JSON.stringify(defaultConfig))
    const overridePath = `${OVERRIDE_DIR}/${platform}-override.json`

    if (!fs.existsSync(overridePath)) {
        writeConfigToDisk(platform, platformConfig)
        continue
    }

    // Handle feature overrides
    const platformOverride = JSON.parse(fs.readFileSync(overridePath))
    for (const key of Object.keys(defaultConfig.features)) {
        if (platformOverride.features[key]) {
            // Override existing keys
            for (const platformKey of Object.keys(platformOverride.features[key])) {
                if (platformKey === 'exceptions') {
                    continue
                }

                platformConfig.features[key][platformKey] = platformOverride.features[key][platformKey]
            }

            if (platformOverride.features[key].exceptions) {
                if (key === 'contentBlocking') {
                    addExceptionsToUnprotected(platformOverride.features[key].exceptions)
                }
                platformConfig.features[key].exceptions = platformConfig.features[key].exceptions.concat(platformOverride.features[key].exceptions)
            }
        }
        if (isFeatureDisabled(platformConfig.features[key])) {
            // If feature isn't enabled for platform remove.
            // delete platformConfig.features[key]
            platformConfig.features[key].state = 'disabled'
        }
    }

    // Add platform specific features
    for (const key of Object.keys(platformOverride.features)) {
        if (platformConfig.features[key]) {
            continue
        }

        platformConfig.features[key] = { ...platformOverride.features[key] }
        if (isFeatureDisabled(platformConfig.features[key])) {
            // If feature isn't enabled for platform remove.
            // delete platformConfig.features[key]
            platformConfig.features[key].state = 'disabled'
        }
    }

    if (platformOverride.unprotectedTemporary) {
        addExceptionsToUnprotected(platformOverride.unprotectedTemporary)
        platformConfig.unprotectedTemporary = platformConfig.unprotectedTemporary.concat(platformOverride.unprotectedTemporary)
    }

    writeConfigToDisk(platform, platformConfig)
}

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
    floc: 'floc',
    gpc: 'gpc',
    autofill: 'autofill'
}
const protections = {}
for (const key in legacyNaming) {
    let newConfig
    const override = JSON.parse(fs.readFileSync(`${OVERRIDE_DIR}/extension-override.json`))
    if (!defaultConfig.features[key] || defaultConfig.features[key].state !== 'enabled') {
        if (!override.features[key]) {
            continue
        }

        newConfig = override.features[key]
        if (!newConfig.exceptions) {
            // feature may be disabled in default config but enabled in override
            // add exceptions from default config
            newConfig.exceptions = defaultConfig.features[key]?.exceptions || []
        }

        // TODO: convert camel key to hyphen
        if (fs.existsSync(`${LISTS_DIR}/${key}.json`)) {
            const listData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/${key}.json`))
            newConfig.exceptions = listData.exceptions
        }
    } else {
        newConfig = defaultConfig.features[key]
        newConfig.exceptions = newConfig.exceptions.concat(override.features[key]?.exceptions || [])
    }
    const legacyConfig = {
        enabled: newConfig.state === 'enabled',
        sites: newConfig.exceptions.map((obj) => obj.domain),
        scripts: []
    }
    protections[legacyNaming[key]] = legacyConfig
}
fs.writeFileSync(`${GENERATED_DIR}/protections.json`, JSON.stringify(protections, null, 4))
fs.writeFileSync(`${GENERATED_DIR}/fingerprinting.json`, JSON.stringify(protections, null, 4))
