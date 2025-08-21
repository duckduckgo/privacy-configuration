import { Feature, CSSInjectFeatureSettings, CSSConfigSetting, FeatureState } from '../feature';

type FullFingerprintingScreenSizeOptions = CSSInjectFeatureSettings<{
    availTop?: CSSConfigSetting;
    availLeft?: CSSConfigSetting;
    colorDepth?: CSSConfigSetting;
    pixelDepth?: CSSConfigSetting;
    additionalEnabledCheck?: FeatureState;
}>;

export type FingerprintingScreenSizeFeature<VersionType> = Feature<Partial<FullFingerprintingScreenSizeOptions>, VersionType>;
