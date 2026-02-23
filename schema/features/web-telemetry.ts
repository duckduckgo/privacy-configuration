import { Feature, CSSInjectFeatureSettings, FeatureState } from '../feature';

type WebTelemetrySettings = CSSInjectFeatureSettings<{
    videoPlayback?: FeatureState;
    urlChanged?: FeatureState;
}>;

export type WebTelemetryFeature<VersionType> = Feature<WebTelemetrySettings, VersionType>;
