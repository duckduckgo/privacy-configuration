import fs from 'fs';

/**
 * @typedef {import('./types.js').TypeName} TypeName
 */

/** Combinators in match, in predicates, and in the legacy blocks over `text` and `element` bodies. */
export const OPERATOR_KEYS = [
    'any',
    'all',
    'none',
];

/** Payload keys, and group and detector names. */
export const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/** Names `define` binds: a run name, or with `this.` a detector name. */
export const DEFINE_NAME_PATTERN = /^(this\.)?[a-zA-Z][a-zA-Z0-9_]*$/;

export const SOURCE_KEYS = [
    'element',
    'text',
    'api',
];

export const EXPRESSION_KEYS = [
    ...SOURCE_KEYS,
    'self',
    'expr',
    'only',
    'sum',
    'mul',
    'div',
    'if',
    ...OPERATOR_KEYS,
    'ref',
    'iter',
];

/** In the order they apply: `using` binds `self` to the expression's value, and `is` tests the result. */
export const MODIFIER_KEYS = [
    'using',
    'is',
];

/** Keys valid only beside `if`. */
export const BRANCH_KEYS = [
    'then',
    'else',
];

/** Keys valid only beside `iter`, in the order they apply to each item. */
export const ITER_KEYS = [
    'where',
    'field',
];

export const BODY_KEYS = {
    element: [
        'selector',
        'visibility',
        'where',
        'field',
        'root',
    ],
    text: [
        'pattern',
        'selector',
        'xpath',
        'xpathConfig',
        'root',
    ],
    api: [
        'path',
        'args',
        'where',
        'field',
    ],
};

export const VISIBILITY_VALUES = [
    'visible',
    'hidden',
    'any',
    'content',
];

export const FIELD_KEYS = [
    'path',
    'args',
];

export const TYPE_NAMES = [
    'number',
    'string',
    'boolean',
    'null',
    'undefined',
    'array',
    'object',
];

export const COMPARISON_OPERATORS = [
    'lt',
    'lte',
    'gt',
    'gte',
];

/** Operator names at value level. At item level they are property paths. */
export const VALUE_OPERATORS = [
    'eq',
    'in',
    ...COMPARISON_OPERATORS,
    'fails',
    'type',
];

export const PAYLOAD_ACTIONS = [
    'fireEvent',
    'breakageReportData',
];

export const PAYLOAD_FIELD_KEYS = [
    'value',
    'when',
    'buckets',
];

/** Keys of a detector. */
export const DETECTOR_KEYS = [
    'state',
    'triggers',
    'match',
    'actions',
];

/** The keys that make an object an action. */
export const ACTION_KEYS = [
    ...PAYLOAD_ACTIONS,
    'define',
];

/**
 * Every name an `api` may read: each prefix of the `path`, and the path joined by `.` to each
 * name a `field` path or a predicate reads from its items or values. A `method` is called
 * through `args`, as the last name of a path, or read as a function before `apply`, `call` or
 * `bind`, or as the last name of an `args` entry; a `property` is read.
 *
 * C-S-S reads any name config gives, so this list is the review point. A detector reading a name
 * not listed adds it here in the same change. Names reading user data or URLs, such as
 * `document.cookie` and `.name` on `resource` entries, stay off the list.
 *
 * @type {Record<string, 'method' | 'property'>}
 */
export const API_ALLOWLIST = {
    Array: 'property',
    'Array.from': 'method',
    'Array.from.length': 'property',
    Math: 'property',
    'Math.max': 'method',
    'Math.max.apply': 'method',
    'Math.min': 'method',
    'Math.min.apply': 'method',
    Number: 'property',
    'Number.isFinite': 'method',
    'Number.isNaN': 'method',
    PerformanceObserver: 'property',
    'PerformanceObserver.supportedEntryTypes': 'property',
    'PerformanceObserver.supportedEntryTypes.includes': 'method',
    PerformanceResourceTiming: 'property',
    'PerformanceResourceTiming.prototype': 'property',
    Reflect: 'property',
    'Reflect.has': 'method',
    RegExp: 'method',
    String: 'property',
    'String.prototype': 'property',
    'String.prototype.replace': 'method',
    'String.prototype.replace.call': 'method',
    'String.prototype.replace.call.length': 'property',
    document: 'property',
    'document.elementFromPoint': 'method',
    'document.elementFromPoint.matches': 'method',
    'document.fonts': 'property',
    'document.fonts.status': 'property',
    'document.getElementsByTagName': 'method',
    'document.getElementsByTagName.length': 'property',
    'document.hidden': 'property',
    'document.readyState': 'property',
    'document.title': 'property',
    'document.title.length': 'property',
    'document.title.matchAll': 'method',
    getComputedStyle: 'method',
    'getComputedStyle.position': 'property',
    innerHeight: 'property',
    innerWidth: 'property',
    matchMedia: 'method',
    'matchMedia.matches': 'property',
    performance: 'property',
    'performance.getEntries': 'method',
    'performance.getEntriesByName': 'method',
    'performance.getEntriesByName.length': 'property',
    'performance.getEntriesByName.startTime': 'property',
    'performance.getEntriesByType': 'method',
    'performance.getEntriesByType.decodedBodySize': 'property',
    'performance.getEntriesByType.duration': 'property',
    'performance.getEntriesByType.initiatorType': 'property',
    'performance.getEntriesByType.length': 'property',
    'performance.getEntriesByType.loadEventEnd': 'property',
    'performance.getEntriesByType.processingStart': 'property',
    'performance.getEntriesByType.responseEnd': 'property',
    'performance.getEntriesByType.responseStatus': 'property',
    'performance.getEntriesByType.startTime': 'property',
    'performance.getEntriesByType.type': 'property',
    'performance.now': 'method',
};

/**
 * The type each JS builtin on API_ALLOWLIST returns. The tables from WebIDL do not cover them.
 *
 * @type {Record<string, TypeName>}
 */
export const BUILTIN_RETURN_TYPES = {
    'Array.from': 'array',
    'Math.max': 'number',
    'Math.max.apply': 'number',
    'Math.min': 'number',
    'Math.min.apply': 'number',
    'Number.isFinite': 'boolean',
    'Number.isNaN': 'boolean',
    'Reflect.has': 'boolean',
    RegExp: 'object',
    'String.prototype.replace.call': 'string',
};

/** Names that read the method before them as a function. */
export const FUNCTION_READS = [
    'apply',
    'call',
    'bind',
];

/**
 * An `api` body: a string is short for `{"path": <string>}`.
 *
 * @param {unknown} raw
 * @returns {unknown}
 */
export function apiBody(raw) {
    return typeof raw === 'string' ? { path: raw } : raw;
}

/**
 * Methods a `field` may call on `element` items, with the IDL type each returns. Each leaves the
 * page unchanged: it fires no event and changes no focus, DOM or state. WebIDL does not mark
 * side effects, so this list is kept by hand.
 */
export const ELEMENT_METHOD_ALLOWLIST = {
    checkVisibility: 'boolean',
    closest: 'Element?',
    getAttribute: 'DOMString?',
    getAttributeNS: 'DOMString?',
    getAttributeNames: 'sequence<DOMString>',
    getBoundingClientRect: 'DOMRect',
    getClientRects: 'DOMRectList',
    hasAttribute: 'boolean',
    hasAttributeNS: 'boolean',
    hasAttributes: 'boolean',
    hasChildNodes: 'boolean',
    matches: 'boolean',
    querySelector: 'Element?',
    querySelectorAll: 'NodeList',
};

/**
 * @typedef {{
 *   _meta: Record<string, unknown>,
 *   reservedNameProperties: string[],
 *   tags: Record<string, Record<string, string>>,
 *   interfaces: Record<string, { inherits: string | null, properties: Record<string, string> }>,
 * }} PropertyTables
 */

/** Generated by scripts/generate-element-property-tables.mjs. */
export const PROPERTY_TABLES = /** @type {PropertyTables} */ (
    JSON.parse(fs.readFileSync(new URL('../../data/element-property-tables.json', import.meta.url), 'utf8'))
);

/** Floor for a non-zero chunkSize. Smaller chunks multiply regex tests for little gain. */
export const MIN_CHUNK_SIZE = 1024;

/**
 * Upper bound on chunkTail as a fraction of chunkSize. A tail is re-scanned by the
 * following test, so this caps the scanning overhead a config can impose at 1.25x.
 */
export const MAX_TAIL_RATIO = 4;
