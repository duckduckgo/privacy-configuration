import { Feature, SubFeature } from '../feature';

type SettingsType = undefined;

type SubFeatures<VersionType> = {
    inputFieldFocusDetection?: SubFeature<VersionType>;
};

export type TabSuspension<VersionType> = Feature<
    SettingsType,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
