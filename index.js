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

function writeConfigToDisk(platform, config) {
    fs.writeFileSync(`${GENERATED_DIR}/${platform}-config.json`, JSON.stringify(config, null, 4))
}

// Grab all allow lists
const listNames = [
    'trackers-unprotected-temporary.txt',
    'trackers-whitelist-temporary.txt'
]
for (let listName of listNames) {
    const listTxt = fs.readFileSync(`${LISTS_DIR}/${listName}`).toString().trim()
    const list = listTxt.split('\n')

    const listKey = listName.split('.')[0]
    defaultConfig.allowLists[listKey] = list
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

    // TODO: Iterate allowlists and add/remove entries

    writeConfigToDisk(platform, platformConfig)
}

// TODO: Upload genreated configs to s3

