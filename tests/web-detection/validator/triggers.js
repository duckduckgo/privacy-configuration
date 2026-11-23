// @ts-check
import { PAYLOAD_SCOPE, fail } from './context.js';
import { bindItem } from './expressions.js';
import { EVENT_TYPE_ALLOWLIST, OPERATOR_KEYS, WHEN_BUSY_VALUES } from './grammar.js';
import { checkRecordedBody, describeRecorded, itemTypeOf, sameRecorded } from './observed.js';
import { checkPredicate } from './predicates.js';
import { expressionKeysOf } from './walk.js';
import { isPlainObject } from '../../../util.js';
import { OBSERVED_KEEP_CAPS, OBSERVED_KEEP_CAPS_BY_TYPE, PER_FRAME_MIN_DELAY_MS } from '../../../web-detection-util.js';

/**
 * @typedef {import('./context.js').Context} Context
 * @typedef {import('./context.js').Recorded} Recorded
 */

const OBSERVE_KEYS = [
    'state',
    'runConditions',
    'on',
];

/**
 * The triggers that run a detector: `breakageReport` unless disabled, and `auto` and `observe` when
 * enabled.
 *
 * @param {unknown} triggers
 * @returns {Set<string>}
 */
export function enabledTriggersOf(triggers) {
    const all = isPlainObject(triggers) ? triggers : {};
    const enabled = new Set();
    if (all.breakageReport?.state !== 'disabled') enabled.add('breakageReport');
    if (all.auto?.state === 'enabled') enabled.add('auto');
    if (all.observe?.state === 'enabled') enabled.add('observe');
    return enabled;
}

/**
 * Whether an `on` body names an event of the page hiding, which runs the detector whether or not a
 * source reads it.
 *
 * @param {Recorded} recorded
 */
function isPageHiding(recorded) {
    return recorded.kind === 'event' && EVENT_TYPE_ALLOWLIST[recorded.type]?.pageHiding === true;
}

/**
 * Whether a predicate holds an expression: a `ref`, a source or any other expression key besides
 * `any`, `all` and `none`, which combine predicates.
 *
 * @param {unknown} node
 * @returns {boolean}
 */
function holdsExpression(node) {
    if (Array.isArray(node)) return node.some(holdsExpression);
    if (!isPlainObject(node)) return false;
    if (expressionKeysOf(node).some((key) => !OPERATOR_KEYS.includes(key))) return true;
    return Object.values(node).some(holdsExpression);
}

/**
 * Check the `observe` trigger, once the walk of `match` and `actions` has gathered the types the
 * detector's `observed` and `trigger` sources read.
 *
 * @param {unknown} triggers
 * @param {Context} ctx
 * @param {string} path - the path of `triggers`
 */
export function checkTriggers(triggers, ctx, path) {
    if (!isPlainObject(triggers) || !('observe' in triggers)) return;
    const observe = triggers.observe;
    const observePath = `${path}.observe`;
    if (!isPlainObject(observe)) {
        fail(ctx, observePath, '`observe` is an object');
        return;
    }
    for (const key of Object.keys(observe)) {
        if (!OBSERVE_KEYS.includes(key)) fail(ctx, `${observePath}.${key}`, `"${key}" is not a key of \`observe\``);
    }
    const on = observe.on;
    if (!Array.isArray(on) || on.length === 0) {
        fail(ctx, `${observePath}.on`, '`on` lists at least one body: the types whose arrival runs the detector', 'observeTrigger');
        return;
    }
    on.forEach((body, index) => checkOnBody(body, ctx, `${observePath}.on[${index}]`));
}

/**
 * An `on` body for an event that arrives every frame: it runs the detector at most once per `delayMs`,
 * and a batched run keeps no more events than the type's log can.
 *
 * @param {Record<string, unknown>} body
 * @param {string} type
 * @param {Context} ctx
 * @param {string} path
 */
function checkPerFrame(body, type, ctx, path) {
    if (body.whenPending !== 'skip' && body.whenPending !== 'batch') {
        fail(
            ctx,
            path,
            `\`${type}\` arrives every frame, so its body has \`whenPending\` "skip" or "batch" to run the detector once per \`delayMs\``,
            'observeTrigger',
        );
        return;
    }
    const delayMs = typeof body.delayMs === 'number' ? body.delayMs : 0;
    if (delayMs < PER_FRAME_MIN_DELAY_MS)
        fail(
            ctx,
            `${path}.delayMs`,
            `\`${type}\` arrives every frame, so \`delayMs\` is at least ${PER_FRAME_MIN_DELAY_MS}`,
            'observeTrigger',
        );
    const cap = OBSERVED_KEEP_CAPS_BY_TYPE.event?.[type]?.withinMs ?? OBSERVED_KEEP_CAPS.withinMs;
    if (body.whenPending === 'batch' && delayMs > cap)
        fail(
            ctx,
            `${path}.delayMs`,
            `a batched run keeps each \`${type}\` until it runs, so \`delayMs\` is at most ${cap}, as for a \`keep\``,
            'observeTrigger',
        );
}

/**
 * One `on` body: a type, a `where` over literal values, `delayMs`, `sync` where the type takes it,
 * `whenPending`, which a type that arrives every frame needs, and `whenBusy`.
 *
 * @param {unknown} body
 * @param {Context} ctx
 * @param {string} path
 */
function checkOnBody(body, ctx, path) {
    const recorded = checkRecordedBody(body, 'on', ctx, path);
    if (!isPlainObject(body)) return;

    if ('where' in body) {
        // C-S-S tests it as the item is recorded, outside any run, so it reads no name or page value
        if (holdsExpression(body.where))
            fail(
                ctx,
                `${path}.where`,
                "an `on` body's `where` is tested outside a run, so it compares fields with literal values only",
                'observeTrigger',
            );
        if (recorded) {
            const itemType = itemTypeOf(recorded);
            checkPredicate(body.where, 'item', itemType, { ...bindItem(PAYLOAD_SCOPE, itemType), underNone: false }, ctx, `${path}.where`);
        }
    }

    if ('delayMs' in body && (!Number.isInteger(body.delayMs) || body.delayMs < 0))
        fail(ctx, `${path}.delayMs`, '`delayMs` is a non-negative integer');

    if (!recorded) return;
    const sync = recorded.kind === 'event' ? EVENT_TYPE_ALLOWLIST[recorded.type].sync : undefined;
    if (sync === 'required' && body.sync !== true) {
        fail(
            ctx,
            path,
            `\`${recorded.type}\` runs the detector as the page hides, when a later task may never run, so it needs \`"sync": true\``,
            'observeTrigger',
        );
    } else if (sync === undefined && 'sync' in body) {
        fail(
            ctx,
            `${path}.sync`,
            '`sync` runs the detector during dispatch, on `click`, `visibilitychange` and `pagehide` bodies only',
            'observeTrigger',
        );
    } else if ('sync' in body && typeof body.sync !== 'boolean') {
        fail(ctx, `${path}.sync`, '`sync` is a boolean');
    }
    if (body.sync === true && 'delayMs' in body)
        fail(ctx, `${path}.delayMs`, '`sync` runs the detector in the listener, so it takes no `delayMs`');
    if (body.sync === true && 'whenPending' in body)
        fail(ctx, `${path}.whenPending`, '`sync` runs the detector at the arrival, so no run is pending and it takes no `whenPending`');
    if (recorded.kind === 'event' && EVENT_TYPE_ALLOWLIST[recorded.type].perFrame) checkPerFrame(body, recorded.type, ctx, path);
    checkWhenBusy(body, recorded, ctx, path);

    if (!isPageHiding(recorded) && !ctx.recordedReads.some((read) => sameRecorded(read, recorded)))
        fail(
            ctx,
            path,
            `runs the detector on ${describeRecorded(recorded)}, which no \`observed\`, \`trigger\` or \`wait\` source in the detector reads: a run reads its arrival through \`trigger\``,
            'observeTrigger',
        );
}

/**
 * `whenBusy`: what an arrival does while a run of the detector is suspended in a `wait`. The page
 * hiding interrupts, so the run happens as the page hides. A `sync` body interrupts or skips, as a
 * queued run happens after dispatch. Only these bodies interrupt.
 *
 * @param {Record<string, any>} body
 * @param {Recorded} recorded
 * @param {Context} ctx
 * @param {string} path
 */
function checkWhenBusy(body, recorded, ctx, path) {
    const whenBusy = body.whenBusy ?? 'queue';
    if (!WHEN_BUSY_VALUES.includes(whenBusy)) {
        fail(ctx, `${path}.whenBusy`, `\`whenBusy\` is one of ${WHEN_BUSY_VALUES.map((value) => `"${value}"`).join(', ')}`);
        return;
    }
    if (isPageHiding(recorded)) {
        if (whenBusy !== 'interrupt')
            fail(
                ctx,
                path,
                `\`${recorded.type}\` runs the detector as the page hides, and a run queued behind a \`wait\` runs only when the wait ends, so it needs \`"whenBusy": "interrupt"\``,
            );
    } else if (body.sync === true) {
        if (whenBusy === 'queue')
            fail(
                ctx,
                path,
                'a `sync` run queued behind a `wait` runs after dispatch, so a `sync` body needs `"whenBusy": "interrupt"` or `"skip"`',
            );
    } else if (whenBusy === 'interrupt') {
        fail(ctx, `${path}.whenBusy`, '`"whenBusy": "interrupt"` goes on `sync` bodies and the page hiding only');
    }
}
