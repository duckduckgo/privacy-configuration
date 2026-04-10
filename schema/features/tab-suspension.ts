import { Feature, FeatureState, SubFeature } from '../feature';

type SettingsType = {
    memoryPressureTriggerTabInactivityPeriod?: number;
    inputFieldFocusDetection?: {
        state: FeatureState;
    };
};

type SubFeatures<VersionType> = {
    memoryPressureTrigger?: SubFeature<VersionType>;
};

export type TabSuspension<VersionType> = Feature<
    SettingsType,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
