import { CSSInjectFeatureSettings, Feature, FeatureState } from '../feature';
import { ConditionBlockOrArray } from '../feature';

type OrArray<T> = T | T[];

type AndArray<T> = T | T[];

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
    text: OrArray<{
        pattern: AndArray<string>;
        selector?: AndArray<string>;
    }>;
    element: OrArray<{
        selector: AndArray<string>;
        visibility?: 'visible' | 'hidden' | 'any';
    }>;
}>;

type DetectorConfig = {
    state?: FeatureState;
    match: OrArray<MatchCondition>;
    triggers?: Triggers;
    actions?: Actions;
};

type DetectorGroup = Record<string, DetectorConfig>;

export type WebDetectionSettings = CSSInjectFeatureSettings<{
    detectors?: Record<string, DetectorGroup>;
}>;

export type WebDetectionFeature<VersionType> = Feature<WebDetectionSettings, VersionType>;
