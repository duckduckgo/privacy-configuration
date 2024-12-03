import { CSSInjectFeatureSettings, Feature, SubFeature } from '../feature';

type VersionSettings = {
    versions: AppVersionConfig[];
};

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

export type AndroidBrowserConfig<VersionType> = Feature<VersionSettings, VersionType>;
