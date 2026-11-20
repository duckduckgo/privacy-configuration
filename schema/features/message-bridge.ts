import { CSSInjectFeatureSettings, Feature, FeatureState } from '../feature';

export type MessageBridgeSettings = CSSInjectFeatureSettings<{
    aiChat: FeatureState;
    subscriptions?: FeatureState;
    subscriptionPages?: FeatureState;
    serpSettings?: FeatureState;
    serp?: FeatureState;
    duckAiNativeStorage?: FeatureState;
    internalFeedback?: FeatureState;
}>;

export type MessageBridgeFeature<VersionType> = Feature<MessageBridgeSettings, VersionType>;
