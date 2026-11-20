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
 * `if` branch giving no list takes.
 */

/**
 * @typedef {{
 *   errors: string[],
 *   functionApis: WeakSet<object>,
 *   hasMatch: boolean,
 *   runNames: Map<string, StaticType>,
 *   detectorNames: Map<string, StaticType>,
 *   collected: Map<string, StaticType>,
 * }} Context
 *
 * `functionApis` holds the expressions whose `api` may read a method as a function: `args`
 * entries.
 *
 * `runNames` holds the run names a `define` may have bound at the point of the walk, with the type
 * of each value that can be bound. `detectorNames` holds the type of each detector name, from every
 * `define` of it in the detector, as the walk before gathered them into `collected`.
 */

/** @type {Scope} */
export const MATCH_SCOPE = { inMatch: true, underNone: false, conditionRoot: true, guards: [] };

/** @type {Scope} */
export const PAYLOAD_SCOPE = { inMatch: false, underNone: false, conditionRoot: false, guards: [] };

/**
 * @param {Context} ctx
 * @param {string} path
 * @param {string} message
 */
export function fail(ctx, path, message) {
    ctx.errors.push(`${path}: ${message}`);
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
        fail(ctx, path, `${what} fills ${fills.join(', ')} position, not ${position} position`);
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
    };
}
