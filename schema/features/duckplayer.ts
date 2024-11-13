import { Feature } from '../feature';
import { Operation } from '../json-patch';

type State = 'enabled' | 'disabled';
type StateObject = {
    state: State;
};
export type DuckPlayerSettings = {
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
            };
            thumbnailOverlays: StateObject;
            clickInterception: StateObject;
            videoOverlays: StateObject;
        };
        serpProxy: StateObject;
    };
    domains: {
        domain: string;
        patchSettings: Operation<string>[];
    }[];
};

export type DuckPlayerFeature<VersionType> = Feature<DuckPlayerSettings, VersionType>;
