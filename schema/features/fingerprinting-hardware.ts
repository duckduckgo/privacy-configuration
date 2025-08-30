import { Feature, CSSInjectFeatureSettings, CSSConfigSetting, FeatureState } from '../feature';

type FullFingerprintingHardwareOptions = CSSInjectFeatureSettings<{
    deviceMemory?: CSSConfigSetting;
    hardwareConcurrency?: CSSConfigSetting;
    keyboard?: CSSConfigSetting;
    additionalCheck?: FeatureState;
}>;

export type FingerprintingHardwareFeature<VersionType> = Feature<Partial<FullFingerprintingHardwareOptions>, VersionType>;
