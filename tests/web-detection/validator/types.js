import { fail } from './context.js';
import { PROPERTY_TABLES } from './grammar.js';
import { asArray } from './walk.js';

/**
 * @typedef {import('./context.js').Context} Context
 */

/**
 * @typedef {'number' | 'string' | 'boolean' | 'null' | 'undefined' | 'array' | 'object'} TypeName
 */

/**
 * What an expression's position expects, as C-S-S names it. `list` is the operand of `only`.
 * `spread` is an operand of `sum`, `mul`, `any`, `all` and `none` that gives a list, contributing
 * each item, and the position in which an `iter` streams. `root` is the `root` of a source, and the
 * expression beside `using`.
 *
 * @typedef {'boolean' | 'value' | 'number' | 'list' | 'spread' | 'root'} Position
 */

/**
 * What config shows about a value.
 *
 * @typedef {{
 *   types: TypeName[] | null,
 *   nan: boolean,
 *   interfaces?: string[],
 *   customElement?: boolean,
 *   fragment?: boolean,
 *   apiPaths?: string[],
 *   list?: 'selected' | 'maybe',
 *   leaf?: boolean,
 *   nonNumericStrings?: boolean,
 *   recipe?: boolean,
 * }} StaticType
 *
 * `types` is null when config does not show the type. `nan` is set when the value can be NaN.
 * `interfaces` names the element interfaces an element value can have, and `customElement` is
 * set when it can also be a custom element, whose page-defined values have names outside the
 * tables. `fragment` is set when the value can be a shadow root or other document fragment, which
 * browsers refuse as an XPath context node. `apiPaths` are the `api` names the value may have been
 * read through, one for each branch that reads a different one, which names read from it extend
 * for the allowlist.
 *
 * `list` marks a selected list, and the other keys then describe its items. `selected` is what
 * `element`, `text` and `api` with `where` give. `maybe` is a value that is a selected list on
 * some pages or branches only: an `api` with `field`, or an `if` with one list branch.
 *
 * `leaf` marks the selected list of `element` without `field` or `text`, the condition leaf, which
 * in boolean position holds when it has an item.
 *
 * `nonNumericStrings` is set when every string the value can be is a literal that converts to
 * NaN, such as `"unsupported"`, so a comparison on it is false.
 *
 * `recipe` marks a name bound to an `iter`, which each `ref` evaluates again, so a `ref` to it
 * fills the positions an `iter` fills.
 */

/** @type {StaticType} */
export const UNKNOWN = { types: null, nan: false };

/**
 * @param {TypeName} name
 * @returns {StaticType}
 */
export function typeOf(name) {
    return {
        types: [
            name,
        ],
        nan: false,
    };
}

/**
 * @param {StaticType[]} list
 * @returns {StaticType}
 */
export function mergeTypes(list) {
    /** @type {Set<TypeName> | null} */
    let types = new Set();
    /** @type {Set<string> | null} */
    const interfaces = new Set();
    const apiPaths = new Set();
    let nan = false;
    let customElement = false;
    let fragment = false;
    for (const entry of list) {
        if (entry.types === null) types = null;
        else if (types) for (const name of entry.types) types.add(name);
        nan ||= entry.nan;
        customElement ||= entry.customElement === true;
        fragment ||= entry.fragment === true;
        for (const name of entry.interfaces ?? []) interfaces.add(name);
        for (const name of entry.apiPaths ?? []) apiPaths.add(name);
    }
    /** @type {StaticType} */
    const merged = {
        types: types
            ? [
                  ...types,
              ]
            : null,
        nan,
    };
    if (interfaces.size)
        merged.interfaces = [
            ...interfaces,
        ];
    if (customElement) merged.customElement = true;
    if (fragment) merged.fragment = true;
    if (apiPaths.size)
        merged.apiPaths = [
            ...apiPaths,
        ];
    const withStrings = list.filter((entry) => entry.types?.includes('string'));
    if (merged.types && withStrings.length && withStrings.every((entry) => entry.nonNumericStrings)) merged.nonNumericStrings = true;
    if (list.length && list.every((entry) => entry.list === 'selected')) merged.list = 'selected';
    else if (list.some((entry) => entry.list !== undefined)) merged.list = 'maybe';
    if (list.length && list.every((entry) => entry.leaf)) merged.leaf = true;
    return merged;
}

/**
 * @param {StaticType} type
 * @returns {StaticType} the type of one item of a selected list, or the type itself
 */
export function itemOf(type) {
    const item = { ...type };
    delete item.list;
    delete item.leaf;
    return item;
}

/**
 * The one item of a list, where an expression reads one value from it.
 *
 * @param {StaticType} type
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
export function oneItem(type, ctx, path) {
    const item = itemOf(type);
    if (item.apiPaths?.some((name) => name === 'performance.getEntries' || name.startsWith('performance.getEntries.'))) {
        fail(
            ctx,
            path,
            'performance.getEntries selects every entry, so it never gives one value; read its length through `using`, or use getEntriesByType or getEntriesByName',
        );
    }
    return item;
}

/**
 * @param {StaticType} type
 * @param {TypeName} name
 */
export function allows(type, name) {
    return type.types === null || type.types.includes(name);
}

/**
 * @param {StaticType} type
 */
export function describeType(type) {
    const item = type.types === null ? 'unknown' : type.types.join(' or ');
    return type.list === 'selected' ? `a list of ${item}` : item;
}

/**
 * Split at each top-level occurrence of a separator, outside (), <>, [] and quotes.
 *
 * @param {string} text
 * @param {(char: string) => boolean} isSeparator
 * @returns {string[]}
 */
function splitTopLevel(text, isSeparator) {
    const parts = [];
    let depth = 0;
    /** @type {string | null} */
    let quote = null;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '\\') {
            i++;
        } else if (quote) {
            if (char === quote) quote = null;
        } else if (char === '"' || char === "'") {
            quote = char;
        } else if ('([<'.includes(char)) {
            depth++;
        } else if (')]>'.includes(char) && depth > 0) {
            depth--;
        } else if (depth === 0 && isSeparator(char)) {
            parts.push(text.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(text.slice(start));
    return parts;
}

const NUMERIC_IDL_TYPES = [
    'byte',
    'octet',
    'short',
    'unsigned short',
    'long',
    'unsigned long',
    'long long',
    'unsigned long long',
    'float',
    'double',
    'unrestricted float',
    'unrestricted double',
];

const STRING_IDL_TYPES = [
    'DOMString',
    'USVString',
    'ByteString',
    'CSSOMString',
];

/** Interfaces outside the tables that give `StaticType.fragment`. Their properties are not checked. */
const FRAGMENT_INTERFACES = [
    'ShadowRoot',
    'DocumentFragment',
];

const ARRAY_IDL_GENERICS = [
    'sequence',
    'FrozenArray',
    'ObservableArray',
];

/**
 * The static type of a value of an IDL type, as the property tables write it.
 *
 * @param {string} idlType
 * @returns {StaticType}
 */
export function typeFromIdl(idlType) {
    let text = idlType.trim();
    const nullable = text.endsWith('?');
    if (nullable) text = text.slice(0, -1).trim();

    /** @type {StaticType} */
    let result;
    const generic = /^(\w+)<(.*)>$/.exec(text);
    if (text.startsWith('(') && text.endsWith(')')) {
        result = mergeTypes(
            text
                .slice(1, -1)
                .split(' or ')
                .map((member) => typeFromIdl(member)),
        );
    } else if (generic) {
        result = typeOf(ARRAY_IDL_GENERICS.includes(generic[1]) ? 'array' : 'object');
    } else if (NUMERIC_IDL_TYPES.includes(text)) {
        result = {
            types: [
                'number',
            ],
            nan: text.startsWith('unrestricted '),
        };
    } else if (STRING_IDL_TYPES.includes(text)) {
        result = typeOf('string');
    } else if (text === 'boolean' || text === 'undefined' || text === 'object') {
        result = typeOf(text);
    } else if (text === 'any') {
        result = UNKNOWN;
    } else if (PROPERTY_TABLES.interfaces[text]) {
        result = {
            types: [
                'object',
            ],
            nan: false,
            interfaces: [
                text,
            ],
        };
    } else if (FRAGMENT_INTERFACES.includes(text)) {
        result = { ...typeOf('object'), fragment: true };
    } else {
        // An interface outside the tables: its properties are not checked
        result = typeOf('object');
    }
    return nullable
        ? mergeTypes([
              result,
              typeOf('null'),
          ])
        : result;
}

/** @type {Map<string, Map<string, string>>} */
const interfacePropertyCache = new Map();

/**
 * Every attribute of an element interface, its ancestors' included, with its IDL type.
 *
 * @param {string} name
 * @returns {Map<string, string>}
 */
export function interfaceProperties(name) {
    let properties = interfacePropertyCache.get(name);
    if (properties) return properties;
    const entry = PROPERTY_TABLES.interfaces[name];
    properties = new Map(entry?.inherits ? interfaceProperties(entry.inherits) : []);
    for (const [
        property,
        type,
    ] of Object.entries(entry?.properties ?? {})) {
        properties.set(property, type);
    }
    interfacePropertyCache.set(name, properties);
    return properties;
}

/** Element interfaces by lower-case tag, across namespaces. `a` is both an HTML and an SVG element. */
const TAG_INTERFACES = new Map();
for (const tagTable of Object.values(PROPERTY_TABLES.tags)) {
    for (const [
        tag,
        name,
    ] of Object.entries(tagTable)) {
        const key = tag.toLowerCase();
        TAG_INTERFACES.set(key, [
            ...new Set([
                ...(TAG_INTERFACES.get(key) ?? []),
                name,
            ]),
        ]);
    }
}

/** Every interface an element can have. */
const ALL_ELEMENT_INTERFACES = Object.keys(PROPERTY_TABLES.interfaces).filter((name) => {
    for (let current = /** @type {string | null} */ (name); current; current = PROPERTY_TABLES.interfaces[current]?.inherits ?? null) {
        if (current === 'Element') return true;
    }
    return false;
});

/**
 * The tags a selector list can match, or null when one of its selectors names no tag.
 *
 * @param {string} selector
 * @returns {string[] | null}
 */
function selectorTags(selector) {
    const tags = [];
    for (const complex of splitTopLevel(selector, (char) => char === ',')) {
        const compounds = splitTopLevel(complex.trim(), (char) => /[\s>+~]/.test(char)).filter((part) => part !== '');
        const compound = compounds[compounds.length - 1] ?? '';
        const match = /^([a-zA-Z][a-zA-Z0-9-]*)(?!\|)/.exec(compound);
        if (!match) return null;
        tags.push(match[1].toLowerCase());
    }
    return tags;
}

/**
 * The element interfaces a selector's matches can have. A tag outside the tables is a custom or
 * unknown element, whose interface is HTMLElement.
 *
 * @param {unknown} selector - a selector or an array of them
 * @returns {string[]}
 */
export function selectorInterfaces(selector) {
    const names = new Set();
    for (const entry of asArray(selector)) {
        const tags = typeof entry === 'string' ? selectorTags(entry) : null;
        if (!tags) return ALL_ELEMENT_INTERFACES;
        for (const tag of tags) {
            for (const name of TAG_INTERFACES.get(tag) ?? [
                'HTMLElement',
            ])
                names.add(name);
        }
    }
    return [
        ...names,
    ];
}

/**
 * Whether a selector names a custom element, whose page-defined values are readable under names
 * outside the tables.
 *
 * @param {unknown} selector - a selector or an array of them
 */
export function selectorNamesCustomElement(selector) {
    return asArray(selector).some((entry) => typeof entry === 'string' && (selectorTags(entry) ?? []).some((tag) => tag.includes('-')));
}

/**
 * @param {string[]} interfaces
 */
export function describeInterfaces(interfaces) {
    return interfaces === ALL_ELEMENT_INTERFACES ? 'any element interface' : interfaces.join(' or ');
}
