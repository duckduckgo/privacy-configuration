import { Feature, SubFeature } from '../feature';

// Type of the feature `settings` object
type SettingsType = {
    aiChatURL?: string;
    onboardingCookieName?: string;
    onboardingCookieDomain?: string;
    aiChatURLIdentifiableQuery?: string;
    aiChatURLIdentifiableQueryValue?: string;
    aiChatBangs?: string[];
    aiChatBangRegex?: string;
    addressBarEntryPoint?: boolean;
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
};

export type AiChatConfig<VersionType> = Feature<
    SettingsType,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
