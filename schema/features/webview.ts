import { Feature, SubFeature } from '../feature';

type SubFeatures<VersionType> = {
    browserLaunchAttempts?: SubFeature<
        VersionType,
        {
            attemptCount: number;
        }
    >;
};

export type WebViewConfig<VersionType> = Feature<
    Record<string, string>,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
