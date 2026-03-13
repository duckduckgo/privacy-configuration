import { CSSInjectFeatureSettings, Feature, FeatureState } from '../feature';

export type MessageBridgeSettings = CSSInjectFeatureSettings<{
    aiChat: FeatureState;
    subscriptions?: FeatureState;
    subscriptionPages?: FeatureState;
    getSubscriptionOptions?: FeatureState;
    serpSettings?: FeatureState;
    dbpuiCommunication?: FeatureState;
    useIdentityTheftRestoration?: FeatureState;
    useSubscription?: FeatureState;
}>;

export type MessageBridgeFeature<VersionType> = Feature<MessageBridgeSettings, VersionType>;
