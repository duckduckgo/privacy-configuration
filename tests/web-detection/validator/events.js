// @ts-check
import { ruleLink } from './context.js';
import { PAYLOAD_ACTIONS } from './grammar.js';
import { isPlainObject } from '../../../util.js';
import { MAX_DETECTOR_EVENT_MAX_DEPTH } from '../../../web-detection-util.js';

/**
 * What the `emit`s of one name give as `data`: `open` when any gives an expression other than an
 * `object`, so any path under `data` may be read; otherwise `fields`, the fields every `emit` gives
 * through `object`, and `absent` when one gives no `data`.
 *
 * @typedef {{ open: boolean, fields: Set<string>, absent: boolean }} EmittedData
 */

/**
 * The detector events of the detectors a client sees together: what each name's `emit`s give, the
 * names each detector emits, and the detectors each name's `on` bodies run.
 *
 * @typedef {{
 *   emits: Map<string, EmittedData>,
 *   emitted: Map<string, Set<string>>,
 *   observers: Map<string, Set<string>>,
 * }} DetectorEvents
 */

/** Keys whose body maps names to expressions, so its keys are never expression or action keys. */
const NAME_MAP_KEYS = [
    'define',
    'object',
];

/**
 * Invoke `cb` with the body of every `emit` action under a config value.
 *
 * @param {unknown} node
 * @param {(body: unknown) => void} cb
 * @param {boolean} [names] - whether the keys of `node` are names
 * @param {boolean} [payload] - whether `node` is the body of a payload action
 */
function forEachEmit(node, cb, names = false, payload = false) {
    if (Array.isArray(node)) {
        node.forEach((entry) => forEachEmit(entry, cb));
        return;
    }
    if (!isPlainObject(node)) return;
    for (const [
        key,
        value,
    ] of Object.entries(node)) {
        if (names) {
            forEachEmit(value, cb);
            continue;
        }
        if (key === 'emit') cb(value);
        forEachEmit(value, cb, NAME_MAP_KEYS.includes(key) || (payload && key === 'data'), PAYLOAD_ACTIONS.includes(key));
    }
}

/**
 * The fields an `emit`'s `data` gives through `object`, `undefined` when it gives no `data`, or `null`
 * when it gives another expression.
 *
 * @param {unknown} body - an `emit` body
 * @returns {string[] | undefined | null}
 */
function dataFields(body) {
    if (!isPlainObject(body) || !('data' in body)) return undefined;
    const data = body.data;
    if (isPlainObject(data) && Object.keys(data).join() === 'object' && isPlainObject(data.object)) return Object.keys(data.object);
    return null;
}

/**
 * The detector events of a list of detectors, by ID.
 *
 * @param {Array<[string, Record<string, any>]>} entries
 * @returns {DetectorEvents}
 */
export function detectorEventsOf(entries) {
    /** @type {DetectorEvents} */
    const events = { emits: new Map(), emitted: new Map(), observers: new Map() };
    for (const [
        id,
        detector,
    ] of entries) {
        if (!isPlainObject(detector)) continue;
        /** @type {Set<string>} */
        const names = new Set();
        forEachEmit(detector.actions, (body) => {
            if (!isPlainObject(body) || typeof body.name !== 'string') return;
            names.add(body.name);
            const fields = dataFields(body);
            const earlier = events.emits.get(body.name);
            /** @type {EmittedData} */
            const info = {
                open: fields === null || (earlier?.open ?? false),
                fields: new Set(fields ?? []),
                absent: fields === undefined || (earlier?.absent ?? false),
            };
            if (earlier)
                info.fields = new Set(
                    [
                        ...earlier.fields,
                    ].filter((field) => info.fields.has(field)),
                );
            events.emits.set(body.name, info);
        });
        events.emitted.set(id, names);
        const on = isPlainObject(detector.triggers) && isPlainObject(detector.triggers.observe) ? detector.triggers.observe.on : undefined;
        for (const body of Array.isArray(on) ? on : []) {
            if (!isPlainObject(body) || typeof body.detectorEvent !== 'string') continue;
            if (!events.observers.has(body.detectorEvent)) events.observers.set(body.detectorEvent, new Set());
            events.observers.get(body.detectorEvent)?.add(id);
        }
    }
    return events;
}

/** @type {WeakMap<object, DetectorEvents>} */
const byDetectors = new WeakMap();

/**
 * The detector events of the detectors a client sees together, by group and name.
 *
 * @param {Record<string, Record<string, Record<string, any>>>} detectors
 * @returns {DetectorEvents}
 */
export function detectorEventsOfGroups(detectors) {
    let events = byDetectors.get(detectors);
    if (!events) {
        events = detectorEventsOf(detectorEntries(detectors));
        byDetectors.set(detectors, events);
    }
    return events;
}

/**
 * Each detector of the groups with its ID, `group.name`.
 *
 * @param {Record<string, Record<string, Record<string, any>>>} detectors
 * @returns {Array<[string, Record<string, any>]>}
 */
export function detectorEntries(detectors) {
    return Object.entries(detectors).flatMap(
        ([
            group,
            entries,
        ]) =>
            Object.entries(entries).map(
                ([
                    name,
                    detector,
                ]) =>
                    /** @type {[string, Record<string, any>]} */ ([
                        `${group}.${name}`,
                        detector,
                    ]),
            ),
    );
}

/**
 * A key that differs between two sets of detectors when their detector events differ, so a check
 * reading them runs again.
 *
 * @param {Record<string, Record<string, Record<string, any>>>} detectors
 */
export function detectorEventsKey(detectors) {
    const { emits, emitted, observers } = detectorEventsOfGroups(detectors);
    /** @param {Map<string, any>} map */
    const entries = (map) =>
        [
            ...map,
        ].map(
            ([
                key,
                value,
            ]) => [
                key,
                value instanceof Set
                    ? [
                          ...value,
                      ]
                    : {
                          ...value,
                          fields: [
                              ...value.fields,
                          ],
                      },
            ],
        );
    return JSON.stringify([
        entries(emits),
        entries(emitted),
        entries(observers),
    ]);
}

/**
 * A chain of detector events from a detector back to itself: each name it emits runs the detectors
 * whose `on` bodies observe it, with or without `delayMs`. Followed through `observe` triggers only,
 * so a detector may `wait` for a reply from one that observes its request.
 *
 * @param {string} id
 * @param {DetectorEvents} events
 * @returns {string[] | undefined} the chain, as detector IDs and the names between them
 */
export function detectorEventCycle(id, events) {
    /** @type {Array<{ at: string, chain: string[] }>} */
    const queue = [
        {
            at: id,
            chain: [
                id,
            ],
        },
    ];
    const seen = new Set([
        id,
    ]);
    while (queue.length) {
        const { at, chain } = /** @type {{ at: string, chain: string[] }} */ (queue.shift());
        for (const name of events.emitted.get(at) ?? []) {
            for (const observer of events.observers.get(name) ?? []) {
                const next = [
                    ...chain,
                    `"${name}"`,
                    observer,
                ];
                if (observer === id) return next;
                if (seen.has(observer)) continue;
                seen.add(observer);
                queue.push({ at: observer, chain: next });
            }
        }
    }
    return undefined;
}

/**
 * Errors on the `detectorEventMaxDepth` setting, and on the values `conditionalChanges` patches give
 * it: an integer from 0 to the cap.
 *
 * @param {Record<string, any> | undefined} settings - `webDetection` settings
 * @returns {string[]}
 */
export function detectorEventMaxDepthErrors(settings) {
    if (!isPlainObject(settings)) return [];
    /** @type {string[]} */
    const errors = [];
    /**
     * @param {unknown} value
     * @param {string} label
     */
    const check = (value, label) => {
        if (!Number.isInteger(value) || /** @type {number} */ (value) < 0 || /** @type {number} */ (value) > MAX_DETECTOR_EVENT_MAX_DEPTH)
            errors.push(
                `${label}: \`detectorEventMaxDepth\` is an integer from 0 to ${MAX_DETECTOR_EVENT_MAX_DEPTH}, and is ${JSON.stringify(value)}${ruleLink('featureSettings')}`,
            );
    };
    if ('detectorEventMaxDepth' in settings) check(settings.detectorEventMaxDepth, 'settings');
    (settings.conditionalChanges ?? []).forEach((/** @type {Record<string, any>} */ entry, /** @type {number} */ index) => {
        for (const operation of entry.patchSettings ?? []) {
            if (operation.path === '/detectorEventMaxDepth' && (operation.op === 'add' || operation.op === 'replace'))
                check(operation.value, `conditionalChanges[${index}]`);
        }
    });
    return errors;
}
