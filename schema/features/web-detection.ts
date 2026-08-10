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

/**
 * Tuning for `xpath` text matching, which scans selected text in chunks rather than
 * concatenating it in full so that a large page is not held in memory at once.
 *
 * Both values are counted in characters. Omit them unless a detector needs tuning.
 *
 * Has no effect on `selector`, which always reads text in one go.
 */
type XPathConfig = {
    /**
     * Characters matched at a time. 0 turns chunking off, matching the whole
     * selected text in one go.
     */
    chunkSize?: number;
    /**
     * Characters carried over between chunks, which sets the longest match that can
     * span a chunk boundary and still be found. Raise this if a detector's phrases
     * are long enough to be split.
     */
    chunkTail?: number;
};

export type ConditionTypes = {
    text: {
        pattern: MaybeArray<string>;
        selector?: MaybeArray<string>;
        xpath?: MaybeArray<string>;
        xpathConfig?: XPathConfig;
    };
    element: {
        selector: MaybeArray<string>;
        visibility?: 'visible' | 'hidden' | 'any' | 'content';
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
