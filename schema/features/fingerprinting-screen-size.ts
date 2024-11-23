import { Feature, CSSInjectFeatureSettings, CSSConfigSetting } from '../feature';

type FullFingerprintingScreenSizeOptions = CSSInjectFeatureSettings<{
    availTop?: CSSConfigSetting;
    availLeft?: CSSConfigSetting;
    colorDepth?: CSSConfigSetting;
    pixelDepth?: CSSConfigSetting;
}>;

export type FingerprintingScreenSizeFeature<VersionType> = Feature<Partial<FullFingerprintingScreenSizeOptions>, VersionType>;
