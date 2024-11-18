import { CSSInjectFeatureSettings, Feature, FeatureState } from '../feature';

export type MessageBridgeSettings = CSSInjectFeatureSettings<{
    aiChat: FeatureState;
}>;

export type MessageBridgeFeature<VersionType> = Feature<MessageBridgeSettings, VersionType>;
