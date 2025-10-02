import { Feature, SubFeature } from '../feature';

type SubFeatures<VersionType> = {
    win10Pinning?: SubFeature<
        VersionType,
        {
            minWin10Build: number;
            minWin10Patch: number;
        }
    >;
};

export type Taskbar<VersionType> = Feature<
    Record<string, never>,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
