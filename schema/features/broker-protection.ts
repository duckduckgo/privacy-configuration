import { Feature, FeatureState } from '../feature';

interface BrokerProtectionSettings {
    useEnhancedCaptchaSystem: FeatureState;
}

export type BrokerProtectionFeature<VersionType> = Feature<BrokerProtectionSettings, VersionType>;
