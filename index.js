const fs = require('fs')

const OVERRIDE_DIR = 'overrides';
const GENERATED_DIR = 'generated';
const LISTS_DIR = 'exception-lists';

let defaultConfig = JSON.parse(fs.readFileSync('default-config.json'));

const platforms = [
    'extension',
    'ios',
    'android',
    'macos',
    'windows'
]

let nonDefaultLists = []

/**
 * Write a config file to disk
 * 
 * @param {string} platform - platform to write
 * @param {object} config - the object to write
 */
function writeConfigToDisk(platform, config) {
    fs.writeFileSync(`${GENERATED_DIR}/${platform}-config.json`, JSON.stringify(config, null, 4))
}

// Grab all exception lists
const jsonListNames = fs.readdirSync(LISTS_DIR).filter(listName => listName.includes('sites'))
for (let jsonList of jsonListNames) {
    const listData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/${jsonList}`))
    const configKey = jsonList.split('-sites')[0].replace(/-([a-z0-9])/g, function (g) { return g[1].toUpperCase(); });
    
    // If a list key is missing from the default config it is platform specific
    // Store it for processing with the platforms
    if (!defaultConfig.features[configKey]) {
        nonDefaultLists.push(jsonList)
        continue
    }

    // Find the list object
    for (let key of Object.keys(listData)) {
        if (Array.isArray(listData[key])) {
            defaultConfig.features[configKey].exceptions = listData[key]
        }
    }
}

const listData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/trackers-unprotected-temporary.json`))
// Find the list object
for (let key of Object.keys(listData)) {
    if (Array.isArray(listData[key])) {
        defaultConfig.unprotectedTemporary = listData[key]
    }
}

// Generate legacy formats
const domains = defaultConfig.unprotectedTemporary.map((obj) => obj.domain)
const legacyTextDomains = domains.join('\n')
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
const protections = {};
for (const key in legacyNaming) {
    let newConfig
    if (!defaultConfig.features[key]) {
        const override = JSON.parse(fs.readFileSync(`${OVERRIDE_DIR}/extension-override.json`))
        if (!override.features[key]) {
            continue
        }

        newConfig = override.features[key]

        // TODO: convert camel key to hyphen
        if (fs.existsSync(`${LISTS_DIR}/${key}-sites.json`)) {
            const listData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/${key}-sites.json`))
            for (let listKey of Object.keys(listData)) {
                if (Array.isArray(listData[listKey])) {
                    newConfig.exceptions = listData[listKey]
                }
            }
        }

    } else {
        newConfig = defaultConfig.features[key]
    }
    const legacyConfig = {
        enabled: newConfig.state === "enabled",
        sites: newConfig.exceptions.map((obj) => obj.domain),
        scripts: [],
    }
    protections[legacyNaming[key]] = legacyConfig
}
fs.writeFileSync(`${GENERATED_DIR}/protections.json`, JSON.stringify(protections, null, 4))
fs.writeFileSync(`${GENERATED_DIR}/fingerprinting.json`, JSON.stringify(protections, null, 4))

if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(GENERATED_DIR)
}

// Handle platform specific overrides and write configs to disk
for (let platform of platforms) {
    let platformConfig = JSON.parse(JSON.stringify(defaultConfig))
    const overridePath = `${OVERRIDE_DIR}/${platform}-override.json`

    if (!fs.existsSync(overridePath)) {
        writeConfigToDisk(platform, platformConfig)
        continue
    }

    // Handle feature overrides
    const platformOverride = JSON.parse(fs.readFileSync(overridePath))
    for (let key of Object.keys(defaultConfig.features)) {
        if (platformOverride.features[key]) {
            // Override existing keys
            for (let platformKey of Object.keys(platformOverride.features[key])) {
                if (platformKey === 'exceptions') {
                    continue
                }

                platformConfig.features[key][platformKey] = platformOverride.features[key][platformKey]
            }

            if (platformOverride.features[key].exceptions) {
                platformConfig.features[key].exceptions = platformConfig.features[key].exceptions.concat(platformOverride.features[key].exceptions)
            }
        }
    }

    // Add platform specific features
    for (let key of Object.keys(platformOverride.features)) {
        if (platformConfig.features[key]) {
            continue
        }

        platformConfig.features[key] = { ...platformOverride.features[key] }

        for (let listName of nonDefaultLists) {
            const configKey = listName.split('-sites')[0].replace(/-([a-z0-9])/g, function (g) { return g[1].toUpperCase(); });
            if (configKey !== key) {
                continue
            }

            const listData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/${listName}`))
            for (let listKey of Object.keys(listData)) {
                if (Array.isArray(listData[key])) {
                    platformConfig.features[key].exceptions = listData[listKey]
                }
            }
        }
    }

    if (platformOverride.unprotectedTemporary) {
        platformConfig.unprotectedTemporary = platformConfig.unprotectedTemporary.concat(platformOverride.unprotectedTemporary)
    }

    writeConfigToDisk(platform, platformConfig)
}
