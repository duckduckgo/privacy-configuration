import { ConditionBlockOrArray, CSSInjectFeatureSettings, Feature, FeatureState } from '../feature';

type MaybeArray<T> = T | T[];

/** @minLength 1 */
type NonEmptyString = string;

/** @minItems 1 */
type NonEmptyList<T> = T[];

type NonEmptyStrings = NonEmptyString | NonEmptyList<NonEmptyString>;

type TriggerBase = {
    state?: FeatureState;
    runConditions?: ConditionBlockOrArray;
};

type AutoTrigger = TriggerBase & {
    when: {
        intervalMs: number[];
    };
};

/**
 * A performance entry type a recorder observes. CI allows the types and fields on its entry type
 * allowlist.
 */
type EntryTypeKeys = {
    entryType: NonEmptyString;
    /** On `event` entries only: the body gives the entries with `duration` at or over it. */
    durationThreshold?: number;
};

/**
 * An `api` path read once, as the recorders register. CI allows the paths on its target allowlist.
 */
type EventTarget = {
    api: NonEmptyString | { path: NonEmptyString };
};

/**
 * An event type a recorder listens for. CI allows the types and fields on its event type allowlist.
 */
type EventKeys = {
    event: NonEmptyString;
    /** What the recorder listens on, `window` when absent. */
    target?: EventTarget;
};

/** A detector event name, which an `emit` in the config records. */
type DetectorEventKeys = {
    detectorEvent: NonEmptyString;
};

type Recorded = EntryTypeKeys | EventKeys | DetectorEventKeys;

/** @minProperties 1 */
type KeepWindow = {
    /** @minimum 1 */
    count?: number;
    /** @minimum 1 */
    withinMs?: number;
};

/**
 * The window of the log an `observed` body reads: the last `count` items, those recorded in the
 * last `withinMs` ms, or both. `null` reads every item recorded. The config build writes the default
 * onto every body without one.
 */
type Keep = KeepWindow | null;

export type ObservedBody = Recorded &
    ItemKeys & {
        keep?: Keep;
    };

/**
 * The options of `MutationObserver.observe()`. CI allows the options and attribute names on its
 * mutation option allowlist.
 * @minProperties 1
 */
type MutationOptions = {
    childList?: true;
    subtree?: true;
    characterData?: true;
    attributes?: true;
    attributeFilter?: NonEmptyList<NonEmptyString>;
};

/** A type a `wait` reads the next arrival of. Its `target` is read as the wait starts, so it may be any expression. */
type WaitRecorded =
    | EntryTypeKeys
    | DetectorEventKeys
    | {
          event: NonEmptyString;
          target?: Expr;
      }
    | {
          mutation: MutationOptions;
          target: Expr;
      }
    | {
          intersection: IntersectionOptions;
          target: Expr;
      }
    | {
          resize: ResizeOptions;
          target: Expr;
      };

/**
 * @minimum 0
 * @maximum 1
 */
type Ratio = number;

/** The options of `IntersectionObserver`. The root is always the viewport. */
type IntersectionOptions = {
    threshold?: Ratio | NonEmptyList<Ratio>;
};

/** The options of `ResizeObserver.observe()`. */
type ResizeOptions = {
    box?: 'content-box' | 'border-box';
};

export type WaitBody = WaitRecorded &
    ItemKeys & {
        /**
         * The longest the wait lasts, in ms, or `null` for no limit. The config build writes the
         * default onto every `wait` without one.
         * @minimum 0
         */
        timeoutMs?: number | null;
    };

type EmptyObject = Record<string, never>;

/** The arrival that started the run, of the type a body names, or the trigger that started it. */
export type TriggerBody = (Recorded | { auto: EmptyObject } | { breakageReport: EmptyObject }) & ItemKeys;

/** A type whose arrival runs the detector. */
type OnBody = Recorded & {
    /** Tested as each item is recorded, so it compares fields with literal values. */
    where?: Predicate;
    /**
     * The run is in a task `delayMs` after the arrival.
     * @minimum 0
     */
    delayMs?: number;
    /** The run is in the listener, during dispatch. */
    sync?: boolean;
    /**
     * What the arrival does while a run of the detector is pending: schedule its own run (the default),
     * schedule nothing, add its items to the pending run, or cancel the pending run and schedule its own.
     */
    whenPending?: 'run' | 'skip' | 'batch' | 'replace';
    /** What the arrival does while a run of the detector is suspended in a `wait`. */
    whenBusy?: 'queue' | 'interrupt' | 'skip';
};

type ObserveTrigger = TriggerBase & {
    on: NonEmptyList<OnBody>;
};

type Triggers = Partial<{
    breakageReport: TriggerBase;
    auto: AutoTrigger;
    observe: ObserveTrigger;
}>;

export type ConditionBranch<Final> = Final | NonEmptyList<Final>;

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
        pattern: NonEmptyStrings;
        selector?: NonEmptyStrings;
        xpath?: NonEmptyStrings;
        xpathConfig?: XPathConfig;
    };
    element: {
        selector: NonEmptyStrings;
        visibility?: 'visible' | 'hidden' | 'any' | 'content';
    };
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
          path: NonEmptyString;
          args?: Arg[];
      }
    | ExprObject;

type TypeName = 'number' | 'string' | 'boolean' | 'null' | 'undefined' | 'array' | 'object' | 'function' | 'symbol' | 'bigint';

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
    root?: Expr | NonEmptyList<Expr>;
};

type ItemKeys = {
    where?: Predicate | Expr;
    field?: FieldRead;
};

export type ElementBody = ConditionTypes['element'] & Root & ItemKeys;
export type TextBody = ConditionTypes['text'] & Root;
export type ApiBody = {
    path: NonEmptyString;
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
    observed: ObservedBody;
    trigger: TriggerBody;
    wait: WaitBody;
    /** An object with a field per key, holding that key's value. */
    object: Record<string, Expr>;
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
    define: Defines;
    /** The detector is done at the end of the run when it holds. */
    done: Expr;
    /** Records a detector event in the frame, which `observed`, `trigger`, `wait` and `observe` read. */
    emit: {
        name: NonEmptyString;
        data?: Expr;
    };
}>;

/** @minProperties 1 */
type Defines = Record<Name, Expr>;

export type Expr = number | boolean | string | null | ExprObject | ActionObject;

export type Body = Expr | NonEmptyList<Expr>;

export type PayloadField = {
    value: Expr;
    when?: Predicate;
    buckets?: NonEmptyList<Bucket>;
};

/** Tested in array order: the first bucket whose `is` holds names the value. */
export type Bucket = {
    name: NonEmptyString;
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
    /**
     * How long C-S-S keeps the page reads of the detectors (XPath selections and element text) for later
     * runs while the page is unchanged: `null` until the page changes, a number of ms, or 0 for the runs
     * that happen together only. The config build writes the default when this is left out.
     */
    readCacheMaxAgeMs?: number | null;
    /**
     * The most runs that detector events with no `delayMs` start in a chain in one task. The config
     * build writes the default when config leaves it out, and C-S-S reads a missing value as 0.
     * @minimum 0
     */
    detectorEventMaxDepth?: number;
    /** Generic C-S-S load gate, patched per experiment cohort via conditionalChanges. */
    additionalCheck?: FeatureState;
}>;

export type WebDetectionFeature<VersionType> = Feature<WebDetectionSettings, VersionType>;
