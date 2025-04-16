import { Feature, CSSInjectFeatureSettings } from '../feature';

export type DuckPlayerNativeSettings = CSSInjectFeatureSettings<{
    selectors: {
        videoElement: string;
        videoElementContainer: string;
        signInRequiredError: string;
    }
}>;

export type DuckPlayerNativeFeature<VersionType> = Feature<DuckPlayerNativeSettings, VersionType>;
