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

/** `^[a-zA-Z][a-zA-Z0-9_]*$` */
type Name = string;

/** Keys that sit beside an expression key, applied in the order `using`, `as`, `is`. */
type Modifiers = {
    /**
     * Reads a path from the expression's value, as `api` reads from the global object. A string is
     * short for `{ path }`. `"length"` on a list reads only as many items as its tests need.
     */
    using?: string | UsingBody;
    /** Names the expression's value for `ref` and payloads. Unique within the detector. */
    as?: Name;
    /** Tests the value, giving a boolean. Only on an object in boolean position with one expression key. */
    is?: Predicate;
};

/** An expression in value position, or a JS array of entries. */
type Arg = Expr | Arg[];

/** A string is short for `{ path }`. At least one key. */
type FieldRead =
    | string
    | {
          path?: string;
          args?: Arg[];
          feature?: 'wordCount' | 'renderedTextLength';
          /** An expression giving a function, applied to the value read so far as its one argument. */
          call?: Expr;
      };

type TypeName = 'number' | 'string' | 'boolean' | 'null' | 'undefined' | 'array' | 'object';

type PredicateReserved = {
    any?: MaybeArray<Predicate>;
    all?: MaybeArray<Predicate>;
    none?: MaybeArray<Predicate>;
    /** With `is`: reads a value from the item or value under test. */
    field?: FieldRead;
    is?: Predicate;
};

type PredicateOperators = {
    eq?: Expr;
    lt?: Expr;
    lte?: Expr;
    gt?: Expr;
    gte?: Expr;
    /** Holds when the read fails: the name is absent, or a getter or method threw. */
    fails?: boolean;
    exists?: boolean;
    type?: MaybeArray<TypeName>;
};

/**
 * Every other key is a property path. At item level, operator names are property paths too.
 * Position decides which applies; the parser and CI check it, not these types.
 */
type PredicateObject = PredicateReserved & PredicateOperators & { [path: string]: Predicate | Expr | FieldRead | undefined };

export type Predicate = string | number | boolean | null | Predicate[] | PredicateObject;

type Root = {
    /**
     * Where the source's reads start: an expression or an array of them, each giving a selector, a
     * node or a list of nodes. The scope is the union of their nodes. Without it, the document.
     */
    root?: MaybeArray<Expr>;
};

type ItemKeys = {
    /**
     * A predicate each item must pass. At item level, an object with an expression key other than
     * `any`, `all` and `none` is a boolean expression over `self`, the item.
     */
    where?: Predicate | Expr;
    /** The value read from each item that passes `where`, or on `api`, from a value that is not a list. */
    field?: FieldRead;
};

export type ElementBody = ConditionTypes['element'] & Root & ItemKeys;
export type TextBody = ConditionTypes['text'] & Root;
export type ApiBody = {
    path: string;
    args?: Arg[];
} & ItemKeys;
/** An `api` body read from the value of the expression beside `using`. */
type UsingBody = ApiBody;

type Operands = MaybeArray<Expr>;

/**
 * `element` and `text` also take `{ any | all | none }` blocks over bodies in boolean position,
 * the form shipped before expressions.
 */
type ExprKeys = {
    element: ConditionBranch<ElementBody>;
    text: ConditionBranch<TextBody>;
    /** A string is short for `{ path }`. */
    api: string | ApiBody;
    /** Its operand's value, so modifiers stack. */
    expr: Expr;
    only: Expr;
    sum: Operands;
    mul: Operands;
    div: [
        Expr,
        Expr,
    ];
    if: { test: Expr; then: Expr; else: Expr };
    any: Operands;
    all: Operands;
    none: Operands;
    ref: Name;
};

/**
 * One expression key is that expression; several are their AND, in boolean or value position,
 * and never beside `is`. Placement and types are checked by the parser and CI, not by these types.
 */
export type ExprObject = Partial<ExprKeys> & Modifiers;
export type Expr = number | boolean | string | null | ExprObject | Expr[];

export type PayloadField = {
    /** An expression in value position. */
    value: Expr;
    /** The value is sent only when this holds. */
    when?: Predicate;
    /** Bucket name to predicate. The first that holds, in key order, is sent instead of the value. */
    buckets?: Record<string, Predicate>;
};

/** Payload key to field. Keys match `^[a-zA-Z][a-zA-Z0-9_]*$` and are never `nativeData`. */
export type PayloadSpec = Record<Name, PayloadField>;

type Actions = Partial<{
    breakageReportData: ActionBase & { data?: PayloadSpec };
    fireEvent: ActionBase & {
        type: string;
        data?: PayloadSpec;
    };
}>;

export type DetectorConfig = {
    state?: FeatureState;
    match: Expr;
    triggers?: Triggers;
    actions?: Actions;
};

type DetectorGroup = Record<string, DetectorConfig>;

export type WebDetectionSettings = CSSInjectFeatureSettings<{
    detectors?: Record<string, DetectorGroup>;
}>;

export type WebDetectionFeature<VersionType> = Feature<WebDetectionSettings, VersionType>;
