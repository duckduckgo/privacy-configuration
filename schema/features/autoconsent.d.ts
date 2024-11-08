import { Feature } from "../feature";

export type AutoconsentFeature<VersionType> = Feature<{
    disabledCMPs: string[] | undefined;
    enableIfMainWorldIsSupported: {
        state: 'enabled' | 'disabled';
        minSupportedVersion: VersionType;
    } | undefined
}, VersionType>;
