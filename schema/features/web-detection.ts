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

/** `^(this\.)?[a-zA-Z][a-zA-Z0-9_]*$`: a run name, or with `this.` a detector name. */
type Name = string;

/** `^[a-zA-Z][a-zA-Z0-9_]*$`, never `nativeData`. */
type PayloadKey = string;

/** Keys that sit beside an expression key, applied in the order `using`, `is`. */
type Modifiers = {
    /**
     * An expression over the expression's value, which `self` reads. A path or an `api` body is short
     * for a `self` with that body. `"length"` on a list is the number of its items.
     */
    using?: string | UsingBody | ExprObject;
    /** Tests the value, giving a boolean. In boolean or value position, on one expression key, or several beside `using`. */
    is?: Predicate;
};

/** An expression in value position. `args` is a JS array of its entries' values, and `{ expr: [...] }` builds an inner array. */
type Arg = Expr;

/** A string is short for `{ path }`, and `args` calls the last name in `path`. An expression reads with `self` bound to the item or value. */
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
    /** With `is`: reads a value from the item or value under test. */
    field?: FieldRead;
    is?: Predicate;
};

type PredicateOperators = {
    eq?: Expr;
    /** Holds when the value `===` one of the entries. An entry giving a list contributes each item. */
    in?: MaybeArray<Expr>;
    lt?: Expr;
    lte?: Expr;
    gt?: Expr;
    gte?: Expr;
    /** Holds when the read fails: a getter or method threw. A missing name reads `undefined`. */
    fails?: boolean;
    type?: MaybeArray<TypeName>;
};

/**
 * Every other key is a property path. At item level, operator names are property paths too.
 * Position decides which applies; the parser and CI check it, not these types.
 */
type PredicateObject = PredicateReserved & PredicateOperators & { [path: string]: Predicate | Expr | FieldRead | undefined };

/** An array is not a predicate: `in` tests for one of several values, and `any` for one of several predicates. */
export type Predicate = string | number | boolean | null | PredicateObject;

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
/** An `api` body read from the value `self` is bound to. `args` only with `path`; `{}` is the bound value. */
type SelfBody = {
    path?: string;
    args?: Arg[];
} & ItemKeys;

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
    /** Reads from the value the innermost `using`, `where` or `field` binds. A string is short for `{ path }`. */
    self: string | SelfBody;
    /** Its operand's value, so modifiers stack. Over an array, a list of the entries' values. */
    expr: Expr | Expr[];
    only: Expr;
    sum: Operands;
    mul: Operands;
    div: [
        Expr,
        Expr,
    ];
    /** The condition, in boolean position. `then` and `else` sit beside it. */
    if: Expr;
    any: Operands;
    all: Operands;
    none: Operands;
    /** The binding of a name at the time of the read, or `undefined` when unbound. */
    ref: Name;
};

/** The branches of `if`, valid only beside it. The value of the branch taken, or `undefined` with no branch taken. */
type Branches = {
    then?: Body;
    else?: Body;
};

/**
 * One expression key is that expression; several are their AND, in boolean or value position,
 * and never beside `is`. Placement and types are checked by the parser and CI, not by these types.
 * An array is never an expression: the key holding it decides what it means.
 */
export type ExprObject = Partial<ExprKeys> & Modifiers & Branches;

/**
 * One or more action keys, run in the order config lists them, never beside an expression key or a
 * modifier. An action gives `undefined`, in value position only.
 */
export type ActionObject = Partial<{
    /** Sends a `webEvent` of `type`, with the payload. */
    fireEvent: {
        type: string;
        data?: PayloadSpec;
    };
    /** Writes the detector's entry in breakage reports, merging `data` into it. */
    breakageReportData: {
        data?: PayloadSpec;
    };
    /** Binds each name to its value, in the order config lists them. `x` lasts for the run, `this.x` for the detector in its frame. */
    define: Record<Name, Expr>;
}>;

export type Expr = number | boolean | string | null | ExprObject | ActionObject;

/** An expression, or a sequence of them evaluated in order, giving the last one's value. */
export type Body = Expr | Expr[];

export type PayloadField = {
    /** An expression in value position. */
    value: Expr;
    /** The value is sent only when this holds. With `fails`, it decides on a failed read. */
    when?: Predicate;
    /**
     * Bucket name to predicate. The first that holds, in key order, is sent instead of the value. A
     * bucket with `fails` names a failed read.
     */
    buckets?: Record<string, Predicate>;
};

/** Payload key to field. */
export type PayloadSpec = Record<PayloadKey, PayloadField>;

/**
 * Each run evaluates `match`, then `actions` when it holds or is absent. A `match` that holds makes
 * the detector done, and it runs no more in the frame. A failure no `fails` handles ends the run, and
 * is recorded in the detector's breakage entry under its config path.
 */
export type DetectorConfig = {
    state?: FeatureState;
    triggers?: Triggers;
    /** An expression in boolean position, reading the page only. */
    match?: Expr;
    actions: Body;
};

type DetectorGroup = Record<string, DetectorConfig>;

export type WebDetectionSettings = CSSInjectFeatureSettings<{
    detectors?: Record<string, DetectorGroup>;
}>;

export type WebDetectionFeature<VersionType> = Feature<WebDetectionSettings, VersionType>;
