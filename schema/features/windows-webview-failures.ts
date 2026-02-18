import { Feature, SubFeature } from '../feature';

type SubFeatures<VersionType> = {
    crashAutoRecovery?: SubFeature<
        VersionType,
        {
            autoRecoveryBrowserEngine: boolean;
            autoRecoveryTab: boolean;
            autoRecoveryTabOutOfMemory: boolean;
        }
    >;
    nativeCrashDialogOneShot?: SubFeature<
        VersionType,
        {
            generation: number;
        }
    >;
};

export type WindowsWebViewFailures<VersionType> = Feature<
    Record<string, never>,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
