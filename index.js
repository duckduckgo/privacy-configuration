const fs = require('fs')

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
const listNames = [
    'trackers-unprotected-temporary.txt',
    'trackers-whitelist-temporary.txt',
    'audioSites.txt',
    'autofillSites.txt',
    'canvasSites.txt',
    'hardwareSites.txt',
]
for (let listName of listNames) {
    const listTxt = fs.readFileSync(`${LISTS_DIR}/${listName}`).toString().trim()
    const list = listTxt.split('\n')

    const listKey = listName.split('.')[0]
    defaultConfig.allowLists[listKey] = list
}
const jsonListNames = [
    'cookie_configuration.json',
    'useragent_excludes.json'
]
for (let jsonList of jsonListNames) {
    const listData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/${jsonList}`))
    // Find the list object
    for (let key of Object.keys(listData)) {
        if (listData[key].length) {
            defaultConfig.allowLists[key] = listData[key]
        }
    }

}

if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(GENERATED_DIR)
}

for (let platform of platforms) {
    let platformConfig = { ...defaultConfig }

    if (!fs.existsSync(`${platform}-override.json`)) {
        writeConfigToDisk(platform, platformConfig)
        continue
    }

    const platformOverride = JSON.parse(fs.readFileSync(`${platform}-override.json`))
    for (let key of Object.keys(defaultConfig.privacyFeatures)) {
        if (platformOverride.privacyFeatures[key] && platformOverride.privacyFeatures[key] !== defaultConfig.privacyFeatures[key]) {
            platformConfig.privacyFeatures[key] = platformOverride.privacyFeatures[key]
        }
    }

    if (platformOverride.allowLists) {
        for (let listKey of Object.keys(platformOverride.allowLists)) {
            platformConfig.allowLists[listKey] = platformConfig.allowLists[listKey].concat(platformOverride.allowLists[listKey])
        }
    }

    writeConfigToDisk(platform, platformConfig)
}

// TODO: Upload genreated configs to s3

