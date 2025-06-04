import { Feature, SubFeature } from '../feature';

// Type of the feature `settings` object
type SettingsType = {
    aiChatURL: string;
};

// Any subfeatures that have typed `settings` should be defined here.
// Subfeatures without settings (or just string:string mappings for settings) will be automatically validated.
type SubFeatures<VersionType> = {
    keepSession?: SubFeature<
        VersionType,
        {
            sessionTimeoutMinutes: number;
        }
    >;
    // Other subfeatures can be added here as needed
    browsingToolbarShortcut?: SubFeature<VersionType>;
    addressBarShortcut?: SubFeature<VersionType>;
    deepLink?: SubFeature<VersionType>;
};

export type AiChatConfig<VersionType> = Feature<
    SettingsType,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>; 