import { isPlainObject } from './util.js';

const WEB_DETECTION_PAYLOAD_ACTIONS = [
    'fireEvent',
    'breakageReportData',
];

/** A name a JS object lists first, in ascending order, whatever order the config writes it in. */
const INTEGER_NAME = /^(0|[1-9][0-9]*)$/;

/**
 * `buckets` as clients read it: an array of `{name, is}`. An object maps each name to its
 * predicate, and becomes the array in config order.
 *
 * @param {unknown} buckets
 * @param {string} path
 * @returns {unknown}
 */
function bucketArray(buckets, path) {
    if (!isPlainObject(buckets)) return buckets;
    return Object.entries(buckets).map(
        ([
            name,
            is,
        ]) => {
            if (INTEGER_NAME.test(name)) {
                throw new Error(
                    `${path}: bucket name "${name}" is integer-like, which a JS object lists first: write \`buckets\` as an array of {"name", "is"}`,
                );
            }
            return { name, is };
        },
    );
}

/**
 * @param {unknown} field - a payload field
 * @param {string} path
 */
function arrayFieldBuckets(field, path) {
    if (isPlainObject(field) && 'buckets' in field) field.buckets = bucketArray(field.buckets, `${path}.buckets`);
}

/**
 * @param {unknown} data - an action's `data`
 * @param {string} path
 */
function arrayPayloadBuckets(data, path) {
    if (!isPlainObject(data)) return;
    for (const [
        key,
        field,
    ] of Object.entries(data)) {
        arrayFieldBuckets(field, `${path}.${key}`);
    }
}

/**
 * Rewrite the buckets of every payload under a webDetection config value.
 *
 * @param {unknown} node
 * @param {string} path
 * @param {string} [key] - the key the value sits under: a payload action's body holds its `data`
 */
function arrayBucketsUnder(node, path, key) {
    if (Array.isArray(node)) {
        node.forEach((entry, index) => arrayBucketsUnder(entry, `${path}.${index}`));
        return;
    }
    if (!isPlainObject(node)) return;
    if (key !== undefined && WEB_DETECTION_PAYLOAD_ACTIONS.includes(key)) arrayPayloadBuckets(node.data, `${path}.data`);
    for (const [
        childKey,
        value,
    ] of Object.entries(node)) {
        arrayBucketsUnder(value, `${path}.${childKey}`, childKey);
    }
}

/**
 * Rewrite each webDetection payload field's `buckets` into an array of `{name, is}` in config order:
 * in the detectors, and in the values `conditionalChanges` patches add or replace under `/detectors`.
 * Authored config may write `buckets` as an object of names to predicates; clients test the array
 * in its order. Throws on an integer-like name in an object, and on a patch addressing a bucket by
 * name.
 *
 * Mutates the config in place.
 *
 * @param {object} config - a fully-merged platform config
 */
export function arrayWebDetectionBuckets(config) {
    const settings = config?.features?.webDetection?.settings;
    if (!settings) {
        return;
    }
    arrayBucketsUnder(settings.detectors, 'detectors');
    for (const entry of settings.conditionalChanges ?? []) {
        for (const operation of entry.patchSettings ?? []) {
            if (typeof operation.path !== 'string') continue;
            const segments = operation.path.split('/').slice(1);
            if (segments[0] !== 'detectors') continue;
            const path = segments.join('.');
            const dataIndex = segments.findLastIndex(
                (segment, index) => segment === 'data' && WEB_DETECTION_PAYLOAD_ACTIONS.includes(segments[index - 1]),
            );
            const rest = dataIndex === -1 ? [] : segments.slice(dataIndex + 1);
            if (rest[1] === 'buckets' && rest.length > 2 && !/^(\d+|-)$/.test(rest[2])) {
                throw new Error(
                    `${path}: a patch addresses a bucket by name, and clients read \`buckets\` as an array: patch \`buckets\` whole`,
                );
            }
            if (operation.op !== 'add' && operation.op !== 'replace') continue;
            if (dataIndex !== -1 && rest.length === 0) arrayPayloadBuckets(operation.value, path);
            else if (dataIndex !== -1 && rest.length === 1) arrayFieldBuckets(operation.value, path);
            else if (dataIndex !== -1 && rest.length === 2 && rest[1] === 'buckets') operation.value = bucketArray(operation.value, path);
            else arrayBucketsUnder(operation.value, path, segments[segments.length - 1]);
        }
    }
}

/**
 * The window of its log an `observed` body reads when config gives it no `keep`, which the config
 * build writes onto the body. C-S-S reads only the `keep` config gives, and a body without one fails
 * to parse.
 */
export const DEFAULT_OBSERVED_KEEP = Object.freeze({ count: 10, withinMs: 5000 });

/** The most an `observed` body's `keep` may hold, for every type: CI rejects a larger `count` or `withinMs`. */
export const OBSERVED_KEEP_CAPS = Object.freeze({ count: 100, withinMs: 30000 });

/**
 * Tighter `keep` caps for types that arrive often, by body key and type. A cap listed here replaces
 * the one in OBSERVED_KEEP_CAPS.
 *
 * @type {Readonly<Record<string, Record<string, Partial<typeof OBSERVED_KEEP_CAPS>>>>}
 */
export const OBSERVED_KEEP_CAPS_BY_TYPE = Object.freeze({
    event: { scroll: { withinMs: 5000 } },
});

/**
 * The types an `observed` body may read with `keep: null`, every item recorded, by body key. Each
 * arrives a few times in a page's life.
 *
 * @type {Readonly<Record<string, string[]>>}
 */
export const UNBOUNDED_KEEP_TYPES = Object.freeze({
    event: [
        'visibilitychange',
        'pagehide',
    ],
});

/**
 * Write the default `keep` onto every `observed` body without one under a webDetection config value.
 * The names of a `define` and the keys of a payload's `data` are names, never expression keys, so an
 * `observed` there is left alone.
 *
 * @param {unknown} node
 * @param {boolean} [names] - whether the keys of `node` are names: a `define`, or a payload's `data`
 * @param {boolean} [payload] - whether `node` is the body of a payload action
 */
function keepUnder(node, names = false, payload = false) {
    if (Array.isArray(node)) {
        node.forEach((entry) => keepUnder(entry));
        return;
    }
    if (!isPlainObject(node)) return;
    for (const [
        key,
        value,
    ] of Object.entries(node)) {
        if (names) {
            keepUnder(value);
            continue;
        }
        if (key === 'observed') defaultKeep(value);
        keepUnder(value, key === 'define' || (payload && key === 'data'), WEB_DETECTION_PAYLOAD_ACTIONS.includes(key));
    }
}

/**
 * @param {unknown} body - an `observed` body
 */
function defaultKeep(body) {
    if (isPlainObject(body) && !('keep' in body)) body.keep = { ...DEFAULT_OBSERVED_KEEP };
}

/**
 * Write the default `keep` onto the `observed` bodies of a detector, or of each detector of a group
 * or of the detectors.
 *
 * @param {unknown} value
 * @param {number} depth - 0 for a detector, 1 for a group, 2 for the detectors
 */
function keepUnderDetectors(value, depth) {
    if (!isPlainObject(value)) return;
    if (depth > 0) {
        for (const entry of Object.values(value)) keepUnderDetectors(entry, depth - 1);
        return;
    }
    keepUnder(value.match);
    keepUnder(value.actions);
}

/**
 * Write the default `keep` onto every `observed` body without one: in the detectors, and in the values
 * `conditionalChanges` patches add or replace under `/detectors`. C-S-S reads only the windows config
 * gives, so each body carries one.
 *
 * Mutates the config in place.
 *
 * @param {object} config - a fully-merged platform config
 */
export function defaultWebDetectionKeep(config) {
    const settings = config?.features?.webDetection?.settings;
    if (!settings) {
        return;
    }
    keepUnderDetectors(settings.detectors, 2);
    for (const entry of settings.conditionalChanges ?? []) {
        for (const operation of entry.patchSettings ?? []) {
            if (typeof operation.path !== 'string' || (operation.op !== 'add' && operation.op !== 'replace')) continue;
            const segments = operation.path
                .split('/')
                .slice(1)
                .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
            if (segments[0] !== 'detectors') continue;
            if (segments.length <= 3) {
                keepUnderDetectors(operation.value, 3 - segments.length);
                continue;
            }
            if (segments[3] !== 'match' && segments[3] !== 'actions') continue;
            const inner = segments.slice(4);
            if (inner.length && inner[inner.length - 1] === 'observed' && !pathState(inner.slice(0, -1)).names) {
                defaultKeep(operation.value);
                continue;
            }
            const { names, payload } = pathState(inner);
            keepUnder(operation.value, names, payload);
        }
    }
}

/**
 * What `keepUnder` knows of the value at the end of a path from a detector's `match` or `actions`:
 * whether its keys are names, and whether it's the body of a payload action.
 *
 * @param {string[]} segments
 * @returns {{ names: boolean, payload: boolean }}
 */
function pathState(segments) {
    let names = false;
    let payload = false;
    for (const segment of segments) {
        const isName = names;
        names = !isName && (segment === 'define' || (payload && segment === 'data'));
        payload = !isName && WEB_DETECTION_PAYLOAD_ACTIONS.includes(segment);
    }
    return { names, payload };
}

/**
 * How long C-S-S keeps the page reads of the detectors while the page is unchanged, when config gives
 * no `readCacheMaxAgeMs`, which the config build writes into the settings. `null` keeps them until the
 * page changes. Without it, C-S-S keeps them for the call stack that read them, with no check for changes.
 */
export const DEFAULT_READ_CACHE_MAX_AGE_MS = null;

/** The largest number of ms CI allows for `readCacheMaxAgeMs`, below the 2^31 - 1 ms a timer can wait. */
export const MAX_READ_CACHE_MAX_AGE_MS = 600000;

/**
 * Write the default `readCacheMaxAgeMs` into the webDetection settings when config leaves it out.
 *
 * Mutates the config in place.
 *
 * @param {object} config - a fully-merged platform config
 */
export function defaultWebDetectionSettings(config) {
    const settings = config?.features?.webDetection?.settings;
    if (!settings) {
        return;
    }
    if (!('readCacheMaxAgeMs' in settings)) settings.readCacheMaxAgeMs = DEFAULT_READ_CACHE_MAX_AGE_MS;
}
