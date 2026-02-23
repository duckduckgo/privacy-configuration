import { CSSInjectFeatureSettings, Feature } from '../feature';

type WebEventsSettings = CSSInjectFeatureSettings<Record<string, never>>;

export type WebEventsFeature<VersionType> = Feature<WebEventsSettings, VersionType>;
