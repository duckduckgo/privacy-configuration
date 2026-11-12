import { CSSInjectFeatureSettings, Feature, FeatureState } from '../feature';

type TrackerProtectionSettings = CSSInjectFeatureSettings<{
    additionalCheck?: FeatureState;
    surrogateInjection?: FeatureState;
}>;

export type TrackerProtectionFeature<VersionType> = Feature<TrackerProtectionSettings, VersionType>;
