import { ConditionBlockOrArray, CSSInjectFeatureSettings, Feature, FeatureState } from '../feature';

type MaybeArray<T> = T | T[];

type TriggerBase = {
    state?: FeatureState;
    runConditions?: ConditionBlockOrArray;
};

type Triggers = Partial<{
    breakageReport: TriggerBase;
}>;

type Actions = Partial<{
    breakageReportData: {
        state?: FeatureState;
    };
}>;

export type ConditionTypes = {
    text: {
        pattern: MaybeArray<string>;
        selector?: MaybeArray<string>;
    };
    element: {
        selector: MaybeArray<string>;
        visibility?: 'visible' | 'hidden' | 'any';
    };
};

type MatchCondition = MaybeArray<Partial<
    {
        [K in keyof ConditionTypes]: MaybeArray<ConditionTypes[K]>;
    } & {
        [K in keyof ConditionTypes as `${K}ALL`]: MaybeArray<ConditionTypes[K]>;
    }
>>;

export type DetectorConfig = {
    state?: FeatureState;
    match: MatchCondition;
    triggers?: Triggers;
    actions?: Actions;
};

type DetectorGroup = Record<string, DetectorConfig>;

export type WebDetectionSettings = CSSInjectFeatureSettings<{
    detectors?: Record<string, DetectorGroup>;
}>;

export type WebDetectionFeature<VersionType> = Feature<WebDetectionSettings, VersionType>;
