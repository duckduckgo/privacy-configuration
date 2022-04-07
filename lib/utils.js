const fs = require('fs')
const constants = require('./constants')

/**
 * Write a config file to disk
 *
 * @param {string} platform - platform to write
 * @param {object} config - the object to write
 */
function writeConfigToDisk (platform, config, v1Config) {
    fs.writeFileSync(`${constants.GENERATED_DIR}/v2/${platform}-config.json`, JSON.stringify(config, null, 4))
    fs.writeFileSync(`${constants.GENERATED_DIR}/v1/${platform}-config.json`, JSON.stringify(v1Config, null, 4))
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

/**
 * Check if a feature is missing a state key
 *
 * @param {object} feature - the feature to check
 * @returns true if the feature is missing a state key
 */
function isFeatureMissingState (feature) {
    return !('state' in feature)
}

module.exports = {
    writeConfigToDisk,
    mkdirIfNeeded,
    isFeatureMissingState
}
