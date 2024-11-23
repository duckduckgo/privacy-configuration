import { Feature, CSSInjectFeatureSettings, CSSConfigSetting } from '../feature';

type FullFingerprintingHardwareOptions = CSSInjectFeatureSettings<{
    deviceMemory?: CSSConfigSetting;
    hardwareConcurrency?: CSSConfigSetting;
    keyboard?: CSSConfigSetting;
}>;

export type FingerprintingHardwareFeature<VersionType> = Feature<Partial<FullFingerprintingHardwareOptions>, VersionType>;
