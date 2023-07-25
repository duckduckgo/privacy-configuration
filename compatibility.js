function versionToInt (version) {
    // convert v2 to 2
    return parseInt(version.replace('v', ''))
}

function removeEolFeatures (config, prevConfig, version) {
    for (const feature of Object.keys(config.features)) {
        const eol = config.features[feature].eol
        if (eol && versionToInt(eol) < version) {
            // This feature's support ends in a previous config so remove it from platformConfig
            delete config.features[feature]

            if (versionToInt(eol) === version - 1) {
                // Only remove the eol key if it is the previous version
                delete prevConfig.features[feature].eol
            }
        }
    }
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
        }

        removeEolFeatures(config, v1Config, 2)

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
        }

        removeEolFeatures(config, v2Config, 3)

        return v2Config
    }
}

module.exports = {
    compatFunctions
}
