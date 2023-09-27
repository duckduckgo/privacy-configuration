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
    v1: (unmodifiedConfig, config) => {
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
    v2: (unmodifiedConfig, config) => {
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
    },
    v3: (unmodifiedConfig, config) => {
        // Breaking changes: none, reasons stripped starting in v4

        const v3Config = JSON.parse(JSON.stringify(config))

        // Replace reasons
        for (const key of Object.keys(unmodifiedConfig.features)) {
            for (const i in unmodifiedConfig.features[key].exceptions) {
                v3Config.features[key].exceptions[i].reason = unmodifiedConfig.features[key].exceptions[i].reason
            }

            if (key === 'trackerAllowlist') {
                for (const domain of Object.keys(unmodifiedConfig.features[key].settings.allowlistedTrackers)) {
                    for (const i in unmodifiedConfig.features[key].settings.allowlistedTrackers[domain].rules) {
                        v3Config.features[key].settings.allowlistedTrackers[domain].rules[i].reason = unmodifiedConfig.features[key].settings.allowlistedTrackers[domain].rules[i].reason
                    }
                }
            }

            if (key === 'customUserAgent') {
                if (unmodifiedConfig.features[key].settings.omitApplicationSites) {
                    for (const i in unmodifiedConfig.features[key].settings.omitApplicationSites) {
                        v3Config.features[key].settings.omitApplicationSites[i].reason = unmodifiedConfig.features[key].settings.omitApplicationSites[i].reason
                    }
                }
                if (unmodifiedConfig.features[key].settings.omitVersionSites) {
                    for (const i in unmodifiedConfig.features[key].settings.omitVersionSites) {
                        v3Config.features[key].settings.omitVersionSites[i].reason = unmodifiedConfig.features[key].settings.omitVersionSites[i].reason
                    }
                }
            }
        }

        return v3Config
    }
}

module.exports = {
    removeEolFeatures,
    compatFunctions
}
