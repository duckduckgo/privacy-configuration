import { CSSInjectFeatureSettings, Feature, SubFeature } from '../feature';

// Type of the feature `settings` object
type SettingsType = undefined;

type AppVersionConfig = {
    appVersion: number;
    daysUntilLoggingStarts: number;
    daysLogging: number;
    featuresLogged: FeatureLogged;
};

type FeatureLogged = {
    gpc: boolean;
    cpm: boolean;
    appTP: boolean;
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
    // This subfeature allowlists web local storage when the fire button is pressed
    webLocalStorage?: SubFeature<
        VersionType,
        {
            // Domains to be allowlisted
            domains: string[];
            // Patterns to be matched in the WebView's LevelDB
            matchingRegex: string[];
        }
    >;
};

export type AndroidBrowserConfig<VersionType> = Feature<
    SettingsType,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
