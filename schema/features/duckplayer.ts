import { Feature, CSSInjectFeatureSettings, FeatureState } from '../feature';

type StateObject = {
    state: FeatureState;
};
type BufferingFeedbackObject = StateObject & {
    spinnerTimeoutMs?: number;
    spinnerDelayMs?: number;
};
export type DuckPlayerSettings = CSSInjectFeatureSettings<{
    tryDuckPlayerLink: string;
    duckPlayerDisabledHelpPageLink: string | null;
    youtubePath: string;
    youtubeEmbedUrl: string;
    youTubeUrl: string;
    youTubeReferrerHeaders: string[];
    youTubeReferrerQueryParams: string[];
    youTubeVideoIDQueryParam: string;
    overlays: {
        youtube: {
            state: FeatureState;
            selectors: {
                thumbLink: string;
                excludedRegions: string[];
                hoverExcluded: string[];
                clickExcluded: string[];
                allowedEventTargets: string[];
                videoElement: string;
                videoElementContainer: string;
                drawerContainer?: string;
            };
            thumbnailOverlays: StateObject;
            clickInterception: StateObject;
            videoOverlays: StateObject;
            videoDrawer?: StateObject;
            bufferingFeedback?: BufferingFeedbackObject;
            fullscreenGuard?: StateObject;
        };
        serpProxy: StateObject;
    };
}>;

export type DuckPlayerFeature<VersionType> = Feature<DuckPlayerSettings, VersionType>;
