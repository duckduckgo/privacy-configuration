import { Feature } from '../feature';

// Each value is a comma-separated list of Chromium feature names, applied by the Windows browser to the
// --enable-features/--disable-features switches it starts its Chromium-based web view with.
type ChromiumFeatureOverridesSettings = {
    addToEnableFeatures?: string;
    removeFromEnableFeatures?: string;
    addToDisableFeatures?: string;
    removeFromDisableFeatures?: string;
};

export type ChromiumFeatureOverridesFeature<VersionType> = Feature<ChromiumFeatureOverridesSettings, VersionType>;
