function versionToInt (version) {
    // convert v2 to 2
    return parseInt(version.replace('v', ''))
}

/**
 * Remove features from `config` that have reached their end of life.
 * This function will also remove the `eol` key from features when it
 * matches the current version of `config`.
 *
 * @param {object} config - the config object to remove eol features from
 * @param {int} version - the version of the config object
 */
function removeEolFeatures (config, version) {
    for (const feature of Object.keys(config.features)) {
        const eol = config.features[feature].eol
        if (!eol) {
            continue
        }

        const eolInt = versionToInt(eol)
        if (eolInt < version) {
            // This feature's support ends in a previous config so remove it from platformConfig
            delete config.features[feature]
        } else if (eolInt >= version) {
            // Remove the eol key if it matches the current version
            delete config.features[feature].eol
        }
    }
}

/**
 * The compat functions are used to convert a config object to a previous version.
 * Each previous version of the config should have an entry which modifies the config
 * to be compatible with that version.
 *
 * Compat function format:
 * param {object} config - the config object to convert. This config should be one version higher than the target version.
 * return {object} - The converted config object
 */
const compatFunctions = {
    v1: (config) => {
        // Breaking changes: minSupportedVersion key in features

        const v1Config = JSON.parse(JSON.stringify(config))
        for (const feature of Object.keys(v1Config.features)) {
            if (v1Config.features[feature].minSupportedVersion) {
                delete v1Config.features[feature].minSupportedVersion
                v1Config.features[feature].state = 'disabled'
            }
        }

        return v1Config
    },
    v2: (config) => {
        // Breaking changes: rollout key in sub-features

        const v2Config = JSON.parse(JSON.stringify(config))
        for (const feature of Object.keys(v2Config.features)) {
            const subFeatures = v2Config.features[feature].features
            if (subFeatures) {
                for (const subFeature of Object.keys(subFeatures)) {
                    if (subFeatures[subFeature].rollout) {
                        delete subFeatures[subFeature].rollout
                        v2Config.features[feature].features[subFeature].state = 'disabled'
                    }
                }
            }
        }

        return v2Config
    }
}

module.exports = {
    removeEolFeatures,
    compatFunctions
}
