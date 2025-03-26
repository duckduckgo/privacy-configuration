import { Feature, CSSInjectFeatureSettings } from '../feature';
import { Operation } from '../json-patch';

type State = 'enabled' | 'disabled';
type StateObject = {
    state: State;
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
            state: State;
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
        };
        serpProxy: StateObject;
    };
}>;

export type DuckPlayerFeature<VersionType> = Feature<DuckPlayerSettings, VersionType>;
