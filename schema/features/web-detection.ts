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

type Name = string;

type PayloadKey = string;

type Modifiers = {
    using?: string | UsingBody | ExprObject;
    is?: Predicate;
};

type Arg = Expr;

type FieldRead =
    | string
    | {
          path: string;
          args?: Arg[];
      }
    | ExprObject;

type TypeName = 'number' | 'string' | 'boolean' | 'null' | 'undefined' | 'array' | 'object';

type PredicateReserved = {
    any?: MaybeArray<Predicate>;
    all?: MaybeArray<Predicate>;
    none?: MaybeArray<Predicate>;
    field?: FieldRead;
    is?: Predicate;
};

type PredicateOperators = {
    eq?: Expr;
    in?: MaybeArray<Expr>;
    lt?: Expr;
    lte?: Expr;
    gt?: Expr;
    gte?: Expr;
    fails?: boolean;
    type?: MaybeArray<TypeName>;
};

type PredicateObject = PredicateReserved & PredicateOperators & { [path: string]: Predicate | Expr | FieldRead | undefined };

export type Predicate = string | number | boolean | null | PredicateObject;

type Root = {
    root?: MaybeArray<Expr>;
};

type ItemKeys = {
    where?: Predicate | Expr;
    field?: FieldRead;
};

export type ElementBody = ConditionTypes['element'] & Root & ItemKeys;
export type TextBody = ConditionTypes['text'] & Root;
export type ApiBody = {
    path: string;
    args?: Arg[];
} & ItemKeys;
type UsingBody = ApiBody;
type SelfBody = {
    path?: string;
    args?: Arg[];
} & ItemKeys;

type Operands = MaybeArray<Expr>;

type ExprKeys = {
    element: ConditionBranch<ElementBody>;
    text: ConditionBranch<TextBody>;
    api: string | ApiBody;
    self: string | SelfBody;
    expr: Expr | Expr[];
    only: Expr;
    sum: Operands;
    mul: Operands;
    div: [
        Expr,
        Expr,
    ];
    if: Expr;
    any: Operands;
    all: Operands;
    none: Operands;
    ref: Name;
};

type Branches = {
    then?: Body;
    else?: Body;
};

export type ExprObject = Partial<ExprKeys> & Modifiers & Branches;

export type ActionObject = Partial<{
    fireEvent: {
        type: string;
        data?: PayloadSpec;
    };
    breakageReportData: {
        data?: PayloadSpec;
    };
    define: Record<Name, Expr>;
}>;

export type Expr = number | boolean | string | null | ExprObject | ActionObject;

export type Body = Expr | Expr[];

export type PayloadField = {
    value: Expr;
    when?: Predicate;
    buckets?: Bucket[];
};

/** Tested in array order: the first bucket whose `is` holds names the value. */
export type Bucket = {
    name: string;
    is: Predicate;
};

export type PayloadSpec = Record<PayloadKey, PayloadField>;

export type DetectorConfig = {
    state?: FeatureState;
    triggers?: Triggers;
    match?: Expr;
    actions: Body;
};

type DetectorGroup = Record<string, DetectorConfig>;

export type WebDetectionSettings = CSSInjectFeatureSettings<{
    detectors?: Record<string, DetectorGroup>;
}>;

export type WebDetectionFeature<VersionType> = Feature<WebDetectionSettings, VersionType>;
