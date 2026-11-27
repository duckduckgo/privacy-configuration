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
    sessionTimeoutMinutes?: number;
};

// Any subfeatures that have typed `settings` should be defined here.
// Subfeatures without settings (or just string:string mappings for settings) will be automatically validated.
type SubFeatures<VersionType> = {
    contextualAttachMoreTabs?: SubFeature<
        VersionType,
        {
            aiChatAttachMoreTabsLimit: number;
            promotionStartDate: string;
        }
    >;
    keepSession?: SubFeature<
        VersionType,
        {
            sessionTimeoutMinutes: number;
        }
    >;
    ntpSuggestedPrompts?: SubFeature<
        VersionType,
        {
            promptLimit: number;
        }
    >;
    // Windows: on-device models for Duck.ai. Missing settings fall back to the browser's built-in defaults.
    localModels?: SubFeature<
        VersionType,
        {
            // The runtimes a PC may use, in the order it tries them. An empty list turns every runtime off.
            runtimes?: LocalModelRuntime[];
            // Each runtime's model. Replaces the built-in models as a whole, so a runtime left out has no model.
            models?: {
                llamaCpp?: LocalModelSource;
                windowsMl?: LocalModelSource;
            };
        }
    >;
};

type LocalModelRuntime = 'llamaCpp' | 'windowsMl';

type LocalModelSource = {
    id: string;
    name: string;
    // The download stops once it passes this many bytes. Windows ML's size depends on the PC's NPU, so it can be left out.
    bytes?: number;
    url?: string;
    sha256?: string;
};

export type AiChatConfig<VersionType> = Feature<
    SettingsType,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
