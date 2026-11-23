// @ts-check
import { expectPosition, fail, newContext } from './context.js';
import { bindItem, sourceType } from './expressions.js';
import {
    ENTRY_TYPE_ALLOWLIST,
    EVENT_TARGET_ALLOWLIST,
    EVENT_TYPE_ALLOWLIST,
    LIST_CONDITION,
    NEVER_EVENT_TYPES,
    RECORDED_KINDS,
    RUN_START_FIELDS,
    apiBody,
    eventTargets,
} from './grammar.js';
import { checkPredicate } from './predicates.js';
import { checkFieldRead } from './reads.js';
import { UNKNOWN, typeOf } from './types.js';
import { isPlainObject } from '../../../util.js';
import { OBSERVED_KEEP_CAPS, OBSERVED_KEEP_CAPS_BY_TYPE, UNBOUNDED_KEEP_TYPES } from '../../../web-detection-util.js';

/**
 * @typedef {import('./context.js').Context} Context
 * @typedef {import('./context.js').Recorded} Recorded
 * @typedef {import('./context.js').Scope} Scope
 * @typedef {import('./types.js').Position} Position
 * @typedef {import('./types.js').StaticType} StaticType
 * @typedef {'observed' | 'trigger' | 'on'} Place
 */

/** The body keys naming the trigger that started a run, on `trigger` only. */
const RUN_START_KINDS = [
    'auto',
    'breakageReport',
];

/** The keys of a body that name its type, in every place. */
const TYPE_KEYS = [
    ...RECORDED_KINDS,
    'durationThreshold',
    'target',
];

/** @type {Record<Place, string[]>} */
const PLACE_KEYS = {
    observed: [
        'where',
        'field',
        'keep',
    ],
    trigger: [
        ...RUN_START_KINDS,
        'where',
        'field',
    ],
    on: [
        'where',
        'delayMs',
        'sync',
    ],
};

/** @type {Record<Place, string>} */
const PLACE_NAMES = {
    observed: 'an `observed` body',
    trigger: 'a `trigger` body',
    on: 'an `on` body',
};

/**
 * Whether two bodies name the same recorded type on the same target.
 *
 * @param {Recorded} a
 * @param {Recorded} b
 */
export function sameRecorded(a, b) {
    return a.kind === b.kind && a.type === b.type && a.target === b.target;
}

/**
 * A recorded type as config names it, for messages.
 *
 * @param {Recorded} recorded
 */
export function describeRecorded(recorded) {
    if (recorded.kind === 'entryType') return `\`${recorded.type}\` entries`;
    if (recorded.kind === 'event') return `\`${recorded.type}\` events on \`${recorded.target}\``;
    return `the \`${recorded.kind}\` trigger`;
}

/**
 * The name of the field table of a recorded type's items.
 *
 * @param {Recorded} recorded
 */
function tableOf(recorded) {
    return RUN_START_KINDS.includes(recorded.kind) ? recorded.kind : `${recorded.kind}:${recorded.type}`;
}

/**
 * The fields of the items of a field table, by path, with the type each gives.
 *
 * @param {string} table - as `tableOf` names it
 * @returns {Record<string, import('./grammar.js').TypeSpec>}
 */
export function recordedTable(table) {
    if (RUN_START_KINDS.includes(table)) return RUN_START_FIELDS;
    const colon = table.indexOf(':');
    const kind = table.slice(0, colon);
    const type = table.slice(colon + 1);
    return (kind === 'entryType' ? ENTRY_TYPE_ALLOWLIST[type] : EVENT_TYPE_ALLOWLIST[type]).fields;
}

/**
 * A field table, for messages: the type its items are.
 *
 * @param {string} table - as `tableOf` names it
 */
export function describeTable(table) {
    if (RUN_START_KINDS.includes(table)) return `\`${table}\` run start`;
    const colon = table.indexOf(':');
    return `\`${table.slice(colon + 1)}\` ${table.startsWith('entryType:') ? 'entry' : 'event'}`;
}

/**
 * The type of one item of a recorded type, whose names its field table lists.
 *
 * @param {Recorded} recorded
 * @returns {StaticType}
 */
export function itemTypeOf(recorded) {
    return {
        ...typeOf('object'),
        fieldPaths: [
            tableOf(recorded),
        ],
    };
}

/**
 * The `api` path of a `target`: `{"api": <path>}` or `{"api": {"path": <path>}}`, and nothing else.
 *
 * @param {unknown} target
 * @returns {string | undefined}
 */
function targetPath(target) {
    if (!isPlainObject(target) || Object.keys(target).join() !== 'api') return undefined;
    const body = apiBody(target.api);
    if (!isPlainObject(body) || Object.keys(body).join() !== 'path' || typeof body.path !== 'string') return undefined;
    return body.path;
}

/**
 * Check the keys of an `observed`, `trigger` or `on` body that name its type, and that the body has
 * only the keys of its place. Returns the type and target it names, or `undefined` when it names none
 * CI knows.
 *
 * @param {unknown} body
 * @param {Place} place
 * @param {Context} ctx
 * @param {string} path
 * @returns {Recorded | undefined}
 */
export function checkRecordedBody(body, place, ctx, path) {
    if (!isPlainObject(body)) {
        fail(ctx, path, `${PLACE_NAMES[place]} is an object`);
        return undefined;
    }
    const allowed = [
        ...TYPE_KEYS,
        ...PLACE_KEYS[place],
    ];
    for (const key of Object.keys(body)) {
        if (allowed.includes(key)) continue;
        if (key === 'keep') fail(ctx, `${path}.keep`, '`keep` sets the window of an `observed` body only');
        else if (key === 'field' && place === 'on')
            fail(
                ctx,
                `${path}.field`,
                'an `on` body selects the arrivals that run the detector, and gives no value: read it with `trigger`',
            );
        else fail(ctx, `${path}.${key}`, `"${key}" is not a key of ${PLACE_NAMES[place]}`);
    }
    const kinds = [
        ...RECORDED_KINDS,
        ...(place === 'trigger' ? RUN_START_KINDS : []),
    ];
    const named = kinds.filter((key) => key in body);
    if (named.length !== 1) {
        fail(ctx, path, `${PLACE_NAMES[place]} takes exactly one of ${kinds.map((key) => `\`${key}\``).join(', ')}`);
        return undefined;
    }
    const [
        kind,
    ] = named;
    if (RUN_START_KINDS.includes(kind)) {
        if (!isPlainObject(body[kind]) || Object.keys(body[kind]).length) fail(ctx, `${path}.${kind}`, `\`${kind}\` takes \`{}\``);
        for (const key of [
            'durationThreshold',
            'target',
        ]) {
            if (key in body) fail(ctx, `${path}.${key}`, `\`${key}\` goes with \`entryType\` or \`event\`, not \`${kind}\``);
        }
        return { kind, type: kind };
    }
    const type = body[kind];
    const typePath = `${path}.${kind}`;
    if (typeof type !== 'string') {
        fail(ctx, typePath, `\`${kind}\` is a string`);
        return undefined;
    }

    let known = true;
    if (kind === 'entryType') {
        if (!Object.hasOwn(ENTRY_TYPE_ALLOWLIST, type)) {
            fail(ctx, typePath, `entry type "${type}" is not on ENTRY_TYPE_ALLOWLIST`);
            known = false;
        }
        if ('target' in body) fail(ctx, `${path}.target`, '`target` goes with `event` only');
    } else if (NEVER_EVENT_TYPES.includes(type)) {
        fail(ctx, typePath, `"${type}" is never listened for, since a listener for it takes the page out of the back/forward cache`);
        known = false;
    } else if (!Object.hasOwn(EVENT_TYPE_ALLOWLIST, type)) {
        fail(ctx, typePath, `event type "${type}" is not on EVENT_TYPE_ALLOWLIST`);
        known = false;
    }

    if ('durationThreshold' in body) {
        const min = kind === 'entryType' && known ? ENTRY_TYPE_ALLOWLIST[type].minDurationThreshold : undefined;
        const threshold = body.durationThreshold;
        if (min === undefined) {
            fail(ctx, `${path}.durationThreshold`, '`durationThreshold` goes with an entry type whose observer takes it, `event` only');
        } else if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < min) {
            fail(ctx, `${path}.durationThreshold`, `\`durationThreshold\` is a number, at least ${min}`);
        }
    }

    if (kind !== 'event') return known ? { kind, type } : undefined;

    let target = 'window';
    if ('target' in body) {
        const read = targetPath(body.target);
        if (read === undefined || !EVENT_TARGET_ALLOWLIST.includes(read)) {
            fail(
                ctx,
                `${path}.target`,
                `${PLACE_NAMES[place]}'s \`target\` is registered once, as the page loads, and is \`{"api": <path>}\` with a path on EVENT_TARGET_ALLOWLIST: ${EVENT_TARGET_ALLOWLIST.join(', ')}`,
            );
            return undefined;
        }
        target = read;
    }
    if (!known) return undefined;
    const targets = eventTargets(type);
    if (!targets.includes(target)) {
        fail(
            ctx,
            'target' in body ? `${path}.target` : path,
            `"${type}" is listened for on ${targets.map((name) => `\`${name}\``).join(', ')} only${'target' in body ? '' : ', and `target` is `window` when absent'}`,
        );
    }
    return { kind, type, target };
}

/**
 * `keep` on an `observed` body: present, as the config build writes it, and within the caps of its
 * type, or `null` for a type read unbounded.
 *
 * @param {Record<string, any>} body
 * @param {Recorded} recorded
 * @param {Context} ctx
 * @param {string} path
 */
function checkKeep(body, recorded, ctx, path) {
    if (!('keep' in body)) {
        fail(ctx, path, '`observed` needs `keep`, which the config build writes where config leaves it out');
        return;
    }
    const keep = body.keep;
    const keepPath = `${path}.keep`;
    if (keep === null) {
        if (!(UNBOUNDED_KEEP_TYPES[recorded.kind] ?? []).includes(recorded.type)) {
            const unbounded = Object.entries(UNBOUNDED_KEEP_TYPES).flatMap(
                ([
                    kind,
                    types,
                ]) => types.map((type) => `\`${type}\` ${kind === 'event' ? 'events' : 'entries'}`),
            );
            fail(ctx, keepPath, `\`keep: null\` reads every item recorded, which only ${unbounded.join(' and ')} take`);
        }
        return;
    }
    if (!isPlainObject(keep) || Object.keys(keep).length === 0) {
        fail(ctx, keepPath, '`keep` is an object with `count`, `withinMs` or both, or `null`');
        return;
    }
    /** @type {Record<string, number>} */
    const caps = { ...OBSERVED_KEEP_CAPS, ...(OBSERVED_KEEP_CAPS_BY_TYPE[recorded.kind]?.[recorded.type] ?? {}) };
    for (const [
        key,
        value,
    ] of Object.entries(keep)) {
        if (!Object.hasOwn(caps, key))
            fail(ctx, `${keepPath}.${key}`, `"${key}" is not a key of \`keep\`, which takes \`count\` and \`withinMs\``);
        else if (!Number.isInteger(value) || value < 1) fail(ctx, `${keepPath}.${key}`, `\`${key}\` is a positive integer`);
        else if (value > caps[key]) fail(ctx, `${keepPath}.${key}`, `\`${key}\` is at most ${caps[key]} for ${describeRecorded(recorded)}`);
    }
}

/**
 * `observed` and `trigger`: the items recorded of a type, or of the arrival that started the run, as
 * a selected list. Without `field`, in boolean position, a body holds when it gives an item.
 *
 * @param {'observed' | 'trigger'} key
 * @param {unknown} body
 * @param {Position} position
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
export function checkRecordedSource(key, body, position, scope, ctx, path) {
    if (key === 'trigger' && scope.inMatch) fail(ctx, path, '`match` reads the page only, and holds no `trigger`');
    expectPosition(ctx, path, `\`${key}\``, position, [
        'boolean',
        'value',
        'number',
        'list',
        'spread',
        'root',
    ]);
    const recorded = checkRecordedBody(body, key, ctx, path);
    if (!isPlainObject(body)) return UNKNOWN;
    const hasField = 'field' in body;
    if (hasField && position === 'boolean') fail(ctx, path, `\`${key}\` with \`field\`: ${LIST_CONDITION}`);
    if (recorded) {
        ctx.recordedReads.push(recorded);
        if (key === 'observed') checkKeep(body, recorded, ctx, path);
        if (key === 'trigger') checkStartedBy(recorded, ctx, path);
    }
    const itemType = recorded ? itemTypeOf(recorded) : UNKNOWN;
    if ('where' in body)
        checkPredicate(body.where, 'item', itemType, { ...bindItem(scope, itemType), underNone: false }, ctx, `${path}.where`);
    const valueType = hasField ? checkFieldRead(body.field, itemType, scope, ctx, `${path}.field`) : itemType;
    if (position === 'boolean') return typeOf('boolean');
    const type = sourceType(valueType, 'selected', position, ctx, path);
    return type.list === 'selected' && !hasField ? { ...type, leaf: true } : type;
}

/**
 * A `trigger` body names something that can start a run of the detector: a body of its `observe`
 * trigger's `on`, with the same target, or the `auto` or `breakageReport` trigger, enabled.
 *
 * @param {Recorded} recorded
 * @param {Context} ctx
 * @param {string} path
 */
function checkStartedBy(recorded, ctx, path) {
    if (RUN_START_KINDS.includes(recorded.kind)) {
        if (!ctx.enabledTriggers.has(recorded.kind))
            fail(ctx, path, `\`trigger\` reads a run the \`${recorded.kind}\` trigger started, and the detector doesn't enable it`);
        return;
    }
    if (!ctx.onBodies.some((on) => sameRecorded(on, recorded)))
        fail(
            ctx,
            path,
            `\`trigger\` reads ${describeRecorded(recorded)}, and no body of the \`observe\` trigger's \`on\` names them, so it never gives an item`,
        );
}

/**
 * The type and target of each `on` body of a detector's `observe` trigger, as `trigger` bodies match
 * them. The trigger checks report on the bodies.
 *
 * @param {unknown} triggers
 * @returns {Recorded[]}
 */
export function onBodiesOf(triggers) {
    const on = isPlainObject(triggers) && isPlainObject(triggers.observe) ? triggers.observe.on : undefined;
    if (!Array.isArray(on)) return [];
    const ctx = newContext();
    return on.flatMap((body) => {
        const recorded = checkRecordedBody(body, 'on', ctx, '');
        return recorded
            ? [
                  recorded,
              ]
            : [];
    });
}
