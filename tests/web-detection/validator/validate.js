// @ts-check
import { isDeepStrictEqual } from 'node:util';
import { MATCH_SCOPE, PAYLOAD_SCOPE, newContext } from './context.js';
import { checkBody, checkExpr } from './expressions.js';
import { isPlainObject } from '../../../util.js';

/**
 * @typedef {import('./context.js').Context} Context
 */

// Each round resolves detector names one `ref` deeper, so this bounds the chains a detector can have
const MAX_ROUNDS = 16;

/**
 * Walk a detector until the types of its detector names stop changing, and gather the errors of
 * the last walk. Each walk reads the names' types from the walk before, so a name bound to another
 * detector name gets its type once that name has one.
 *
 * @param {Context} ctx
 * @param {() => void} walk
 * @returns {string[]}
 */
function runChecks(ctx, walk) {
    for (let round = 0; round < MAX_ROUNDS; round++) {
        ctx.errors = [];
        ctx.runNames = new Map();
        ctx.collected = new Map();
        walk();
        if (isDeepStrictEqual(ctx.collected, ctx.detectorNames)) break;
        ctx.detectorNames = ctx.collected;
    }
    return [
        ...new Set(ctx.errors),
    ];
}

/**
 * Check a detector against the expression, predicate and payload rules: `match` in boolean
 * position, and `actions` as an expression or a sequence.
 *
 * @param {Record<string, any>} detector
 * @param {string} path
 * @returns {string[]} the errors, empty when the detector is valid
 */
export function validateDetector(detector, path) {
    if (!isPlainObject(detector))
        return [
            `${path}: a detector is an object`,
        ];
    const ctx = newContext();
    ctx.hasMatch = 'match' in detector;
    return runChecks(ctx, () => {
        if ('match' in detector) checkExpr(detector.match, 'boolean', MATCH_SCOPE, ctx, `${path}.match`);
        if ('actions' in detector) checkBody(detector.actions, 'value', PAYLOAD_SCOPE, ctx, `${path}.actions`);
    });
}
