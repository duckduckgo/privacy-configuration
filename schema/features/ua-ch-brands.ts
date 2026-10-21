import { CSSInjectFeatureSettings, Feature, FeatureState } from '../feature';

type UaChBrandsSettings = CSSInjectFeatureSettings<{
    additionalCheck?: FeatureState;
    brandName?: string;
}>;

export type UaChBrandsFeature<VersionType> = Feature<UaChBrandsSettings, VersionType>;
