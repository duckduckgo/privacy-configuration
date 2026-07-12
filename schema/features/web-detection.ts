import { ConditionBlockOrArray, CSSInjectFeatureSettings, Feature, FeatureState } from '../feature';

type MaybeArray<T> = T | T[];

type TriggerBase = {
    state?: FeatureState;
    runConditions?: ConditionBlockOrArray;
};

type AutoTrigger = TriggerBase & {
    when: {
        intervalMs: number[];
    };
};

type Triggers = Partial<{
    breakageReport: TriggerBase;
    auto: AutoTrigger;
}>;

type ActionBase = {
    state?: FeatureState;
};

type Actions = Partial<{
    breakageReportData: ActionBase;
    fireEvent: ActionBase & {
        type: string;
    };
}>;

export type ConditionBranch<Final> = ConditionNode<Final> | ConditionNode<Final>[];

type ConditionOperator = 'any' | 'all' | 'none';

type ConditionNode<Final> = Final | { [K in ConditionOperator]?: ConditionBranch<Final> };

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

export type MatchConditionSingle = {
    [K in keyof ConditionTypes]?: ConditionBranch<ConditionTypes[K]>;
};

export type DetectorConfig = {
    state?: FeatureState;
    match: ConditionBranch<MatchConditionSingle>;
    triggers?: Triggers;
    actions?: Actions;
};

type DetectorGroup = Record<string, DetectorConfig>;

export type WebDetectionSettings = CSSInjectFeatureSettings<{
    detectors?: Record<string, DetectorGroup>;
}>;

export type WebDetectionFeature<VersionType> = Feature<WebDetectionSettings, VersionType>;
