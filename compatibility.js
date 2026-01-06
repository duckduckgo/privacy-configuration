function versionToInt(version) {
    // convert v2 to 2
    return parseInt(version.replace('v', ''));
}

/**
 * Remove features from `config` that have reached their end of life.
 * This function will also remove the `eol` key from features when it
 * matches the current version of `config`.
 *
 * @param {object} config - the config object to remove eol features from
 * @param {int} version - the version of the config object
 */
export function removeEolFeatures(config, version) {
    for (const feature of Object.keys(config.features)) {
        const eol = config.features[feature].eol;
        if (!eol) {
            continue;
        }

        const eolInt = versionToInt(eol);
        if (eolInt < version) {
            // This feature's support ends in a previous config so remove it from platformConfig
            delete config.features[feature];
        } else if (eolInt >= version) {
            // Remove the eol key if it matches the current version
            delete config.features[feature].eol;
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
export const compatFunctions = {
    v1: (config) => {
        // Breaking changes: minSupportedVersion key in features

        const v1Config = JSON.parse(JSON.stringify(config));
        for (const feature of Object.keys(v1Config.features)) {
            if (v1Config.features[feature].minSupportedVersion) {
                delete v1Config.features[feature].minSupportedVersion;
                v1Config.features[feature].state = 'disabled';
            }
        }

        return v1Config;
    },
    v2: (config) => {
        // Breaking changes: rollout key in sub-features

        const v2Config = JSON.parse(JSON.stringify(config));
        for (const feature of Object.keys(v2Config.features)) {
            const subFeatures = v2Config.features[feature].features;
            if (subFeatures) {
                for (const subFeature of Object.keys(subFeatures)) {
                    if (subFeatures[subFeature].rollout) {
                        delete subFeatures[subFeature].rollout;
                        v2Config.features[feature].features[subFeature].state = 'disabled';
                    }
                }
            }
        }

        return v2Config;
    },
    v3: (config, unmodifiedConfig, platform) => {
        // Breaking changes: none, reasons stripped starting in v4

        const v3Config = JSON.parse(JSON.stringify(config));

        /**
         * This function will take reasons from the source array and assign them to the target array.
         *
         * @param {Array} target - the array to assign reasons to
         * @param {Array} source - the array to pull reasons from
         */
        function assignReasons(target, source) {
            target = target.map((exception, i) => {
                const reason = source[i]?.reason || '';
                return Object.assign(exception, { reason });
            });
        }

        // Replace reasons
        for (const key of Object.keys(unmodifiedConfig.features)) {
            v3Config.features[key].exceptions = v3Config.features[key].exceptions || [];
            assignReasons(v3Config.features[key].exceptions, unmodifiedConfig?.features[key]?.exceptions);

            if (key === 'trackerAllowlist') {
                for (const domain of Object.keys(unmodifiedConfig.features[key].settings.allowlistedTrackers)) {
                    const rules = v3Config.features[key].settings.allowlistedTrackers[domain].rules;
                    assignReasons(rules, unmodifiedConfig?.features[key]?.settings?.allowlistedTrackers[domain]?.rules);
                }
            }

            if (key === 'customUserAgent') {
                if (unmodifiedConfig.features[key].settings.omitApplicationSites) {
                    assignReasons(
                        v3Config.features[key].settings.omitApplicationSites,
                        unmodifiedConfig.features[key].settings.omitApplicationSites,
                    );
                }
                if (unmodifiedConfig.features[key].settings.omitVersionSites) {
                    assignReasons(
                        v3Config.features[key].settings.omitVersionSites,
                        unmodifiedConfig.features[key].settings.omitVersionSites,
                    );
                }
            }
        }

        // Change "internal" feature + sub-feature state to "disabled" for the
        // v3 Windows config. Older versions of the Windows browser cannot parse
        // configurations that use the "internal" state.
        if (platform === 'windows') {
            for (const feature of Object.values(v3Config.features)) {
                if (feature.state === 'internal') {
                    feature.state = 'disabled';
                }

                if (feature.features) {
                    for (const subFeature of Object.values(feature.features)) {
                        if (subFeature.state === 'internal') {
                            subFeature.state = 'disabled';
                        }
                    }
                }
            }
        }

        return v3Config;
    },
    v4: (config, unmodifiedConfig, platform) => {
        // Breaking changes: added preview state for features and sub-features.

        const v4Config = JSON.parse(JSON.stringify(config));
        // [Windows] Invalid states for features and sub-features will be automatically set to "disabled" from Windows Release v0.118.0
        for (const feature of Object.values(v4Config.features)) {
            if (feature.state === 'preview') {
                feature.state = 'disabled';
            }

            if (feature.features) {
                for (const subFeature of Object.values(feature.features)) {
                    if (subFeature.state === 'preview') {
                        subFeature.state = 'disabled';
                    }
                }
            }
        }
        return v4Config;
    },
    v5: (config, unmodifiedConfig, platform) => {
        // Breaking changes:
        // - Added exceptions to sub-features
        // - Added rollout, targets, description, cohorts to parent features

        const v5Config = JSON.parse(JSON.stringify(config));

        for (const feature of Object.values(v5Config.features)) {
            // Strip parent-level rollout, targets, description, cohorts (v6 additions)
            delete feature.rollout;
            delete feature.targets;
            delete feature.description;
            delete feature.cohorts;

            // Strip exceptions from sub-features (v6 addition)
            if (feature.features) {
                for (const subFeature of Object.values(feature.features)) {
                    delete subFeature.exceptions;
                }
            }
        }

        return v5Config;
    },
};
