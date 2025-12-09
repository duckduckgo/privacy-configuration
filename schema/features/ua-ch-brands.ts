import { CSSInjectFeatureSettings, Feature } from '../feature';

type StateToggle = 'enabled' | 'disabled';

type UaChBrandsSettings = CSSInjectFeatureSettings<{
    // Defaults to enabled when feature state is enabled
    filterWebView2?: StateToggle;
    // Defaults to enabled when feature state is enabled
    overrideEdge?: StateToggle;
}>;

export type UaChBrandsFeature<VersionType> = Feature<UaChBrandsSettings, VersionType>;

