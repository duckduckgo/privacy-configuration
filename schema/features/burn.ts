import { Feature, SubFeature } from '../feature';

type SubFeatures<VersionType> = {
    useExtensionBasedBurn?: SubFeature<
        VersionType,
        {
            useSubController?: boolean;
            pollingIntervalMs?: number;
            timeoutIntervalSeconds?: number;
        }
    >;
};

export type BurnFeature<VersionType> = Feature<
    Record<string, never>,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
