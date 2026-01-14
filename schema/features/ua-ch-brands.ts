import { CSSInjectFeatureSettings, Feature, FeatureState } from '../feature';

type StateToggle = 'enabled' | 'disabled';

type UaChBrandsSettings = CSSInjectFeatureSettings<{
    filterWebView2?: StateToggle;
    overrideEdge?: StateToggle;
    additionalCheck?: FeatureState;
}>;

export type UaChBrandsFeature<VersionType> = Feature<UaChBrandsSettings, VersionType>;
