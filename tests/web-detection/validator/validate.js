import { expect } from 'chai';
import { MATCH_SCOPE, PAYLOAD_SCOPE, newContext } from './context.js';
import { checkBody, checkExpr } from './expressions.js';
import { DETECTOR_KEYS } from './grammar.js';
import { isPlainObject } from './walk.js';

/**
 * @typedef {import('./context.js').Context} Context
 */

/**
 * Walk a detector twice, `collect` then `check`, and gather the errors.
 *
 * @param {Context} ctx
 * @param {() => void} walk
 * @returns {string[]}
 */
function runChecks(ctx, walk) {
    walk();
    ctx.mode = 'check';
    ctx.errors = [];
    ctx.runNames = new Map();
    ctx.detectorNames = ctx.collected;
    walk();
    return [
        ...new Set([
            ...ctx.structuralErrors,
            ...ctx.errors,
        ]),
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
    for (const key of Object.keys(detector)) {
        if (!DETECTOR_KEYS.includes(key)) ctx.structuralErrors.push(`${path}: unknown detector key "${key}"`);
    }
    if (!('actions' in detector)) ctx.structuralErrors.push(`${path}: a detector needs \`actions\``);
    ctx.hasMatch = 'match' in detector;
    return runChecks(ctx, () => {
        if ('match' in detector) checkExpr(detector.match, 'boolean', MATCH_SCOPE, ctx, `${path}.match`);
        if ('actions' in detector) checkBody(detector.actions, 'value', PAYLOAD_SCOPE, ctx, `${path}.actions`);
    });
}

/**
 * @param {Record<string, any>} detector
 * @param {string} path
 */
export function assertValidDetector(detector, path) {
    const errors = validateDetector(detector, path);
    expect(errors, `\n${errors.join('\n')}`).to.deep.equal([]);
}
