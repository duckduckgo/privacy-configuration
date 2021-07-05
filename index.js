const fs = require('fs')

const OVERRIDE_DIR = 'overrides';
const GENERATED_DIR = 'generated';
const LISTS_DIR = 'content-blocking-lists';

let defaultConfig = JSON.parse(fs.readFileSync('default-config.json'));

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
    fs.writeFileSync(`${GENERATED_DIR}/${platform}-config.json`, JSON.stringify(config, null, 4))
}

// Grab all exception lists
const jsonListNames = fs.readdirSync(LISTS_DIR).filter(listName => listName.includes('Sites'))
for (let jsonList of jsonListNames) {
    const listData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/${jsonList}`))
    const configKey = jsonList.split('Sites')[0]
    // Find the list object
    for (let key of Object.keys(listData)) {
        if (Array.isArray(listData[key])) {
            defaultConfig.privacyFeatures[configKey].exceptions = listData[key]
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

if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(GENERATED_DIR)
}

// Handle platform specific overrides and write configs to disk
for (let platform of platforms) {
    let platformConfig = { ...defaultConfig }
    const overridePath = `${OVERRIDE_DIR}/${platform}-override.json`

    if (!fs.existsSync(overridePath)) {
        writeConfigToDisk(platform, platformConfig)
        continue
    }

    // Handle feature overrides
    const platformOverride = JSON.parse(fs.readFileSync(overridePath))
    for (let key of Object.keys(defaultConfig.privacyFeatures)) {
        if (platformOverride.privacyFeatures[key]) {
            // Override existing keys
            for (let platformKey of Object.keys(platformOverride.privacyFeatures[key])) {
                if (platformKey === 'exceptions') {
                    continue
                }

                platformConfig.privacyFeatures[key][platformKey] = platformOverride.privacyFeatures[key][platformKey]
            }

            if (platformOverride.privacyFeatures[key].exceptions) {
                platformConfig.privacyFeatures[key].exceptions = platformConfig.privacyFeatures[key].exceptions.concat(platformOverride.privacyFeatures[key].exceptions)
            }
        }
    }

    if (platformOverride.unprotectedTemporary) {
        platformConfig.unprotectedTemporary = platformConfig.unprotectedTemporary.concat(platformOverride.unprotectedTemporary)
    }

    writeConfigToDisk(platform, platformConfig)
}
