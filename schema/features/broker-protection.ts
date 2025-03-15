import { Feature, FeatureState } from '../feature';

interface BrokerProtectionSettings {
    useWebViewActionsV2: FeatureState;
}

export type BrokerProtectionFeature<VersionType> = Feature<BrokerProtectionSettings, VersionType>;
