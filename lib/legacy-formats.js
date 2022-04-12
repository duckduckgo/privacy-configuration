const legacyFormats = [
    {
        configVersion: 'v1',
        transition(platformConfig) {
            const v1Config = JSON.parse(JSON.stringify(platformConfig))

            // Disable features with a minSupported version.
            // This key is not supported in v1 and any features with this key
            // will need to be disabled.
            for (const feature of Object.keys(v1Config.features)) {
                if (v1Config.features[feature].minSupportedVersion) {
                    delete v1Config.features[feature].minSupportedVersion
                    v1Config.features[feature].state = 'disabled'
                }
            }

            return v1Config
        }
    }
]

export default legacyFormats
