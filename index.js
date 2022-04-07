const fs = require('fs')
const utils = require('./lib/utils')
const constants = require('./lib/constants')
const platforms = require('./lib/platforms')
const v1generator = require('./lib/legacy-gen/v1generator')
const legacyFilesGenerator = require('./lib/legacy-gen/legacy-files-generator')

const defaultConfig = {
    readme: 'https://github.com/duckduckgo/privacy-configuration',
    version: Date.now(),
    features: {}
}

const unprotectedListName = 'unprotected-temporary.json'

// Grab all exception lists
const jsonListNames = fs.readdirSync(constants.LISTS_DIR).filter(listName => {
    return listName !== unprotectedListName && listName !== '_template.json'
})
for (const jsonList of jsonListNames) {
    const listData = JSON.parse(fs.readFileSync(`${constants.LISTS_DIR}/${jsonList}`))
    const configKey = jsonList.replace(/[.]json$/, '').replace(/-([a-z0-9])/g, function (g) { return g[1].toUpperCase() })

    delete listData._meta
    defaultConfig.features[configKey] = listData
}

// Setup initial unprotected list
const listData = JSON.parse(fs.readFileSync(`${constants.LISTS_DIR}/${unprotectedListName}`))
defaultConfig.unprotectedTemporary = listData.exceptions

// Add initial exceptions to legacy files
legacyFilesGenerator.addExceptionsToUnprotected(defaultConfig.unprotectedTemporary)
legacyFilesGenerator.addExceptionsToUnprotected(defaultConfig.features.contentBlocking.exceptions)

// Create generated directory
utils.mkdirIfNeeded(constants.GENERATED_DIR)
// Create version directories
utils.mkdirIfNeeded(`${constants.GENERATED_DIR}/v1`)
utils.mkdirIfNeeded(`${constants.GENERATED_DIR}/v2`)

const platformConfigs = {}

// Handle platform specific overrides and write configs to disk
for (const platform of platforms) {
    const platformConfig = JSON.parse(JSON.stringify(defaultConfig))
    const overridePath = `${constants.OVERRIDE_DIR}/${platform}-override.json`

    if (!fs.existsSync(overridePath)) {
        utils.writeConfigToDisk(platform, platformConfig)
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
                    legacyFilesGenerator.addExceptionsToUnprotected(platformOverride.features[key].exceptions)
                }
                platformConfig.features[key].exceptions = platformConfig.features[key].exceptions.concat(platformOverride.features[key].exceptions)
            }
        }

        if (utils.isFeatureMissingState(platformConfig.features[key])) {
            platformConfig.features[key].state = 'disabled'
        }
    }

    // Add platform specific features
    for (const key of Object.keys(platformOverride.features)) {
        if (platformConfig.features[key]) {
            continue
        }

        platformConfig.features[key] = { ...platformOverride.features[key] }
        if (utils.isFeatureMissingState(platformConfig.features[key])) {
            platformConfig.features[key].state = 'disabled'
        }
    }

    // Add platform specific exceptions to legacy unprotected list
    if (platformOverride.unprotectedTemporary) {
        legacyFilesGenerator.addExceptionsToUnprotected(platformOverride.unprotectedTemporary)
        platformConfig.unprotectedTemporary = platformConfig.unprotectedTemporary.concat(platformOverride.unprotectedTemporary)
    }

    platformConfigs[platform] = platformConfig

    // Generate legacy v1 config
    const v1PlatformConfig = v1generator.generateV1Config(platformConfig)

    utils.writeConfigToDisk(platform, platformConfig, v1PlatformConfig)
}

// Generate legacy file formats
legacyFilesGenerator.generateLegacyFiles(platformConfigs)
