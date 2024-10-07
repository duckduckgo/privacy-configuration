import { Feature } from "../feature";

export type AutoconsentFeature<VersionType> = Feature<{
    disabledCMPs: string[]
}, VersionType>;
