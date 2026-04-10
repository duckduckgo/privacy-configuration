import { Feature, FeatureState, SubFeature } from '../feature';

type SettingsType = {
    inputFieldFocusDetection?: {
        state: FeatureState;
    };
};

type SubFeatures<VersionType> = {
    isMemoryPressureTriggerEnabled?: SubFeature<VersionType>;
};

export type TabSuspension<VersionType> = Feature<
    SettingsType,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
