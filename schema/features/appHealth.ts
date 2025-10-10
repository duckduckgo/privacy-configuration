import { Feature, SubFeature } from '../feature';

type SubFeatures<VersionType> = {
    uiHangDetection?: SubFeature<
        VersionType,
        {
            includeCallStack?: boolean;
            callStackLimit?: number;
            pingDispatcher?: boolean;
            includeWindowState?: boolean;
            collectCpuUsage?: boolean;
            concurrentlyCheckDispatcher?: boolean;
            concurrentlyCheckIsHungAppWindow?: boolean;
        }
    >;
};

export type AppHealth<VersionType> = Feature<
    Record<string, never>,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
