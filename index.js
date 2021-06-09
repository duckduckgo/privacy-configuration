const fs = require('fs')

const GENERATED_DIR = 'generated';

const defaultConfig = JSON.parse(fs.readFileSync('default-config.json'));

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

