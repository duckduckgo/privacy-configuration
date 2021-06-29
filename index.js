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
 * Write a onfig file to disk
 * 
 * @param {string} platform - platform o write
 * @param {object} config - the object to write
 */
function writeConfigToDisk(platform, config) {
    fs.writeFileSync(`${GENERATED_DIR}/${platform}-config.json`, JSON.stringify(config, null, 4))
}

// Grab all allow lists
const jsonListNames = [
    'cookie_configuration.json',
    'trackers-unprotected-temporary.json',
    'autofillSites.json',
]
for (let jsonList of jsonListNames) {
    const listData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/${jsonList}`))
    // Find the list object
    for (let key of Object.keys(listData)) {
        if (Array.isArray(listData[key])) {
            defaultConfig.allow[key] = listData[key]
        }
    }
}
const fingerprintListNames = [
    'useragent_excludes.json',
    'audioSites.json',
    'canvasSites.json',
    'hardwareSites.json',
]
for (let jsonList of fingerprintListNames) {
    const listData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/${jsonList}`))
    // Find the list object
    for (let key of Object.keys(listData)) {
        if (Array.isArray(listData[key])) {
            defaultConfig.allow.fingerprinting[key] = listData[key]
        }
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

    const platformOverride = JSON.parse(fs.readFileSync(overridePath))
    for (let key of Object.keys(defaultConfig.privacyFeatures)) {
        if (platformOverride.privacyFeatures[key] && platformOverride.privacyFeatures[key] !== defaultConfig.privacyFeatures[key]) {
            platformConfig.privacyFeatures[key] = platformOverride.privacyFeatures[key]
        }
    }

    if (platformOverride.allow) {
        for (let listKey of Object.keys(platformOverride.allow)) {
            if (!Array.isArray(platformConfig.allow[listKey]))
                continue

            platformConfig.allow[listKey] = platformConfig.allow[listKey].concat(platformOverride.allow[listKey])
        }

        if (platformOverride.allow.fingerprint) {
            for (let listKey of Object.keys(platformOverride.allow.fingerprint)) {
                if (!Array.isArray(platformConfig.allow.fingerprint[listKey]))
                    continue
    
                platformConfig.allow.fingerprint[listKey] = platformConfig.allow.fingerprint[listKey].concat(platformOverride.allow.fingerprint[listKey])
            }
        }
    }

    writeConfigToDisk(platform, platformConfig)
}
