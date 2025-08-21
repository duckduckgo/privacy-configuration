import { Feature, CSSInjectFeatureSettings, CSSConfigSetting, FeatureState } from '../feature';

type FullFingerprintingHardwareOptions = CSSInjectFeatureSettings<{
    deviceMemory?: CSSConfigSetting;
    hardwareConcurrency?: CSSConfigSetting;
    keyboard?: CSSConfigSetting;
    additionalEnabledCheck?: FeatureState;
}>;

export type FingerprintingHardwareFeature<VersionType> = Feature<Partial<FullFingerprintingHardwareOptions>, VersionType>;
