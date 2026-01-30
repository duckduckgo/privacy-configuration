import { Operation } from './json-patch';

export type SiteException = {
    domain: string;
    reason?: string;
};

export type Cohort = {
    name: string;
    weight: number;
};

export type FeatureState = 'enabled' | 'disabled' | 'internal' | 'preview';

type FeatureMeta = {
    description: string;
    sampleExcludeRecords?: any;
};

/* Note this defaults to Record<string, string>
   but individual features can and should define their own SubFeature schema type like:
   https://github.com/duckduckgo/privacy-configuration/blob/4cc65fa5cc5244eef832440adfd40064c733e736/schema/features/android-browser-config.ts#L22-L39
*/
export type SubFeature<VersionType, SettingsType = Record<string, string>> = {
    state: FeatureState;
    settings?: SettingsType;
    rollout?: {
        steps: { percent: number }[];
    };
    description?: string;
    targets?: {
        variantKey?: string;
        localeCountry?: string;
        localeLanguage?: string;
        isReturningUser?: boolean;
        isPrivacyProEligible?: boolean;
    }[];
    cohorts?: Cohort[];
    minSupportedVersion?: VersionType;
};

export type Feature<
    SettingsType,
    VersionType,
    SubFeatures extends Record<string, SubFeature<VersionType>> = Record<string, SubFeature<VersionType>>,
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

type ConditionBlock = {
    domain?: string;
    urlPattern?: string;
    experiment?: {
        experimentName: string;
        cohort: string;
    };
    injectName?: string;
    minSupportedVersion?: number;
    maxSupportedVersion?: number;
    internal?: boolean;
    preview?: boolean;
    context?: {
        top?: boolean;
        frame?: boolean;
    };
};

export type ConditionBlockOrArray = ConditionBlock | ConditionBlock[];

type JSONValidValueType = boolean | string | number | object | Array<boolean | string | number | object>;

type CSSInjectFeatureSettingsPatches = {
    domains?: {
        domain: string | string[];
        patchSettings: Operation<JSONValidValueType>[];
    }[];
    conditionalChanges?: {
        condition: ConditionBlockOrArray;
        patchSettings: Operation<JSONValidValueType>[];
    }[];
};

/**
 * Used in Content Scope Scripts to take config objects and turn them into values
 */
export type CSSConfigSetting = CSSConfigSettingSingle | CSSConfigSettingSingle[];

type CSSConfigSettingSingle = {
    type: 'undefined' | 'number' | 'string' | 'function' | 'boolean' | 'null' | 'array' | 'object';
    functionName?: string;
    value?: JSONValidValueType;
    criteria?: {
        arch: string;
    };
};

export type CSSInjectFeatureSettings<T> = T & CSSInjectFeatureSettingsPatches;

export type GenericFeature = Feature<any, string | number>;
