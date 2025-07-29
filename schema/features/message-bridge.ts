import { CSSInjectFeatureSettings, Feature, FeatureState } from '../feature';

export type MessageBridgeSettings = CSSInjectFeatureSettings<{
    aiChat: FeatureState;
    subscriptions?: FeatureState;
    subscriptionPages?: FeatureState;
    serpSettings?: FeatureState;
}>;

export type MessageBridgeFeature<VersionType> = Feature<MessageBridgeSettings, VersionType>;
