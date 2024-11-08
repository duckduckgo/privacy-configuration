export type SiteException = {
    domain: string;
    reason?: string;
};

export type FeatureState = 'enabled' | 'disabled' | 'internal';

type FeatureMeta = {
    description: string;
    sampleExcludeRecords?: any;
};

type SubFeature<VersionType> = {
    state: FeatureState;
    rollout?: {
        steps: { percent: number }[];
    };
    targets?: {
        variantKey?: string;
    }[];
    minSupportedVersion?: VersionType;
};

export type Feature<SettingsType, VersionType> = {
    readme?: string;
    _meta?: FeatureMeta;
    state: FeatureState;
    exceptions: SiteException[];
    settings?: SettingsType;
    features?: Record<string, SubFeature<VersionType>>;
    hash: string;
    minSupportedVersion?: VersionType;
};

export type GenericFeature = Feature<any, string | number>;
