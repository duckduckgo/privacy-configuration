import { CSSInjectFeatureSettings, Feature, FeatureState } from '../feature';
import { ConditionBlockOrArray } from '../feature';

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

type MatchCondition = Partial<{
    text: MaybeArray<{
        pattern: MaybeArray<string>;
        selector?: MaybeArray<string>;
    }>;
    element: MaybeArray<{
        selector: MaybeArray<string>;
        visibility?: 'visible' | 'hidden' | 'any';
    }>;
}>;

export type DetectorConfig = {
    state?: FeatureState;
    match: MaybeArray<MatchCondition>;
    triggers?: Triggers;
    actions?: Actions;
};

type DetectorGroup = Record<string, DetectorConfig>;

export type WebDetectionSettings = CSSInjectFeatureSettings<{
    detectors?: Record<string, DetectorGroup>;
}>;

export type WebDetectionFeature<VersionType> = Feature<WebDetectionSettings, VersionType>;
