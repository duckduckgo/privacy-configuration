// @ts-check
/**
 * @typedef {import('./types.js').Position} Position
 * @typedef {import('./types.js').StaticType} StaticType
 */

/**
 * @typedef {{
 *   inMatch: boolean,
 *   underNone: boolean,
 *   conditionRoot: boolean,
 *   guards: unknown[],
 *   bound?: StaticType,
 *   inItem?: boolean,
 *   noneAbove?: boolean,
 *   spreadOf?: 'number' | 'boolean',
 *   waitable?: boolean,
 * }} Scope
 *
 * `inMatch` is set in `match`. `conditionRoot` is set at the top of a condition, `match` or the
 * condition of an `if`, whose top-level `all` operands guard each other. `guards` are the expressions
 * guarding a scoped `element` or `text`: the operands of that `all`, and the condition of each
 * enclosing `if` with the operands of its top-level `all`. `bound` is the type `self` reads, set inside
 * `using`, `where` and `field`. `inItem` is set anywhere inside a `where` or `field`, where every
 * expression runs once per item. `noneAbove` is set
 * under a `none` anywhere above, in a condition or a predicate: `where` clears `underNone` for its own
 * comparisons, and keeps `noneAbove`. `spreadOf` is set on an operand of `sum`, `mul`, `any`, `all` or
 * `none` checked in spread position: the position an operand that is not spread takes there, which an
 * `if` branch giving no list takes. `waitable` is set where C-S-S can suspend a run at a `wait`: from
 * `actions`, through the elements of a sequence, the condition and branches of `if`, the operand of
 * `expr`, the expression beside `using`, and the values of `define`, `done` and payload fields.
 */

/**
 * @typedef {{
 *   errors: string[],
 *   functionApis: WeakSet<object>,
 *   hasMatch: boolean,
 *   runNames: Map<string, StaticType>,
 *   detectorNames: Map<string, StaticType>,
 *   collected: Map<string, StaticType>,
 *   recordedReads: Recorded[],
 *   onBodies: Recorded[],
 *   enabledTriggers: Set<string>,
 * }} Context
 *
 * `functionApis` holds the expressions whose `api` may read a method as a function: `args`
 * entries.
 *
 * `runNames` holds the run names a `define` may have bound at the point of the walk, with the type
 * of each value that can be bound. `detectorNames` holds the type of each detector name, from every
 * `define` of it in the detector, as the walk before gathered them into `collected`.
 *
 * `recordedReads` holds the type and target of each `observed` and `trigger` body the walk has
 * checked. `onBodies` holds those of the detector's `observe` trigger's `on` bodies, and
 * `enabledTriggers` the triggers that run the detector.
 */

/**
 * A recorded type and the target it's recorded on: `kind` is the body key naming it, `entryType` or
 * `event`, and `target` the `api` path an event is listened for on, `window` when the body states none.
 *
 * @typedef {{ kind: string, type: string, target?: string }} Recorded
 */

/** @type {Scope} */
export const MATCH_SCOPE = { inMatch: true, underNone: false, conditionRoot: true, guards: [] };

/** @type {Scope} */
export const PAYLOAD_SCOPE = { inMatch: false, underNone: false, conditionRoot: false, guards: [] };

/** @type {Scope} */
export const ACTIONS_SCOPE = { ...PAYLOAD_SCOPE, waitable: true };

/**
 * The section of `docs/web-detection` that documents each authoring rule. A message that enforces a
 * rule links to its section.
 *
 * Ensure each entry names a heading under an `## Authoring rules` section, which `docs-tests.js` checks.
 */
export const RULES = /** @type {const} */ ({
    types: 'expressions.md#types',
    boundNames: 'expressions.md#bound-names',
    rootGuards: 'sources.md#root-guards',
    itemSources: 'sources.md#sources-in-where-and-field',
    elementAllowlist: 'sources.md#element-allowlist',
    allowedNames: 'sources.md#allowed-names',
    applyLists: 'sources.md#lists-passed-to-apply',
    comparisonGuards: 'predicates.md#comparison-guards',
    propertyPaths: 'predicates.md#property-paths',
    fireEventBuckets: 'payloads.md#buckets-on-fireevent',
    bucketOverlap: 'payloads.md#bucket-overlap',
    detectorNames: 'overview.md#detector-names',
    matchNames: 'overview.md#match-and-detector-names',
    events: 'overview.md#events',
    featureSettings: 'overview.md#feature-setting-values',
    recordedTypes: 'sources.md#recorded-types',
    observeTrigger: 'overview.md#the-observe-trigger',
});

/**
 * @param {keyof typeof RULES} rule
 * @returns {string}
 */
export const ruleLink = (rule) => ` (see docs/web-detection/${RULES[rule]})`;

/**
 * @param {Context} ctx
 * @param {string} path
 * @param {string} message
 * @param {keyof typeof RULES} [rule] - the authoring rule the message enforces
 */
export function fail(ctx, path, message, rule) {
    ctx.errors.push(`${path}: ${message}${rule ? ruleLink(rule) : ''}`);
}

/**
 * @param {Scope} scope
 * @returns {Scope}
 */
export function child(scope) {
    return scope.conditionRoot ? { ...scope, conditionRoot: false } : scope;
}

/**
 * @param {Context} ctx
 * @param {string} path
 * @param {string} what
 * @param {Position} position
 * @param {Position[]} fills
 */
export function expectPosition(ctx, path, what, position, fills) {
    if (!fills.includes(position)) {
        fail(ctx, path, `${what} fills ${fills.join(', ')} position, not ${position} position`, 'types');
    }
}

/**
 * @returns {Context}
 */
export function newContext() {
    return {
        errors: [],
        functionApis: new WeakSet(),
        hasMatch: false,
        runNames: new Map(),
        detectorNames: new Map(),
        collected: new Map(),
        recordedReads: [],
        onBodies: [],
        enabledTriggers: new Set(),
    };
}
