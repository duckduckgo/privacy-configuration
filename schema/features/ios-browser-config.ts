import { Feature, SubFeature } from '../feature';

type SettingsType = {
    promptCooldownInterval?: number;
};

type SubFeatures<VersionType> = {
    showNTPAfterIdleReturn?: SubFeature<
        VersionType,
        {
            // Seconds the app must be in the background before returning to the New Tab Page on foreground
            idleThresholdSeconds: number;
        }
    >;
};

export type IOSBrowserConfig<VersionType> = Feature<
    SettingsType,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
