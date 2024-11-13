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

type SubFeature<VersionType, SettingsType = Record<string, string>> = {
    state: FeatureState;
    settings?: SettingsType;
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

export type Feature<
    SettingsType,
    VersionType,
    SubFeatures extends Record<string, SubFeature<VersionType>> = Record<string, SubFeature<VersionType>>
> = {
    readme?: string;
    _meta?: FeatureMeta;
    state: FeatureState;
    exceptions: SiteException[];
    settings?: SettingsType;
    features?: SubFeatures;
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
