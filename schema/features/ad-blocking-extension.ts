import { Feature, SubFeature } from '../feature';

type AdblockingExtensionSettings = {
    version: string;
    enabledByDefault: boolean;
    scriptlets: Record<string, {
        url: string;
        signature: string;
    }>;
};

export type AdBlockingExtensionConfig<VersionType> = Feature<
    AdblockingExtensionSettings,
    VersionType,
    Record<string, SubFeature<VersionType>>
>;