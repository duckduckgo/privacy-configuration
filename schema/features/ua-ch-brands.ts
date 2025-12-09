import { CSSInjectFeatureSettings, Feature } from '../feature';

type StateToggle = 'enabled' | 'disabled';

type UaChBrandsSettings = CSSInjectFeatureSettings<{
    filterWebView2?: StateToggle;
    overrideEdge?: StateToggle;
}>;

export type UaChBrandsFeature<VersionType> = Feature<UaChBrandsSettings, VersionType>;

