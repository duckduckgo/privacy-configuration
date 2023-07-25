function versionToInt(version) {
    // convert v2 to 2
    return parseInt(version.replace('v', ''))
}

const compatFunctions = {
    v1: (config) => {
        const v1Config = JSON.parse(JSON.stringify(config))

        // Disable features with a minSupported version.
        // This key is not supported in v1 and any features with this key
        // will need to be disabled.
        for (const feature of Object.keys(v1Config.features)) {
            if (v1Config.features[feature].minSupportedVersion) {
                delete v1Config.features[feature].minSupportedVersion
                v1Config.features[feature].state = 'disabled'
            }

            if (versionToInt(v1Config.features[feature].eol) < 2) {
                // This feature's support ends in v1 so remove it from platformConfig
                delete v1Config.features[feature].eol
                delete config.features[feature]
            }
        }

        return v1Config
    },
    v2: (config) => {
        const v2Config = JSON.parse(JSON.stringify(config))

        // Disable sub-features with a rollouts key.
        // This key is not supported in v2 and any sub-features with this key
        // will need to be disabled.
        for (const feature of Object.keys(v2Config.features)) {
            const subFeatures = v2Config.features[feature].features
            if (subFeatures) {
                for (const subFeature of Object.keys(subFeatures)) {
                    if (subFeatures[subFeature].rollouts) {
                        delete subFeatures[subFeature].rollouts
                        v2Config.features[feature].features[subFeature].state = 'disabled'
                    }
                }
            }

            if (versionToInt(v1Config.features[feature].eol) < 3) {
                // This feature's support ends in v2 so remove it from platformConfig
                delete v2Config.features[feature].eol
                delete config.features[feature]
            }
        }

        return v2Config
    }
}

module.exports = compatFunctions
