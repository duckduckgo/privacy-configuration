import { Feature, FeatureState, CSSInjectFeatureSettings } from '../feature';

type WebEventsSettings = CSSInjectFeatureSettings<{
    additionalCheck?: FeatureState;
}>;

export type WebEventsFeature<VersionType> = Feature<WebEventsSettings, VersionType>;
