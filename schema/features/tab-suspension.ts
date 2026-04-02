import { Feature, FeatureState } from '../feature';

type SettingsType = {
    inputFieldFocusDetection?: {
        state: FeatureState;
    };
};

export type TabSuspension<VersionType> = Feature<SettingsType, VersionType>;
