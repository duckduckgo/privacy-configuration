import { CSSInjectFeatureSettings, Feature, FeatureState } from '../feature';

type UaChBrandsSettings = CSSInjectFeatureSettings<{
    additionalCheck?: FeatureState;
}>;

export type UaChBrandsFeature<VersionType> = Feature<UaChBrandsSettings, VersionType>;
