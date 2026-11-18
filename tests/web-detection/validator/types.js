// @ts-check
import { ELEMENT_ALLOWLIST, TAG_INTERFACES } from './grammar.js';
import { asArray } from './walk.js';

/**
 * @typedef {'number' | 'string' | 'boolean' | 'null' | 'undefined' | 'array' | 'object' | 'function' | 'symbol' | 'bigint'} TypeName
 */

/**
 * What an expression's position expects, as C-S-S names it. `list` is the operand of `only`.
 * `spread` is an operand of `sum`, `mul`, `any`, `all` and `none` that gives a list, contributing
 * each item. `root` is the `root` of a source.
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
 *   list?: 'selected' | 'array' | 'maybe',
 *   leaf?: boolean,
 *   nonNumericStrings?: boolean,
 * }} StaticType
 *
 * `types` is null when config does not show the type. `nan` is set when the value can be NaN.
 * `interfaces` names the ELEMENT_ALLOWLIST interfaces whose names the value can read, and
 * `customElement` is set when it can also be a custom element, whose page-defined values have
 * names outside the list. `fragment` is set when the value can be a shadow root or other document fragment, which
 * browsers refuse as an XPath context node. `apiPaths` are the `api` names the value may have been
 * read through, one for each branch that reads a different one, which names read from it extend
 * for the allowlist.
 *
 * `list` marks a list, and the other keys then describe its items. `selected` is what `element`,
 * `text` and `api` with `where` give, which holds as a condition when it has an item and gives its
 * one item in number position. `array` is what `expr` over an array gives, an array value, which
 * fills neither position. `maybe` is a value that is a list on some pages or branches only: an
 * `api` with `field`, or an `if` with one list branch.
 *
 * `leaf` marks the selected list of `element` without `field` or `text`, the condition leaf, which
 * in boolean position holds when it has an item.
 *
 * `nonNumericStrings` is set when every string the value can be is a literal that converts to
 * NaN, such as `"unsupported"`, so a comparison on it is false.
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
    const kind = list[0]?.list;
    if (kind !== undefined && list.every((entry) => entry.list === kind)) merged.list = kind;
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
 * Whether the value is always a list, which `at`, an index and `length` read.
 *
 * @param {StaticType} type
 */
export function isList(type) {
    return type.list === 'selected' || type.list === 'array';
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
    if (type.list === 'selected') return `a list of ${item}`;
    if (type.list === 'array') return `an array of ${item}`;
    return item;
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

/**
 * The static type of a value ELEMENT_ALLOWLIST types as `spec`.
 *
 * @param {import('./grammar.js').TypeSpec} spec
 * @returns {StaticType}
 */
export function typeFromSpec(spec) {
    return mergeTypes(
        spec.split('|').map((part) => {
            if (part === 'nan') return { types: [], nan: true };
            if (part === 'fragment') return { ...typeOf('object'), fragment: true };
            if (Object.hasOwn(ELEMENT_ALLOWLIST, part))
                return {
                    ...typeOf('object'),
                    interfaces: [
                        part,
                    ],
                };
            return typeOf(/** @type {TypeName} */ (part));
        }),
    );
}

/**
 * The entry of each interface that lists a name.
 *
 * @param {string[]} interfaces
 * @param {string} name
 * @returns {import('./grammar.js').ElementMember[]}
 */
export function allowlistEntries(interfaces, name) {
    return interfaces.flatMap((iface) => {
        const members = ELEMENT_ALLOWLIST[iface];
        return members && Object.hasOwn(members, name)
            ? [
                  members[name],
              ]
            : [];
    });
}

/** Interfaces whose names every element reads, whatever its tag. */
const ELEMENT_BASE_INTERFACES = [
    'HTMLElement',
    'Element',
];

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
 * The ELEMENT_ALLOWLIST interfaces a selector's matches read names from: those TAG_INTERFACES gives
 * each tag it can match, and the interfaces every element has.
 *
 * @param {unknown} selector - a selector or an array of them
 * @returns {string[]}
 */
export function selectorInterfaces(selector) {
    const names = new Set();
    for (const entry of asArray(selector)) {
        for (const tag of (typeof entry === 'string' ? selectorTags(entry) : null) ?? []) {
            for (const name of TAG_INTERFACES[tag] ?? []) names.add(name);
        }
    }
    return [
        ...names,
        ...ELEMENT_BASE_INTERFACES,
    ];
}

/**
 * Whether a selector names a custom element, whose page-defined values are readable under names
 * outside ELEMENT_ALLOWLIST.
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
    return interfaces.join(' or ');
}
