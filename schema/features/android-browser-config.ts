import { CSSInjectFeatureSettings, Feature, SubFeature } from '../feature';

type AppVersionConfig = {
    appVersion: number;
    daysAfterBuild: number;
    daysLogging: number;
    featuresLogged: FeatureLogged;
};

type FeatureLogged = {
    gpc: boolean;
    cpm: boolean;
    appTp: boolean;
    netP: boolean;
};

// Any subfeatures that have typed `settings` should be defined here.
// Subfeatures without settings (or just string:string mappings for settings) will be automatically validated.
type SubFeatures<VersionType> = {
    featuresRequestHeader?: SubFeature<
        VersionType,
        {
            versions: AppVersionConfig[];
        }
    >;
};

export type AndroidBrowserConfig<VersionType> = Feature<VersionType, SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>>;
