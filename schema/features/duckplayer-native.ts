import { Feature, CSSInjectFeatureSettings } from '../feature';

export type DuckPlayerNativeSettings = CSSInjectFeatureSettings<{
    selectors: {
        adShowing: string;
        errorContainer: string;
        playerControlsContainer: string;
        signInRequiredError: string;
        videoElement: string;
        videoElementContainer: string;
        youtubeError: string;
    };
}>;

export type DuckPlayerNativeFeature<VersionType> = Feature<DuckPlayerNativeSettings, VersionType>;
