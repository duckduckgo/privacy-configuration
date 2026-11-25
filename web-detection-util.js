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
 * The least `delayMs` of an `on` body for a type that arrives every frame, which has `whenPending`
 * `"skip"` or `"batch"`, so the detector runs at most once per `delayMs`.
 */
export const PER_FRAME_MIN_DELAY_MS = 250;

/**
 * `keep` caps for every type of a body key, such as every detector event name. A cap listed here
 * replaces the one in OBSERVED_KEEP_CAPS, and a cap in OBSERVED_KEEP_CAPS_BY_TYPE replaces both. A
 * detector event's `data` can be an element, which the log keeps in memory while it holds the item.
 *
 * @type {Readonly<Record<string, Partial<typeof OBSERVED_KEEP_CAPS>>>}
 */
export const OBSERVED_KEEP_CAPS_BY_KIND = Object.freeze({
    detectorEvent: { count: 20 },
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
 * The longest a `wait` lasts when config gives it no `timeoutMs`, in ms, which the config build writes
 * onto the body. C-S-S reads only the `timeoutMs` config gives, and a `wait` without one fails to parse.
 */
export const DEFAULT_WAIT_TIMEOUT_MS = 5000;

/** The most a `wait`'s `timeoutMs` may be, in ms: CI rejects a larger one. */
export const MAX_WAIT_TIMEOUT_MS = 30000;

/**
 * Whether CI allows `timeoutMs: null`, a `wait` that lasts until an item matches or the run is
 * abandoned. C-S-S takes it.
 */
export const ALLOW_UNBOUNDED_WAIT = false;

/**
 * The most runs that detector events with no `delayMs` start in a chain in one task, when config gives
 * no `detectorEventMaxDepth`, which the config build writes into the settings. C-S-S reads a missing
 * value as 0, so detector events start no runs without it.
 */
export const DEFAULT_DETECTOR_EVENT_MAX_DEPTH = 4;

/** The largest `detectorEventMaxDepth` CI allows. */
export const MAX_DETECTOR_EVENT_MAX_DEPTH = 8;

/**
 * The key the config build writes onto each body of an expression key when config leaves it out, and
 * the value it writes.
 *
 * @type {Readonly<Record<string, [string, unknown]>>}
 */
/** Expression and action keys whose body maps names to expressions. */
const NAME_MAP_KEYS = [
    'define',
    'object',
];

const BODY_DEFAULTS = Object.freeze({
    observed: [
        'keep',
        DEFAULT_OBSERVED_KEEP,
    ],
    wait: [
        'timeoutMs',
        DEFAULT_WAIT_TIMEOUT_MS,
    ],
});

/**
 * Write the default `keep` onto every `observed` body without one, and the default `timeoutMs` onto
 * every `wait` body without one, under a webDetection config value.
 * The names of a `define`, the fields of an `object` and the keys of a payload's `data` are names,
 * never expression keys, so an `observed` or `wait` there is left alone.
 *
 * @param {unknown} node
 * @param {boolean} [names] - whether the keys of `node` are names: a `define`, an `object`, or a payload's `data`
 * @param {boolean} [payload] - whether `node` is the body of a payload action
 */
function defaultsUnder(node, names = false, payload = false) {
    if (Array.isArray(node)) {
        node.forEach((entry) => defaultsUnder(entry));
        return;
    }
    if (!isPlainObject(node)) return;
    for (const [
        key,
        value,
    ] of Object.entries(node)) {
        if (names) {
            defaultsUnder(value);
            continue;
        }
        if (Object.hasOwn(BODY_DEFAULTS, key)) defaultBody(key, value);
        defaultsUnder(value, NAME_MAP_KEYS.includes(key) || (payload && key === 'data'), WEB_DETECTION_PAYLOAD_ACTIONS.includes(key));
    }
}

/**
 * Write the default of an expression key's body onto the body, when config leaves it out.
 *
 * @param {string} key - a BODY_DEFAULTS key
 * @param {unknown} body
 */
function defaultBody(key, body) {
    const [
        name,
        value,
    ] = BODY_DEFAULTS[key];
    if (isPlainObject(body) && !(name in body)) body[name] = isPlainObject(value) ? { ...value } : value;
}

/**
 * Write the defaults onto the `observed` and `wait` bodies of a detector, or of each detector of a
 * group or of the detectors.
 *
 * @param {unknown} value
 * @param {number} depth - 0 for a detector, 1 for a group, 2 for the detectors
 */
function defaultsUnderDetectors(value, depth) {
    if (!isPlainObject(value)) return;
    if (depth > 0) {
        for (const entry of Object.values(value)) defaultsUnderDetectors(entry, depth - 1);
        return;
    }
    defaultsUnder(value.match);
    defaultsUnder(value.actions);
}

/**
 * Write the default `keep` onto every `observed` body without one, and the default `timeoutMs` onto
 * every `wait` body without one: in the detectors, and in the values `conditionalChanges` patches add
 * or replace under `/detectors`. C-S-S reads only the windows and timeouts config gives, so each body
 * has one.
 *
 * Mutates the config in place.
 *
 * @param {object} config - a fully-merged platform config
 */
export function defaultWebDetectionBodies(config) {
    const settings = config?.features?.webDetection?.settings;
    if (!settings) {
        return;
    }
    defaultsUnderDetectors(settings.detectors, 2);
    for (const entry of settings.conditionalChanges ?? []) {
        for (const operation of entry.patchSettings ?? []) {
            if (typeof operation.path !== 'string' || (operation.op !== 'add' && operation.op !== 'replace')) continue;
            const segments = operation.path
                .split('/')
                .slice(1)
                .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
            if (segments[0] !== 'detectors') continue;
            if (segments.length <= 3) {
                defaultsUnderDetectors(operation.value, 3 - segments.length);
                continue;
            }
            if (segments[3] !== 'match' && segments[3] !== 'actions') continue;
            const inner = segments.slice(4);
            const last = inner[inner.length - 1];
            if (inner.length && Object.hasOwn(BODY_DEFAULTS, last) && !pathState(inner.slice(0, -1)).names) {
                defaultBody(last, operation.value);
                continue;
            }
            const { names, payload } = pathState(inner);
            defaultsUnder(operation.value, names, payload);
        }
    }
}

/**
 * What `defaultsUnder` knows of the value at the end of a path from a detector's `match` or `actions`:
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
        names = !isName && (NAME_MAP_KEYS.includes(segment) || (payload && segment === 'data'));
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
 * Write the default `readCacheMaxAgeMs` and `detectorEventMaxDepth` into the webDetection settings
 * when config leaves them out.
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
    if (!('detectorEventMaxDepth' in settings)) settings.detectorEventMaxDepth = DEFAULT_DETECTOR_EVENT_MAX_DEPTH;
}
