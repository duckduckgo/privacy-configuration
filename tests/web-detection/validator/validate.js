// @ts-check
import { isDeepStrictEqual } from 'node:util';
import { ACTIONS_SCOPE, MATCH_SCOPE, newContext } from './context.js';
import { detectorEntries, detectorEventCycle, detectorEventsOf, detectorEventsOfGroups } from './events.js';
import { checkBody, checkExpr } from './expressions.js';
import { onBodiesOf } from './observed.js';
import { checkTriggers, enabledTriggersOf } from './triggers.js';
import { pageHidingEventErrors } from './warnings.js';
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
        ctx.recordedReads = [];
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
 * position, `actions` as an expression or a sequence, the `observe` trigger against the types its
 * sources read, and its detector events against those of the detectors a client sees with it.
 *
 * @param {Record<string, any>} detector
 * @param {string} path
 * @param {Record<string, Record<string, Record<string, any>>>} [detectors] - every detector a client sees with it, by group and name. Without it, the detector alone
 * @returns {string[]} the errors, empty when the detector is valid
 */
export function validateDetector(detector, path, detectors) {
    if (!isPlainObject(detector))
        return [
            `${path}: a detector is an object`,
        ];
    const ctx = newContext();
    ctx.hasMatch = 'match' in detector;
    ctx.onBodies = onBodiesOf(detector.triggers);
    ctx.enabledTriggers = enabledTriggersOf(detector.triggers);
    const id = (detectors && detectorEntries(detectors).find((entry) => entry[1] === detector)?.[0]) ?? path;
    ctx.events = detectors
        ? detectorEventsOfGroups(detectors)
        : detectorEventsOf([
              [
                  id,
                  detector,
              ],
          ]);
    const cycle = detectorEventCycle(id, ctx.events);
    return [
        ...runChecks(ctx, () => {
            if ('match' in detector) checkExpr(detector.match, 'boolean', MATCH_SCOPE, ctx, `${path}.match`);
            if ('actions' in detector) checkBody(detector.actions, 'value', ACTIONS_SCOPE, ctx, `${path}.actions`);
            // After the walk, which gathers the types the sources read
            checkTriggers(detector.triggers, ctx, `${path}.triggers`);
        }),
        ...pageHidingEventErrors(detector, path),
        ...(cycle
            ? [
                  `${path}: a chain of detector events runs from this detector back to itself, through \`observe\` triggers: ${cycle.join(' -> ')}`,
              ]
            : []),
    ];
}

/**
 * Check every detector a client sees together, each against the others' detector events.
 *
 * @param {Record<string, Record<string, Record<string, any>>>} detectors
 * @returns {string[]}
 */
export function validateDetectors(detectors) {
    return detectorEntries(detectors).flatMap(
        ([
            id,
            detector,
        ]) => validateDetector(detector, `detectors.${id}`, detectors),
    );
}
