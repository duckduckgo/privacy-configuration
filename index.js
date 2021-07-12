const fs = require('fs')

const OVERRIDE_DIR = 'overrides';
const GENERATED_DIR = 'generated';
const LISTS_DIR = 'exceptionLists';

let defaultConfig = JSON.parse(fs.readFileSync('defaultConfig.json'));

const platforms = [
    'extension',
    'ios',
    'android',
    'macos',
    'windows'
]

/**
 * Write a config file to disk
 * 
 * @param {string} platform - platform to write
 * @param {object} config - the object to write
 */
function writeConfigToDisk(platform, config) {
    fs.writeFileSync(`${GENERATED_DIR}/${platform}Config.json`, JSON.stringify(config, null, 4))
}

// Grab all exception lists
const jsonListNames = fs.readdirSync(LISTS_DIR).filter(listName => listName.includes('Sites'))
for (let jsonList of jsonListNames) {
    const listData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/${jsonList}`))
    const configKey = jsonList.split('Sites')[0]
    // Find the list object
    for (let key of Object.keys(listData)) {
        if (Array.isArray(listData[key])) {
            defaultConfig.features[configKey].exceptions = listData[key]
        }
    }
}

const listData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/trackersUnprotectedTemporary.json`))
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
   autofill: 'autofill',
}
const protections = {};
for (const key in legacyNaming) {
    const newConfig = defaultConfig.features[key]
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
    let platformConfig = { ...defaultConfig }
    const overridePath = `${OVERRIDE_DIR}/${platform}Override.json`

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

    if (platformOverride.unprotectedTemporary) {
        platformConfig.unprotectedTemporary = platformConfig.unprotectedTemporary.concat(platformOverride.unprotectedTemporary)
    }

    writeConfigToDisk(platform, platformConfig)
}
