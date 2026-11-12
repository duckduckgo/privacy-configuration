/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isJsonObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
    if (!isJsonObject(buckets)) return buckets;
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
    if (isJsonObject(field) && 'buckets' in field) field.buckets = bucketArray(field.buckets, `${path}.buckets`);
}

/**
 * @param {unknown} data - an action's `data`
 * @param {string} path
 */
function arrayPayloadBuckets(data, path) {
    if (!isJsonObject(data)) return;
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
    if (!isJsonObject(node)) return;
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
