// @ts-check
/**
 * @typedef {import('./types.js').TypeName} TypeName
 */

/** Combinators in match and in predicates. */
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
];

/** Keys valid only beside `if`. */
export const BRANCH_KEYS = [
    'then',
    'else',
];

/** Why a selected list other than the condition leaf is refused as a condition */
export const LIST_CONDITION =
    'a list as a condition holds when it has an item, which reads like a test of its values: `only` gives its one item, and `using: "length"` counts them';

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
    Math: 'property',
    'Math.max': 'method',
    'Math.max.apply': 'method',
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
    document: 'property',
    'document.fonts': 'property',
    'document.fonts.status': 'property',
    'document.getElementsByTagName': 'method',
    'document.getElementsByTagName.length': 'property',
    'document.hidden': 'property',
    getComputedStyle: 'method',
    'getComputedStyle.position': 'property',
    innerHeight: 'property',
    innerWidth: 'property',
    performance: 'property',
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
    'performance.getEntriesByType.responseStatus': 'property',
    'performance.getEntriesByType.startTime': 'property',
    'performance.getEntriesByType.type': 'property',
    'performance.now': 'method',
};

/**
 * The type each JS builtin on API_ALLOWLIST returns.
 *
 * @type {Record<string, TypeName>}
 */
export const BUILTIN_RETURN_TYPES = {
    'Math.max': 'number',
    'Math.max.apply': 'number',
    'Number.isFinite': 'boolean',
    'Number.isNaN': 'boolean',
    'Reflect.has': 'boolean',
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
 * A type in ELEMENT_ALLOWLIST: type names joined by `|`. Each is a TypeName, `nan` for a number
 * that can be NaN, `fragment` for a shadow root or other document fragment, or an
 * ELEMENT_ALLOWLIST interface, whose names a read from the value may take. An entry needing
 * another type adds it here.
 *
 * @typedef {'boolean' | 'number' | 'number|nan' | 'string' | 'object|null' | 'fragment|null' | 'DOMRect'} TypeSpec
 * @typedef {{ kind: 'method' | 'property', type: TypeSpec }} ElementMember
 */

/**
 * Every name a read from an element may take, by the interface declaring it, with the type it
 * gives: a `method`'s return when called, a `property`'s value. Every element reads the `Element`
 * and `HTMLElement` names, and the names of the interfaces TAG_INTERFACES gives its tag. A value
 * typed as another object reads no name.
 *
 * C-S-S reads any name config gives, so this list is the review point. A detector reading a name
 * not listed adds it here in the same change. A method leaves the page unchanged: it fires no
 * event and changes no focus, DOM or state. Names reading user data or URLs, such as `href`,
 * `src` and `ownerDocument`, stay off the list. `currentSrc` is a URL, listed for detectors that
 * read its `length` to tell an image with a source from one without.
 *
 * @type {Record<string, Record<string, ElementMember>>}
 */
export const ELEMENT_ALLOWLIST = {
    Element: {
        checkVisibility: { kind: 'method', type: 'boolean' },
        getBoundingClientRect: { kind: 'method', type: 'DOMRect' },
        shadowRoot: { kind: 'property', type: 'fragment|null' },
        textContent: { kind: 'property', type: 'string' },
    },
    HTMLElement: {
        hidden: { kind: 'property', type: 'boolean' },
    },
    HTMLImageElement: {
        complete: { kind: 'property', type: 'boolean' },
        currentSrc: { kind: 'property', type: 'string' },
        height: { kind: 'property', type: 'number' },
        naturalWidth: { kind: 'property', type: 'number' },
        width: { kind: 'property', type: 'number' },
    },
    HTMLLinkElement: {
        sheet: { kind: 'property', type: 'object|null' },
    },
    HTMLMediaElement: {
        duration: { kind: 'property', type: 'number|nan' },
    },
    DOMRect: {
        height: { kind: 'property', type: 'number' },
        width: { kind: 'property', type: 'number' },
    },
};

/**
 * The ELEMENT_ALLOWLIST interfaces of each tag whose names a detector reads, by lower-case tag.
 *
 * @type {Record<string, string[]>}
 */
export const TAG_INTERFACES = {
    audio: [
        'HTMLMediaElement',
    ],
    img: [
        'HTMLImageElement',
    ],
    link: [
        'HTMLLinkElement',
    ],
    video: [
        'HTMLMediaElement',
    ],
};
