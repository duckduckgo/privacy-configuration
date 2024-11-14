import { Operation } from './json-patch';

export type SiteException = {
    domain: string;
    reason?: string;
};

export type Cohort = {
    name: string;
    weight: number;
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
        localeCountry?: string;
        localeLanguage?: string;
    }[];
    cohorts?: Cohort[];
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

type CSSInjectFeatureSettingsPatches = {
    domains: {
        domain: string | string[];
        patchSettings: Operation<string | object | number>[];
    }[];
};

export type CSSInjectFeatureSettings<T> = T & CSSInjectFeatureSettingsPatches;

export type GenericFeature = Feature<any, string | number>;
