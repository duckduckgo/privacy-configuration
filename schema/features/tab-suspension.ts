import { Feature } from '../feature';

type SettingsType = {
    inputFieldFocusDetection?: {
        state: string;
    };
};

export type TabSuspension<VersionType> = Feature<
    SettingsType,
    VersionType
>;
