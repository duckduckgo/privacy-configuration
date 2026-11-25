import { Feature, SubFeature } from '../feature';

type OnboardingAIModel = {
    id: string;
    provider: string;
    modelShortName: string;
};

type SettingsType = {
    promptCooldownInterval?: number;
    // Fallback AI model list for the onboarding model-picker step when the /models API is unavailable
    onboardingAIModelsFallback?: {
        defaultModelId: string;
        models: OnboardingAIModel[];
    };
};

type SubFeatures<VersionType> = {
    showNTPAfterIdleReturn?: SubFeature<
        VersionType,
        {
            // Seconds the app must be in the background before returning to the New Tab Page on foreground
            idleThresholdSeconds: number;
        }
    >;
    tabTerminationErrorPage?: SubFeature<
        VersionType,
        {
            // Web content kills of one tab within timeWindowSeconds that show the error page instead of a reload
            terminationCount?: number;
            // Window in seconds over which terminationCount kills are counted
            timeWindowSeconds?: number;
            // Form factors that show the error page
            supportedFormFactors?: ('phone' | 'tablet')[];
        }
    >;
    inactivityNotification?: SubFeature<
        VersionType,
        {
            // Number of days of inactivity before a notification is delivered
            daysInactive: number;
            // Maximum number of notification interactions before delivery stops
            maxInteractions: number;
        }
    >;
};

export type IOSBrowserConfig<VersionType> = Feature<
    SettingsType,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
