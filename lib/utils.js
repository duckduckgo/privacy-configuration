import fs from 'fs'
import constants from './constants.js'
import legacyFormats from './legacy-formats.js'

/**
 * Write a config file to disk
 *
 * @param {string} platform - platform to write
 * @param {object} config - the object to write
 */
export function writeConfigToDisk (platform, config) {
    fs.writeFileSync(`${constants.GENERATED_DIR}/v2/${platform}-config.json`, JSON.stringify(config, null, 4))

    // Generate legacy configs
    for (const legacyFormat of legacyFormats) {
        const legacyConfig = legacyFormat.transition(config)
        fs.writeFileSync(`${constants.GENERATED_DIR}/${legacyFormat.configVersion}/${platform}-config.json`, JSON.stringify(legacyConfig, null, 4))
    }
}

/**
 * Create the specified directory if it doesn't exist
 *
 * @param {string} dir - directory path to create
 */
export function mkdirIfNeeded (dir) {
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
export function isFeatureMissingState (feature) {
    return !('state' in feature)
}
