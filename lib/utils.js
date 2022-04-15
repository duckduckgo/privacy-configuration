import fs from 'fs'
import constants from './constants.js'
import legacyFormats from './legacy-formats.js'

const currentConfigVersion = 'v2'

/**
 * Parse a config version string into an integer.
 *
 * @param {string} version - The version of the config to parse
 * @returns the version as an integer
 */
function parseVersionAsInt (version) {
    return parseInt(version.replace('v', ''))
}

/**
 * Check if any feature has an eol (End of Life) key. If it does,
 * remove the feature from the config if the config's version is
 * greater than the feature's eol.
 *
 * @param {object} config - The config to check
 * @param {string} version - The version of the config to check
 */
function processEols (config, version) {
    const configVersion = parseVersionAsInt(version)

    for (const featureKey of Object.keys(config.features)) {
        const feature = config.features[featureKey]
        if (feature.eol) {
            if (configVersion > parseVersionAsInt(feature.eol)) {
                delete config.features[featureKey]
            } else {
                delete config.features[featureKey].eol
            }
        }
    }
}

/**
 * Write a config file to disk
 *
 * @param {string} platform - platform to write
 * @param {object} config - the object to write
 */
export function writeConfigToDisk (platform, config) {
    // Generate legacy configs
    for (const legacyFormat of legacyFormats) {
        const legacyConfig = legacyFormat.transition(config)
        processEols(legacyConfig, legacyFormat.configVersion)
        fs.writeFileSync(`${constants.GENERATED_DIR}/${legacyFormat.configVersion}/${platform}-config.json`, JSON.stringify(legacyConfig, null, 4))
    }

    processEols(config, currentConfigVersion)
    fs.writeFileSync(`${constants.GENERATED_DIR}/${currentConfigVersion}/${platform}-config.json`, JSON.stringify(config, null, 4))
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
