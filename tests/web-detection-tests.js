import { expect } from 'chai';
import fs from 'fs';
import { immutableJSONPatch } from 'immutable-json-patch';
import xpath from 'xpath';
import platforms from '../platforms.js';
import { buildTables } from '../scripts/generate-element-property-tables.mjs';

/** Combinators in match, in predicates, and in the legacy blocks over `text` and `element` bodies. */
const OPERATOR_KEYS = [
    'any',
    'all',
    'none',
];

/** `as` names, payload keys, and group and detector names. */
const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

const SOURCE_KEYS = [
    'element',
    'text',
    'api',
];

const EXPRESSION_KEYS = [
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

/** In the order they apply: `using` binds `self` to the expression's value, `as` names the result and `is` tests it. */
const MODIFIER_KEYS = [
    'using',
    'as',
    'is',
];

const BODY_KEYS = {
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

const VISIBILITY_VALUES = [
    'visible',
    'hidden',
    'any',
    'content',
];

const FIELD_KEYS = [
    'path',
    'args',
    'feature',
];

/** Each feature and the input it takes. */
const FEATURE_INPUTS = {
    wordCount: 'string',
    renderedTextLength: 'element',
};

const TYPE_NAMES = [
    'number',
    'string',
    'boolean',
    'null',
    'undefined',
    'array',
    'object',
];

const COMPARISON_OPERATORS = [
    'lt',
    'lte',
    'gt',
    'gte',
];

/** Operator names at value level. At item level they are property paths. */
const VALUE_OPERATORS = [
    'eq',
    ...COMPARISON_OPERATORS,
    'fails',
    'exists',
    'type',
];

const PAYLOAD_ACTIONS = [
    'fireEvent',
    'breakageReportData',
];

const PAYLOAD_FIELD_KEYS = [
    'value',
    'when',
    'buckets',
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
const API_ALLOWLIST = {
    Math: 'property',
    'Math.max': 'method',
    'Math.max.apply': 'method',
    'Math.min': 'method',
    'Math.min.apply': 'method',
    Number: 'property',
    'Number.isFinite': 'method',
    'Number.isNaN': 'method',
    Reflect: 'property',
    'Reflect.has': 'method',
    document: 'property',
    'document.fonts': 'property',
    'document.fonts.status': 'property',
    'document.hidden': 'property',
    'document.readyState': 'property',
    'document.title': 'property',
    'document.title.length': 'property',
    matchMedia: 'method',
    'matchMedia.matches': 'property',
    performance: 'property',
    'performance.getEntries': 'method',
    'performance.getEntriesByName': 'method',
    'performance.getEntriesByName.startTime': 'property',
    'performance.getEntriesByType': 'method',
    'performance.getEntriesByType.decodedBodySize': 'property',
    'performance.getEntriesByType.duration': 'property',
    'performance.getEntriesByType.initiatorType': 'property',
    'performance.getEntriesByType.loadEventEnd': 'property',
    'performance.getEntriesByType.responseEnd': 'property',
    'performance.getEntriesByType.responseStatus': 'property',
    'performance.getEntriesByType.type': 'property',
    'performance.now': 'method',
};

/**
 * The type each JS builtin on API_ALLOWLIST returns. The tables from WebIDL do not cover them.
 *
 * @type {Record<string, TypeName>}
 */
const BUILTIN_RETURN_TYPES = {
    'Math.max': 'number',
    'Math.max.apply': 'number',
    'Math.min': 'number',
    'Math.min.apply': 'number',
    'Number.isFinite': 'boolean',
    'Number.isNaN': 'boolean',
    'Reflect.has': 'boolean',
};

/** Names that read the method before them as a function. */
const FUNCTION_READS = [
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
function apiBody(raw) {
    return typeof raw === 'string' ? { path: raw } : raw;
}

/**
 * Methods a `field` may call on `element` items, with the IDL type each returns. Each leaves the
 * page unchanged: it fires no event and changes no focus, DOM or state. WebIDL does not mark
 * side effects, so this list is kept by hand.
 */
const ELEMENT_METHOD_ALLOWLIST = {
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
const PROPERTY_TABLES = /** @type {PropertyTables} */ (
    JSON.parse(fs.readFileSync(new URL('./data/element-property-tables.json', import.meta.url), 'utf8'))
);

/** Floor for a non-zero chunkSize. Smaller chunks multiply regex tests for little gain. */
const MIN_CHUNK_SIZE = 1024;

/**
 * Upper bound on chunkTail as a fraction of chunkSize. A tail is re-scanned by the
 * following test, so this caps the scanning overhead a config can impose at 1.25x.
 */
const MAX_TAIL_RATIO = 4;

/**
 * Assert an `xpathConfig` block holds sensible values.
 *
 * Clients use these values as configured, so this is the only place they are
 * checked - a bad value fails the build here naming the detector.
 *
 * The chunkSize/chunkTail ratio is only checked when both are present in the same
 * block. Judging a lone chunkTail would mean hardcoding the client's default
 * chunkSize here, which would silently go stale if that default ever changed.
 *
 * @param {Record<string, unknown>} xpathConfig
 * @param {string} path - used in error messages
 */
function assertXPathConfig(xpathConfig, path) {
    const { chunkSize, chunkTail } = xpathConfig;

    for (const [
        key,
        value,
    ] of Object.entries({ chunkSize, chunkTail })) {
        if (value === undefined) continue;
        expect(
            Number.isInteger(value) && Number(value) >= 0,
            `${path}/${key}: expected a non-negative integer, got ${JSON.stringify(value)}`,
        ).to.equal(true);
    }

    if (chunkSize !== undefined) {
        expect(
            chunkSize === 0 || Number(chunkSize) >= MIN_CHUNK_SIZE,
            `${path}/chunkSize: expected 0 (chunking disabled) or at least ${MIN_CHUNK_SIZE}, got ${chunkSize}`,
        ).to.equal(true);
    }

    // A chunkSize of 0 disables chunking, leaving the tail unused
    if (chunkTail === undefined || chunkSize === undefined || chunkSize === 0) return;
    const maxTail = Number(chunkSize) / MAX_TAIL_RATIO;
    expect(
        Number(chunkTail) <= maxTail,
        `${path}/chunkTail: expected at most chunkSize / ${MAX_TAIL_RATIO} (${maxTail}), got ${chunkTail}`,
    ).to.equal(true);
}

/**
 * Assert an XPath expression parses under the XPath 1.0 grammar.
 *
 * Only the grammar is checked. An expression that parses may still select nothing on
 * a real page, and browser engines may disagree at the edges of the spec.
 *
 * @param {unknown} expression
 * @param {string} path - used in error messages
 */
function assertValidXPath(expression, path) {
    expect(typeof expression, `${path}: expected a string, got ${JSON.stringify(expression)}`).to.equal('string');
    try {
        xpath.parse(/** @type {string} */ (expression));
    } catch (error) {
        expect.fail(`${path}: ${JSON.stringify(expression)} is not a valid XPath expression - ${error.message}`);
    }
}

/**
 * Compile a pattern source, throwing on a syntax error.
 *
 * @param {string} source
 * @returns {RegExp}
 */
function compilePattern(source) {
    return new RegExp(source, 'i');
}

/**
 * Assert every entry of a `pattern` value is a regular expression in its own right.
 *
 * Syntax is all that is checked, and only against this Node version.
 *
 * @param {unknown} pattern - a single pattern or an array of them
 * @param {string} path - used in error messages
 */
function assertValidPattern(pattern, path) {
    const patterns = Array.isArray(pattern)
        ? pattern
        : [
              pattern,
          ];
    for (const [
        index,
        entry,
    ] of patterns.entries()) {
        expect(typeof entry, `${path}[${index}]: expected a string, got ${JSON.stringify(entry)}`).to.equal('string');
        try {
            compilePattern(entry);
        } catch (error) {
            expect.fail(`${path}[${index}]: ${JSON.stringify(entry)} is not a valid regular expression - ${error.message}`);
        }
    }
}

/**
 * Assert the expressions of a single `text` leaf condition.
 *
 * @param {Record<string, any>} condition
 * @param {string} path - used in error messages
 */
function assertTextConditionExpressions(condition, path) {
    if (condition.pattern !== undefined) {
        assertValidPattern(condition.pattern, `${path}/pattern`);
    }
    const expressions = Array.isArray(condition.xpath)
        ? condition.xpath
        : [
              condition.xpath,
          ];
    for (const [
        index,
        expression,
    ] of expressions.entries()) {
        if (expression === undefined) continue;
        assertValidXPath(expression, `${path}/xpath[${index}]`);
    }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @template T
 * @param {T | T[]} value
 * @returns {T[]}
 */
function asArray(value) {
    return Array.isArray(value)
        ? value
        : [
              value,
          ];
}

/**
 * Invoke `cb` for every body of a `text` or `element` source, descending through arrays and
 * the legacy `{any|all|none}` blocks.
 *
 * @param {unknown} node
 * @param {string} path
 * @param {(condition: Record<string, any>, path: string) => void} cb
 */
function forEachTextLeaf(node, path, cb) {
    if (Array.isArray(node)) {
        node.forEach((n, i) => forEachTextLeaf(n, `${path}[${i}]`, cb));
        return;
    }
    if (node === null || typeof node !== 'object') return;

    const opKeys = OPERATOR_KEYS.filter((k) => k in node);
    if (opKeys.length > 0) {
        for (const op of opKeys) {
            forEachTextLeaf(node[op], `${path}.${op}`, cb);
        }
        return;
    }
    cb(node, path);
}

/**
 * Invoke `cb` for every source in an expression, wherever it sits: under operators, in `if`
 * branches, in the operands of predicates, and in source roots.
 *
 * @param {unknown} node
 * @param {string} path
 * @param {(key: string, body: unknown, path: string) => void} cb
 */
function forEachSource(node, path, cb) {
    if (Array.isArray(node)) {
        node.forEach((n, i) => forEachSource(n, `${path}[${i}]`, cb));
        return;
    }
    if (!isPlainObject(node)) return;

    for (const [
        key,
        value,
    ] of Object.entries(node)) {
        const childPath = `${path}.${key}`;
        if (SOURCE_KEYS.includes(key)) {
            cb(key, value, childPath);
            const bodies =
                key === 'api'
                    ? [
                          { body: value, path: childPath },
                      ]
                    : [];
            if (key !== 'api') forEachTextLeaf(value, childPath, (body, bodyPath) => bodies.push({ body, path: bodyPath }));
            for (const { body, path: bodyPath } of bodies) {
                if (!isPlainObject(body)) continue;
                if ('where' in body) forEachPredicateSource(body.where, 'item', `${bodyPath}.where`, cb);
                if ('root' in body) forEachSource(body.root, `${bodyPath}.root`, cb);
                if ('field' in body) forEachFieldSource(body.field, `${bodyPath}.field`, cb);
            }
        } else if (key === 'using' || key === 'self') {
            if (isPlainObject(value) && expressionKeysOf(value).length) {
                forEachSource(value, childPath, cb);
            } else if (isPlainObject(value)) {
                if ('where' in value) forEachPredicateSource(value.where, 'item', `${childPath}.where`, cb);
                if ('field' in value) forEachFieldSource(value.field, `${childPath}.field`, cb);
            }
        } else if (key === 'if') {
            if (!isPlainObject(value)) continue;
            for (const branch of [
                'test',
                'then',
                'else',
            ]) {
                forEachSource(value[branch], `${childPath}.${branch}`, cb);
            }
        } else if (key === 'is') {
            forEachPredicateSource(value, 'value', childPath, cb);
        } else if (EXPRESSION_KEYS.includes(key) && key !== 'ref') {
            forEachSource(value, childPath, cb);
        }
    }
}

/**
 * Invoke `cb` for every source in the operands of a predicate.
 *
 * @param {unknown} predicate
 * @param {'item' | 'value'} level
 * @param {string} path
 * @param {(key: string, body: unknown, path: string) => void} cb
 */
function forEachPredicateSource(predicate, level, path, cb) {
    if (Array.isArray(predicate)) {
        predicate.forEach((p, i) => forEachPredicateSource(p, level, `${path}[${i}]`, cb));
        return;
    }
    if (!isPlainObject(predicate)) return;

    for (const [
        key,
        value,
    ] of Object.entries(predicate)) {
        const childPath = `${path}.${key}`;
        if (OPERATOR_KEYS.includes(key)) {
            forEachPredicateSource(value, level, childPath, cb);
        } else if (key === 'is') {
            forEachPredicateSource(value, 'value', childPath, cb);
        } else if (key === 'field') {
            forEachFieldSource(value, childPath, cb);
        } else if (level === 'value' && VALUE_OPERATORS.includes(key)) {
            if (key === 'eq' || COMPARISON_OPERATORS.includes(key)) forEachSource(value, childPath, cb);
        } else {
            forEachPredicateSource(value, 'value', childPath, cb);
        }
    }
}

/**
 * Invoke `cb` for every source in a `field` given as an expression.
 *
 * @param {unknown} field
 * @param {string} path
 * @param {(key: string, body: unknown, path: string) => void} cb
 */
function forEachFieldSource(field, path, cb) {
    if (isPlainObject(field) && expressionKeysOf(field).length) forEachSource(field, path, cb);
}

/**
 * Invoke `cb` for every source in a detector's match tree and payloads.
 *
 * @param {Record<string, any>} detector
 * @param {string} path
 * @param {(key: string, body: unknown, path: string) => void} cb
 */
function forEachDetectorSource(detector, path, cb) {
    forEachSource(detector.match, `${path}.match`, cb);
    for (const action of PAYLOAD_ACTIONS) {
        const data = detector.actions?.[action]?.data;
        if (!isPlainObject(data)) continue;
        for (const [
            key,
            field,
        ] of Object.entries(data)) {
            if (!isPlainObject(field)) continue;
            const fieldPath = `${path}.actions.${action}.data.${key}`;
            forEachSource(field.value, `${fieldPath}.value`, cb);
            forEachPredicateSource(field.when, 'value', `${fieldPath}.when`, cb);
            if (!isPlainObject(field.buckets)) continue;
            for (const [
                name,
                bucket,
            ] of Object.entries(field.buckets)) {
                forEachPredicateSource(bucket, 'value', `${fieldPath}.buckets.${name}`, cb);
            }
        }
    }
}

/**
 * Invoke `cb` for every `text` body reachable from an expression, in any placement.
 *
 * @param {unknown} node
 * @param {string} path
 * @param {(condition: Record<string, any>, path: string) => void} cb
 */
function forEachTextCondition(node, path, cb) {
    forEachSource(node, path, (key, body, sourcePath) => {
        if (key === 'text') forEachTextLeaf(body, sourcePath, cb);
    });
}

/**
 * Invoke `cb` for every `text` body in a detector's match tree and payloads.
 *
 * @param {Record<string, any>} detector
 * @param {string} path
 * @param {(condition: Record<string, any>, path: string) => void} cb
 */
function forEachDetectorTextCondition(detector, path, cb) {
    forEachDetectorSource(detector, path, (key, body, sourcePath) => {
        if (key === 'text') forEachTextLeaf(body, sourcePath, cb);
    });
}

/** Patch paths that land on an `xpathConfig` block or one of its values. */
const XPATH_CONFIG_PATCH_PATH = /\/xpathConfig(?:\/(chunkSize|chunkTail))?$/;

/**
 * Validate a patch operation targeting `xpathConfig`.
 *
 * Patches are applied client-side, so a value set only by a patch never appears as a
 * literal in the generated config and would otherwise go unchecked.
 *
 * @param {Record<string, any>} operation
 * @param {string} path
 */
function assertXPathConfigPatch(operation, path) {
    const match = XPATH_CONFIG_PATCH_PATH.exec(operation.path ?? '');
    if (!match || operation.op === 'remove') return;

    const key = match[1];
    if (key === undefined) {
        expect(
            operation.value !== null && typeof operation.value === 'object' && !Array.isArray(operation.value),
            `${path}: patch of ${operation.path} expected an object value, got ${JSON.stringify(operation.value)}`,
        ).to.equal(true);
        assertXPathConfig(operation.value, `${path} ${operation.path}`);
        return;
    }

    // Only one value is being set, so it is checked in isolation
    assertXPathConfig({ [key]: operation.value }, `${path} ${operation.path}`);
}

/** Patch paths that land on an `xpath` value, or on one entry of an `xpath` array. */
const XPATH_PATCH_PATH = /\/xpath(?:\/\d+)?$/;

/** Patch paths that land on a `pattern` value, or on one entry of a `pattern` array. */
const PATTERN_PATCH_PATH = /\/pattern(?:\/\d+)?$/;

/**
 * Validate a patch operation targeting an `xpath` or `pattern` value.
 *
 * Patches are applied client-side, so a value set only by a patch never appears as a
 * literal in the generated config and would otherwise go unchecked.
 *
 * @param {Record<string, any>} operation
 * @param {string} path - used in error messages
 */
function assertExpressionPatch(operation, path) {
    const operationPath = operation.path ?? '';
    if (operation.op === 'remove') return;

    if (XPATH_PATCH_PATH.test(operationPath)) {
        const values = Array.isArray(operation.value)
            ? operation.value
            : [
                  operation.value,
              ];
        for (const [
            index,
            expression,
        ] of values.entries()) {
            assertValidXPath(expression, `${path} ${operationPath}[${index}]`);
        }
    }

    if (PATTERN_PATCH_PATH.test(operationPath)) {
        assertValidPattern(operation.value, `${path} ${operationPath}`);
    }
}

const platformOutput = platforms.map((item) => item.replace('browsers/', 'extension-'));

const latestConfigs = platformOutput.map((plat) => {
    return {
        name: `v5/${plat}-config.json`,
        body: JSON.parse(fs.readFileSync(`./generated/v5/${plat}-config.json`)),
    };
});

/**
 * Invoke `cb` for every patch operation the feature can apply, from either the
 * per-domain or the conditional lists.
 *
 * @param {import('../schema/features/web-detection').WebDetectionFeature<number>} webDetection
 * @param {(operation: Record<string, any>, path: string) => void} cb
 */
function forEachPatchOperation(webDetection, cb) {
    const settings = /** @type {Record<string, any>} */ (webDetection.settings);
    for (const [
        index,
        entry,
    ] of (settings.domains ?? []).entries()) {
        for (const operation of entry.patchSettings ?? []) {
            cb(operation, `domains[${index}] (${entry.domain})`);
        }
    }
    for (const [
        index,
        entry,
    ] of (settings.conditionalChanges ?? []).entries()) {
        for (const operation of entry.patchSettings ?? []) {
            cb(operation, `conditionalChanges[${index}]`);
        }
    }
}

/**
 * Iterate every generated config that has a webDetection feature with detectors.
 *
 * @param {(ctx: {
 *   configName: string,
 *   webDetection: import('../schema/features/web-detection').WebDetectionFeature<number>,
 *   detectors: NonNullable<import('../schema/features/web-detection').WebDetectionSettings['detectors']>,
 * }) => void} cb
 */
function forEachWebDetectionConfig(cb) {
    for (const config of latestConfigs) {
        const webDetection = /** @type {import('../schema/features/web-detection').WebDetectionFeature<number> | undefined} */ (
            config.body.features?.webDetection
        );
        if (!webDetection?.settings?.detectors) continue;
        cb({ configName: config.name, webDetection, detectors: webDetection.settings.detectors });
    }
}

/**
 * @typedef {'number' | 'string' | 'boolean' | 'null' | 'undefined' | 'array' | 'object'} TypeName
 */

/**
 * What an expression's position expects, as C-S-S names it. `list` is the operand of `only`.
 * `spread` is an operand of `sum`, `mul`, `any`, `all` and `none` that gives a list, contributing
 * each item. `root` is the `root` of a source, and the expression beside `using`.
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
 *   apiPaths?: string[],
 *   list?: 'selected' | 'maybe',
 * }} StaticType
 *
 * `types` is null when config does not show the type. `nan` is set when the value can be NaN.
 * `interfaces` names the element interfaces an element value can have, and `customElement` is
 * set when it can also be a custom element, whose page-defined values have names outside the
 * tables. `apiPaths` are the `api` names the value may have been read through, one for each
 * branch that reads a different one, which names read from it extend for the allowlist.
 *
 * `list` marks a selected list, and the other keys then describe its items. `selected` is what
 * `element`, `text` and `api` with `where` give. `maybe` is a value that is a selected list on
 * some pages or branches only: an `api` with `field`, or an `if` with one list branch.
 */

/** @type {StaticType} */
const UNKNOWN = { types: null, nan: false };

/**
 * @param {TypeName} name
 * @returns {StaticType}
 */
function typeOf(name) {
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
function mergeTypes(list) {
    /** @type {Set<TypeName> | null} */
    let types = new Set();
    /** @type {Set<string> | null} */
    const interfaces = new Set();
    const apiPaths = new Set();
    let nan = false;
    let customElement = false;
    for (const entry of list) {
        if (entry.types === null) types = null;
        else if (types) for (const name of entry.types) types.add(name);
        nan ||= entry.nan;
        customElement ||= entry.customElement === true;
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
    if (apiPaths.size)
        merged.apiPaths = [
            ...apiPaths,
        ];
    if (list.length && list.every((entry) => entry.list === 'selected')) merged.list = 'selected';
    else if (list.some((entry) => entry.list !== undefined)) merged.list = 'maybe';
    return merged;
}

/**
 * @param {StaticType} type
 * @returns {StaticType} the type of one item of a selected list, or the type itself
 */
function itemOf(type) {
    const item = { ...type };
    delete item.list;
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
function oneItem(type, ctx, path) {
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
function allows(type, name) {
    return type.types === null || type.types.includes(name);
}

/**
 * @param {StaticType} type
 */
function describeType(type) {
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
function typeFromIdl(idlType) {
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
function interfaceProperties(name) {
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
function selectorInterfaces(selector) {
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
function selectorNamesCustomElement(selector) {
    return asArray(selector).some((entry) => typeof entry === 'string' && (selectorTags(entry) ?? []).some((tag) => tag.includes('-')));
}

/**
 * @param {string[]} interfaces
 */
function describeInterfaces(interfaces) {
    return interfaces === ALL_ELEMENT_INTERFACES ? 'any element interface' : interfaces.join(' or ');
}

/**
 * @typedef {{
 *   inMatch: boolean,
 *   underNone: boolean,
 *   branch: string[],
 *   topOperand: number | null,
 *   matchRoot: boolean,
 *   owners: string[],
 *   bound?: StaticType,
 *   perItem?: boolean,
 *   perItemBranch?: boolean,
 * }} Scope
 *
 * `branch` lists the `if` branches around the expression. `topOperand` is the index of the
 * operand of match's top-level `all` holding it. `owners` lists the `as` names around it.
 * `bound` is the type `self` reads, set inside `using`, `where` and `field`. `perItem` is set where
 * `self` reads a value per item: inside `where` and `field`, and inside a `using` beside an
 * expression that reads such a `self`. `perItemBranch` is set inside the branches of an `if` that
 * reads one.
 */

/**
 * @typedef {{
 *   mode: 'collect' | 'check' | 'dry',
 *   errors: string[],
 *   functionApis: WeakSet<object>,
 *   structuralErrors: string[],
 *   names: Map<string, { node: Record<string, any>, path: string, branch: string[] }>,
 *   dependencies: Map<string, Set<string>>,
 *   refs: { name: string, path: string, branch: string[], inMatch: boolean }[],
 *   rooted: { root: unknown, path: string, needsGuard: boolean, inMatch: boolean, topOperand: number | null, owner: string | undefined }[],
 *   refMemo: Map<string, { errors: string[], type: StaticType }>,
 *   refFailures: { name: string, position: Position, path: string, errors: string[] }[],
 *   resolving: Set<string>,
 * }} Context
 *
 * `functionApis` holds the expressions whose `api` may read a method as a function: `args`
 * entries.
 *
 * A detector is walked twice. `collect` indexes the `as` names and the refs between them, and
 * `check` reports every error. `dry` checks a ref's target in the ref's position, reporting into
 * a scratch list.
 */

/** @type {Scope} */
const MATCH_SCOPE = { inMatch: true, underNone: false, branch: [], topOperand: null, matchRoot: true, owners: [] };

/** @type {Scope} */
const PAYLOAD_SCOPE = { inMatch: false, underNone: false, branch: [], topOperand: null, matchRoot: false, owners: [] };

/**
 * @param {Context} ctx
 * @param {string} path
 * @param {string} message
 */
function fail(ctx, path, message) {
    ctx.errors.push(`${path}: ${message}`);
}

/**
 * @param {Scope} scope
 * @returns {Scope}
 */
function child(scope) {
    return scope.matchRoot ? { ...scope, matchRoot: false } : scope;
}

/**
 * @param {Context} ctx
 * @param {string} path
 * @param {string} what
 * @param {Position} position
 * @param {Position[]} fills
 */
function expectPosition(ctx, path, what, position, fills) {
    if (!fills.includes(position)) {
        fail(ctx, path, `${what} fills ${fills.join(', ')} position, not ${position} position`);
    }
}

/**
 * @param {Record<string, any>} node
 * @returns {string[]}
 */
function expressionKeysOf(node) {
    return Object.keys(node).filter((key) => EXPRESSION_KEYS.includes(key));
}

/**
 * The expression an `as` names: its value, without the `is` test.
 *
 * @param {Record<string, any>} node
 * @returns {Record<string, any>}
 */
function valueNode(node) {
    return Object.fromEntries(
        Object.entries(node).filter(
            ([
                key,
            ]) => key !== 'as' && key !== 'is',
        ),
    );
}

/**
 * Whether an expression reads a `self` it does not bind itself: one outside every `using`, `where`
 * and `field` inside the expression.
 *
 * @param {unknown} node
 * @returns {boolean}
 */
function readsOuterSelf(node) {
    if (Array.isArray(node)) return node.some(readsOuterSelf);
    if (!isPlainObject(node)) return false;
    return Object.entries(node).some(
        ([
            key,
            value,
        ]) => {
            switch (key) {
                case 'self':
                    return true;
                case 'is':
                    return predicateReadsOuterSelf(value, 'value');
                case 'api': {
                    const body = apiBody(value);
                    return isPlainObject(body) && 'args' in body && readsOuterSelf(body.args);
                }
                case 'element':
                case 'text': {
                    let reads = false;
                    forEachTextLeaf(value, '', (leaf) => {
                        reads ||= 'root' in leaf && readsOuterSelf(leaf.root);
                    });
                    return reads;
                }
                case 'if':
                    return (
                        isPlainObject(value) &&
                        [
                            'test',
                            'then',
                            'else',
                        ].some((branch) => readsOuterSelf(value[branch]))
                    );
                case 'ref':
                    return false;
                default:
                    return EXPRESSION_KEYS.includes(key) && readsOuterSelf(value);
            }
        },
    );
}

/**
 * Whether the operands of a predicate read a `self` the predicate does not bind.
 *
 * @param {unknown} predicate
 * @param {'item' | 'value'} level
 * @returns {boolean}
 */
function predicateReadsOuterSelf(predicate, level) {
    if (Array.isArray(predicate)) return predicate.some((entry) => predicateReadsOuterSelf(entry, level));
    if (!isPlainObject(predicate)) return false;
    return Object.entries(predicate).some(
        ([
            key,
            value,
        ]) => {
            if (OPERATOR_KEYS.includes(key)) return predicateReadsOuterSelf(value, level);
            if (key === 'field') return false;
            if (key === 'is') return predicateReadsOuterSelf(value, 'value');
            if (level === 'value' && (key === 'eq' || COMPARISON_OPERATORS.includes(key))) return readsOuterSelf(value);
            if (level === 'value' && VALUE_OPERATORS.includes(key)) return false;
            return predicateReadsOuterSelf(value, 'value');
        },
    );
}

/**
 * The scope inside a `where` or `field`, where `self` reads each item or value of the given type.
 *
 * @param {Scope} scope
 * @param {StaticType} type
 * @returns {Scope}
 */
function bindItem(scope, type) {
    return { ...child(scope), bound: type, perItem: true };
}

/**
 * Whether an operand of `any`, `all`, `none`, `sum` or `mul` is in spread position,
 * contributing each item of a list: a source, or a ref or `expr` over one. Under `any`, `all` and `none`,
 * `element` without `field` and `text` are presence leaves, booleans.
 *
 * @param {unknown} node
 * @param {'number' | 'boolean'} single - the position of an operand that is not spread
 * @param {Context} ctx
 * @param {Set<string>} [seen]
 * @returns {boolean}
 */
function providesValues(node, single, ctx, seen = new Set()) {
    if (!isPlainObject(node) || 'is' in node) return false;
    // `using` reads one value from the expression beside it
    if ('using' in node) return false;
    const keys = expressionKeysOf(node);
    if (keys.length !== 1) return false;
    const body = node[keys[0]];
    switch (keys[0]) {
        case 'api':
            return true;
        case 'text':
            return single === 'number';
        case 'element': {
            let hasField = false;
            forEachTextLeaf(body, '', (leaf) => {
                hasField ||= 'field' in leaf;
            });
            return hasField || single === 'number';
        }
        case 'expr':
            return providesValues(body, single, ctx, seen);
        case 'ref': {
            const target = typeof body === 'string' && !seen.has(body) ? ctx.names.get(body) : undefined;
            return target
                ? providesValues(
                      valueNode(target.node),
                      single,
                      ctx,
                      new Set([
                          ...seen,
                          body,
                      ]),
                  )
                : false;
        }
        default:
            return false;
    }
}

/**
 * Whether a predicate compares the value: a literal, `eq`, `lt`, `lte`, `gt` or `gte` at its top
 * level or in its `any`, `all`, `none` or array entries. A selected list under such a predicate
 * gives its one item, and under any other the list, as an array. Mirrors `scalar` in C-S-S
 * predicates.js.
 *
 * @param {unknown} predicate
 * @returns {boolean}
 */
function isScalarPredicate(predicate) {
    if (isLiteral(predicate)) return true;
    if (Array.isArray(predicate)) return predicate.some(isScalarPredicate);
    if (!isPlainObject(predicate)) return false;
    return Object.keys(predicate).some(
        (key) =>
            key === 'eq' ||
            COMPARISON_OPERATORS.includes(key) ||
            (OPERATOR_KEYS.includes(key) && asArray(predicate[key]).some(isScalarPredicate)),
    );
}

/**
 * What a predicate under `is`, `when` or a bucket tests, for a value of the given type.
 *
 * @param {StaticType} type
 * @param {unknown} predicate
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
function predicateSubject(type, predicate, ctx, path) {
    return type.list && isScalarPredicate(predicate) ? oneItem(type, ctx, path) : type;
}

/**
 * Check an expression fills a position, and return what config shows about its value.
 *
 * @param {unknown} node
 * @param {Position} position
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
function checkExpr(node, position, scope, ctx, path) {
    if (typeof node === 'number') {
        expectPosition(ctx, path, 'A number', position, [
            'value',
            'number',
        ]);
        return typeOf('number');
    }
    if (typeof node === 'boolean') {
        expectPosition(ctx, path, 'A boolean', position, [
            'boolean',
            'value',
        ]);
        return typeOf('boolean');
    }
    if (typeof node === 'string' || node === null) {
        // In `root`, a string is a selector and `null` no node
        expectPosition(ctx, path, typeof node === 'string' ? 'A string' : '`null`', position, [
            'value',
            'root',
        ]);
        return typeOf(node === null ? 'null' : 'string');
    }
    if (Array.isArray(node)) {
        expectPosition(ctx, path, 'An array, the OR of its entries,', position, [
            'boolean',
            'value',
        ]);
        node.forEach((entry, index) => checkExpr(entry, 'boolean', child(scope), ctx, `${path}[${index}]`));
        return typeOf('boolean');
    }
    if (!isPlainObject(node)) {
        fail(ctx, path, `${JSON.stringify(node)} is not an expression`);
        return UNKNOWN;
    }

    const keys = Object.keys(node);
    for (const key of keys) {
        if (!EXPRESSION_KEYS.includes(key) && !MODIFIER_KEYS.includes(key)) fail(ctx, path, `unknown expression key "${key}"`);
    }
    const exprKeys = expressionKeysOf(node);
    const hasUsing = 'using' in node;
    if (exprKeys.length === 0) {
        fail(
            ctx,
            path,
            hasUsing
                ? '`using` reads from an expression, and this object has no expression key'
                : 'an object expression needs an expression key',
        );
        return UNKNOWN;
    }
    const hasIs = 'is' in node;
    if (hasIs && position !== 'boolean')
        fail(ctx, path, `\`is\` gives a boolean, so it sits in boolean position, not ${position} position`);
    if (exprKeys.length > 1 && !hasUsing && (hasIs || (position !== 'boolean' && position !== 'value'))) {
        fail(
            ctx,
            path,
            `several expression keys [${exprKeys.join(', ')}] are an AND, which fills boolean and value position and is never beside \`is\``,
        );
    }

    let owners = scope.owners;
    if ('as' in node) {
        const name = node.as;
        if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
            fail(ctx, path, `\`as\` ${JSON.stringify(name)} does not match ${NAME_PATTERN}`);
        } else {
            owners = [
                ...owners,
                name,
            ];
            if (ctx.mode === 'collect') {
                const existing = ctx.names.get(name);
                if (existing) ctx.structuralErrors.push(`${path}: \`as\` "${name}" is already used at ${existing.path}`);
                else ctx.names.set(name, { node, path, branch: scope.branch });
            }
        }
    }

    if ('as' in node) {
        const named = Object.fromEntries(
            Object.entries(node).filter(
                ([
                    key,
                ]) => key !== 'as',
            ),
        );
        if (scope.perItemBranch || (scope.perItem && readsOuterSelf(named)))
            fail(ctx, path, '`as` names one value per run, and this expression reads `self` per item');
    }

    const inner = { ...scope, owners };
    // With `is`, the expression computes a value for the predicate
    const valuePosition = hasIs ? 'value' : position;
    // With `using`, the expression keys give the value `using` reads from
    const keyPosition = exprKeys.length > 1 ? 'boolean' : hasUsing ? 'root' : valuePosition;
    /** @type {StaticType} */
    let type;
    if (exprKeys.length > 1) {
        for (const key of exprKeys) checkExprKey(key, node[key], 'boolean', child(inner), ctx, `${path}.${key}`, undefined);
        type = typeOf('boolean');
    } else {
        const owner = typeof node.as === 'string' && !hasUsing ? node.as : undefined;
        type = checkExprKey(exprKeys[0], node[exprKeys[0]], keyPosition, inner, ctx, `${path}.${exprKeys[0]}`, owner, node);
    }
    if (hasUsing) {
        const root = Object.fromEntries(
            exprKeys.map((key) => [
                key,
                node[key],
            ]),
        );
        const usingScope = { ...inner, bound: type, perItem: scope.perItem === true && readsOuterSelf(root) };
        type = checkUsing(node.using, type, valuePosition, usingScope, ctx, path);
    }
    if (hasIs) {
        // `as` names the value, not the test, so a ref to it from the test is no cycle
        checkPredicate(node.is, 'value', predicateSubject(type, node.is, ctx, `${path}.is`), child(scope), ctx, `${path}.is`);
        return typeOf('boolean');
    }
    return type;
}

/**
 * @param {string} key
 * @param {unknown} body
 * @param {Position} position
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @param {string | undefined} owner - the `as` beside the key
 * @param {Record<string, unknown>} [holder] - the expression object holding the key
 * @returns {StaticType}
 */
function checkExprKey(key, body, position, scope, ctx, path, owner, holder) {
    switch (key) {
        case 'element':
        case 'text':
            return checkConditionSource(key, body, position, scope, ctx, path, owner);
        case 'api':
            return checkApi(apiBody(body), position, scope, ctx, path, undefined, holder !== undefined && ctx.functionApis.has(holder));
        case 'self': {
            if (!scope.bound) {
                fail(ctx, path, '`self` reads from `using`, `where` or `field`, and none encloses it');
                return UNKNOWN;
            }
            const selfBody = apiBody(body);
            if (isPlainObject(selfBody) && Object.keys(selfBody).length === 0) {
                // The bound value itself
                if (position !== 'boolean') return sourceType(itemOf(scope.bound), scope.bound.list, position, ctx, path);
                if (!allows(scope.bound, 'boolean'))
                    fail(ctx, path, `boolean position takes a boolean, and config types the value as ${describeType(scope.bound)}`);
                return typeOf('boolean');
            }
            return checkApi(selfBody, position, scope, ctx, path, scope.bound, false, true);
        }
        case 'expr':
            // Its operand's value in its own position. An operand with `is` gives a boolean
            if (isPlainObject(body) && 'is' in body) {
                expectPosition(ctx, path, '`expr` over `is`', position, [
                    'boolean',
                    'value',
                ]);
                return checkExpr(body, 'boolean', scope, ctx, path);
            }
            return checkExpr(body, position, scope, ctx, path);
        case 'only': {
            expectPosition(ctx, path, '`only`', position, [
                'value',
                'number',
                'root',
            ]);
            const type = oneItem(checkExpr(body, 'list', child(scope), ctx, path), ctx, path);
            if (position === 'number' && !allows(type, 'number'))
                fail(ctx, path, `number position takes a number, and config types the value as ${describeType(type)}`);
            return type;
        }
        case 'sum':
        case 'mul': {
            expectPosition(ctx, path, `\`${key}\``, position, [
                'value',
                'number',
            ]);
            let nan = false;
            asArray(body).forEach((operand, index) => {
                const operandPath = Array.isArray(body) ? `${path}[${index}]` : path;
                const listed = providesValues(operand, 'number', ctx);
                const type = checkExpr(operand, listed ? 'spread' : 'number', child(scope), ctx, operandPath);
                if (listed && !allows(type, 'number'))
                    fail(ctx, operandPath, `\`${key}\` takes numbers, and config types the values as ${describeType(type)}`);
                nan ||= type.nan;
            });
            return {
                types: [
                    'number',
                ],
                nan,
            };
        }
        case 'div': {
            expectPosition(ctx, path, '`div`', position, [
                'value',
                'number',
            ]);
            if (!Array.isArray(body) || body.length !== 2) {
                fail(ctx, path, '`div` takes an array of two operands');
                return {
                    types: [
                        'number',
                    ],
                    nan: true,
                };
            }
            body.forEach((operand, index) => checkExpr(operand, 'number', child(scope), ctx, `${path}[${index}]`));
            return {
                types: [
                    'number',
                ],
                nan: true,
            };
        }
        case 'any':
        case 'all':
        case 'none': {
            expectPosition(ctx, path, `\`${key}\``, position, [
                'boolean',
                'value',
            ]);
            asArray(body).forEach((operand, index) => {
                const operandPath = Array.isArray(body) ? `${path}[${index}]` : path;
                /** @type {Scope} */
                const operandScope = {
                    ...child(scope),
                    underNone: scope.underNone || key === 'none',
                    topOperand: scope.matchRoot && key === 'all' ? index : scope.topOperand,
                };
                if (providesValues(operand, 'boolean', ctx)) {
                    const type = checkExpr(operand, 'spread', operandScope, ctx, operandPath);
                    if (!allows(type, 'boolean'))
                        fail(ctx, operandPath, `\`${key}\` takes booleans, and config types the values as ${describeType(type)}`);
                } else {
                    checkExpr(operand, 'boolean', operandScope, ctx, operandPath);
                }
            });
            return typeOf('boolean');
        }
        case 'if': {
            expectPosition(ctx, path, '`if`', position, [
                'boolean',
                'value',
                'number',
                'root',
            ]);
            if (!isPlainObject(body)) {
                fail(ctx, path, '`if` takes a body of `test`, `then` and `else`');
                return UNKNOWN;
            }
            const keys = Object.keys(body);
            const missing = [
                'test',
                'then',
                'else',
            ].filter((k) => !keys.includes(k));
            const extra = keys.filter(
                (k) =>
                    ![
                        'test',
                        'then',
                        'else',
                    ].includes(k),
            );
            if (missing.length || extra.length)
                fail(
                    ctx,
                    path,
                    `\`if\` takes exactly \`test\`, \`then\` and \`else\` (missing [${missing.join(', ')}], extra [${extra.join(', ')}])`,
                );
            const inner = child(scope);
            checkExpr(body.test, 'boolean', inner, ctx, `${path}.test`);
            const perItemBranch = scope.perItemBranch === true || (scope.perItem === true && readsOuterSelf({ if: body }));
            const branches = [
                'then',
                'else',
            ].map((branch) =>
                checkExpr(
                    body[branch],
                    position,
                    {
                        ...inner,
                        perItemBranch,
                        branch: [
                            ...scope.branch,
                            `${path}.${branch}`,
                        ],
                    },
                    ctx,
                    `${path}.${branch}`,
                ),
            );
            return mergeTypes(branches);
        }
        case 'ref': {
            if (typeof body !== 'string' || !NAME_PATTERN.test(body)) {
                fail(ctx, path, `\`ref\` ${JSON.stringify(body)} does not match ${NAME_PATTERN}`);
                return UNKNOWN;
            }
            if (ctx.mode === 'collect') {
                for (const name of scope.owners) {
                    const deps = ctx.dependencies.get(name) ?? new Set();
                    deps.add(body);
                    ctx.dependencies.set(name, deps);
                }
                return UNKNOWN;
            }
            if (ctx.mode === 'check') ctx.refs.push({ name: body, path, branch: scope.branch, inMatch: scope.inMatch });
            return resolveRef(body, position, ctx, path);
        }
        default:
            return UNKNOWN;
    }
}

/**
 * Check a ref's target fills the ref's position, and return its type.
 *
 * @param {string} name
 * @param {Position} position
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
function resolveRef(name, position, ctx, path) {
    const target = ctx.names.get(name);
    if (!target) {
        fail(ctx, path, `\`ref\` "${name}" names no expression in this detector`);
        return UNKNOWN;
    }
    // A cycle is reported once, from the collect pass
    if (ctx.resolving.has(name)) return UNKNOWN;
    const key = `${name}|${position}`;
    let result = ctx.refMemo.get(key);
    if (!result) {
        ctx.resolving.add(name);
        /** @type {Context} */
        const dry = { ...ctx, mode: 'dry', errors: [] };
        const type = checkExpr(valueNode(target.node), position, PAYLOAD_SCOPE, dry, target.path);
        ctx.resolving.delete(name);
        result = { errors: dry.errors, type };
        ctx.refMemo.set(key, result);
    }
    if (result.errors.length) {
        // Reported once the walk ends, and only for errors the target does not give in its own position
        if (ctx.mode === 'check') ctx.refFailures.push({ name, position, path, errors: result.errors });
        else fail(ctx, path, `\`ref\` "${name}" is read in ${position} position, which its target does not fill: ${result.errors[0]}`);
    }
    return result.type;
}

/**
 * @param {unknown} branch
 * @param {Position} position
 * @param {Context} ctx
 * @param {string} path
 * @returns {{ body: Record<string, any>, path: string, underNone: boolean }[]}
 */
function collectBodies(branch, position, ctx, path, underNone = false) {
    if (Array.isArray(branch)) {
        return branch.flatMap((entry, index) => collectBodies(entry, position, ctx, `${path}[${index}]`, underNone));
    }
    if (!isPlainObject(branch)) {
        fail(ctx, path, 'a source body is an object, or an array of them');
        return [];
    }
    const opKeys = Object.keys(branch).filter((key) => OPERATOR_KEYS.includes(key));
    if (opKeys.length === 0)
        return [
            { body: branch, path, underNone },
        ];

    const otherKeys = Object.keys(branch).filter((key) => !OPERATOR_KEYS.includes(key));
    if (otherKeys.length)
        fail(ctx, path, `source body mixes operator keys [${opKeys.join(', ')}] with body keys [${otherKeys.join(', ')}]`);
    if (position !== 'boolean')
        fail(ctx, path, `\`{${opKeys.join('|')}}\` blocks over source bodies are boolean only, not ${position} position`);
    return opKeys.flatMap((key) => collectBodies(branch[key], position, ctx, `${path}.${key}`, underNone || key === 'none'));
}

/**
 * @param {Record<string, any>} body
 * @param {string[]} allowed
 * @param {Context} ctx
 * @param {string} path
 */
function checkBodyKeys(body, allowed, ctx, path) {
    for (const key of Object.keys(body)) {
        if (!allowed.includes(key)) fail(ctx, path, `unknown source body key "${key}"`);
    }
}

/**
 * @param {unknown} value
 * @param {Context} ctx
 * @param {string} path
 * @param {string} what
 * @returns {value is string | string[]}
 */
function expectStrings(value, ctx, path, what) {
    const ok =
        typeof value === 'string'
            ? value !== ''
            : Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string' && v !== '');
    if (!ok) fail(ctx, path, `${what} is a non-empty string or array of them`);
    return ok;
}

/**
 * `element` and `text`.
 *
 * @param {'element' | 'text'} key
 * @param {unknown} branch
 * @param {Position} position
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @param {string | undefined} owner
 * @returns {StaticType}
 */
function checkConditionSource(key, branch, position, scope, ctx, path, owner) {
    const bodies = collectBodies(branch, position, ctx, path);
    const withField = bodies.filter(({ body }) => 'field' in body).length;
    if (withField && withField !== bodies.length) fail(ctx, path, 'every body of one `element` source has `field`, or none does');
    const hasField = withField > 0;
    if (hasField)
        expectPosition(ctx, path, '`element` with `field`', position, [
            'value',
            'number',
            'list',
            'spread',
            'root',
        ]);

    /** @type {StaticType[]} */
    const valueTypes = [];
    for (const { body, path: bodyPath, underNone } of bodies) {
        checkBodyKeys(body, BODY_KEYS[key], ctx, bodyPath);
        if (key === 'text') {
            expectStrings(body.pattern, ctx, `${bodyPath}.pattern`, '`pattern`');
            if ('selector' in body) expectStrings(body.selector, ctx, `${bodyPath}.selector`, '`selector`');
            if ('xpath' in body) expectStrings(body.xpath, ctx, `${bodyPath}.xpath`, '`xpath`');
            valueTypes.push(typeOf('string'));
            if ('root' in body && 'xpath' in body) {
                for (const expression of asArray(body.xpath)) {
                    if (typeof expression === 'string' && expression.trimStart().startsWith('/')) {
                        fail(
                            ctx,
                            `${bodyPath}.xpath`,
                            `${JSON.stringify(expression)} selects from the document whatever its root; a scoped XPath expression starts ".//"`,
                        );
                    }
                }
            }
        } else {
            expectStrings(body.selector, ctx, `${bodyPath}.selector`, '`selector`');
            if ('visibility' in body && !VISIBILITY_VALUES.includes(body.visibility)) {
                fail(ctx, `${bodyPath}.visibility`, `unknown visibility ${JSON.stringify(body.visibility)}`);
            }
            /** @type {StaticType} */
            const itemType = {
                types: [
                    'object',
                ],
                nan: false,
                interfaces: selectorInterfaces(body.selector),
            };
            if (selectorNamesCustomElement(body.selector)) itemType.customElement = true;
            if ('where' in body)
                checkPredicate(body.where, 'item', itemType, { ...bindItem(scope, itemType), underNone: false }, ctx, `${bodyPath}.where`);
            valueTypes.push('field' in body ? checkFieldRead(body.field, itemType, scope, ctx, `${bodyPath}.field`) : itemType);
        }
        if ('root' in body) {
            const rootPath = `${bodyPath}.root`;
            const valid = checkRoot(body.root, child(scope), ctx, rootPath);
            if (valid && ctx.mode === 'check') {
                ctx.rooted.push({
                    root: body.root,
                    path: bodyPath,
                    needsGuard: position !== 'boolean' || !scope.inMatch || scope.underNone || underNone,
                    inMatch: scope.inMatch,
                    topOperand: scope.topOperand,
                    owner,
                });
            }
        }
    }

    if (position === 'boolean') return typeOf('boolean');
    return sourceType(mergeTypes(valueTypes), 'selected', position, ctx, path);
}

/**
 * Check the `root` of `element` or `text`: an expression or an array of them, each giving a
 * selector, a node or a list of nodes.
 *
 * @param {unknown} root
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {boolean} whether the root has entries
 */
function checkRoot(root, scope, ctx, path) {
    if (Array.isArray(root) && root.length === 0) {
        fail(ctx, path, '`root` needs at least one entry');
        return false;
    }
    asArray(root).forEach((entry, index) => checkRootEntry(entry, scope, ctx, Array.isArray(root) ? `${path}[${index}]` : path));
    return true;
}

/**
 * @param {unknown} entry
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 */
function checkRootEntry(entry, scope, ctx, path) {
    if (entry === '') fail(ctx, path, 'a selector root is a non-empty string');
    const type = checkExpr(entry, 'root', scope, ctx, path);
    // `null` and `undefined` are an empty scope. A list's items are nodes
    const allowed =
        type.list === 'selected'
            ? [
                  'object',
              ]
            : [
                  'string',
                  'object',
                  'null',
                  'undefined',
              ];
    if (type.types !== null && type.types.some((name) => !allowed.includes(name)))
        fail(ctx, path, `a root gives a selector, a node or a list of nodes, and config types it as ${describeType(type)}`);
}

/**
 * The type a source gives in a position. A selected list gives its one item in number position,
 * and each item in spread position.
 *
 * @param {StaticType} type - each item's, when `list` is set
 * @param {StaticType['list']} list
 * @param {Position} position - other than boolean
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
function sourceType(type, list, position, ctx, path) {
    if (position === 'spread') return type;
    if (position === 'number') {
        const item = list ? oneItem(type, ctx, path) : type;
        if (!allows(item, 'number')) fail(ctx, path, `number position takes a number, and config types the value as ${describeType(item)}`);
        return item;
    }
    return list ? { ...type, list } : type;
}

/**
 * `using`: an expression over the value of the expression beside it, which `self` reads. A path or
 * an `api` body is short for a `self` with that body.
 *
 * @param {unknown} using
 * @param {StaticType} root - the type of the expression beside `using`
 * @param {Position} position
 * @param {Scope} scope - with `bound` the type of the expression beside `using`
 * @param {Context} ctx
 * @param {string} path - the path of the object holding `using`
 * @returns {StaticType}
 */
function checkUsing(using, root, position, scope, ctx, path) {
    const usingPath = `${path}.using`;
    if (isPlainObject(using) && expressionKeysOf(using).length) return checkExpr(using, position, scope, ctx, usingPath);
    const body = typeof using === 'string' ? { path: using } : using;
    if (!isPlainObject(body)) {
        fail(ctx, usingPath, '`using` takes a path, an `api` body without `root`, or an expression');
        return UNKNOWN;
    }
    // `length` alone is a number, as C-S-S compiles it
    if (body.path === 'length' && Object.keys(body).length === 1)
        expectPosition(ctx, usingPath, '`using` `length`', position, [
            'value',
            'number',
            'root',
        ]);
    return checkApi(body, position, scope, ctx, usingPath, root);
}

/**
 * @param {unknown} body
 * @param {Position} position
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @param {StaticType} [root] - through `using` or `self`, the type of the value `path` reads from. Without it, the global object
 * @param {boolean} [asFunction] - whether the `api` is an `args` entry, which may read a method as a function
 * @param {boolean} [bound] - whether the body is a `self` body, whose `path` may be left out to read the bound value itself
 * @returns {StaticType}
 */
function checkApi(body, position, scope, ctx, path, root, asFunction = false, bound = false) {
    if (!isPlainObject(body)) {
        fail(ctx, path, '`api` takes a path or one body object');
        return UNKNOWN;
    }
    const hasWhere = 'where' in body;
    expectPosition(ctx, path, hasWhere ? '`api` with `where`' : '`api`', position, [
        ...(hasWhere
            ? []
            : [
                  'boolean',
              ]),
        'value',
        'number',
        'list',
        'spread',
        'root',
    ]);
    checkBodyKeys(body, BODY_KEYS.api, ctx, path);
    const pathless = bound && body.path === undefined;
    if (pathless && 'args' in body) fail(ctx, path, '`args` calls the last name in `path`, so it needs `path`');
    if (!pathless && (typeof body.path !== 'string' || body.path === '')) {
        fail(ctx, `${path}.path`, '`path` is a non-empty string');
        return UNKNOWN;
    }
    const names = pathless ? [] : String(body.path).split('.');
    const asArgument = asFunction && !('args' in body);
    /** @type {StaticType} */
    let read = root ?? UNKNOWN;
    if (root) {
        // `concat`, an item read and `length` on a list add no name
        const addsNoName =
            read.list !== undefined &&
            names.length === 1 &&
            ('args' in body ? names[0] === 'concat' || readsItem(names[0], true, body.args) : names[0] === 'length');
        if (read.apiPaths === undefined && !read.interfaces && !addsNoName && names.length > 0) {
            fail(
                ctx,
                path,
                'CI names what `using` or `self` reads by the `api` names or element type of the value it reads from, and this expression has neither',
            );
            read = UNKNOWN;
        }
    }
    const argTypes = 'args' in body ? checkArgs(body.args, scope, ctx, `${path}.args`) : undefined;
    if (root) {
        names.forEach((name, index) => {
            const last = index === names.length - 1;
            const isCall = 'args' in body && last;
            read = readName(read, name, isCall, ctx, `${path}.path`, body.args, {
                next: names[index + 1],
                argTypes: isCall ? argTypes : undefined,
                asArgument: asArgument && last,
            });
        });
    } else {
        names.forEach((_, index) => {
            const last = index === names.length - 1;
            const isCall = 'args' in body && last;
            checkApiName(names.slice(0, index + 1).join('.'), isCall, ctx, `${path}.path`, names[index + 1], asArgument && last);
        });
        const returns = 'args' in body && Object.hasOwn(BUILTIN_RETURN_TYPES, body.path) ? BUILTIN_RETURN_TYPES[body.path] : undefined;
        read = {
            types: returns
                ? [
                      returns,
                  ]
                : null,
            nan: returns === 'number',
            apiPaths: [
                body.path,
            ],
        };
        if (argTypes) checkCallArgs(body.path, body.args, argTypes, ctx, `${path}.args`);
    }
    const itemType = itemOf(read);
    if (hasWhere) checkPredicate(body.where, 'item', itemType, { ...bindItem(scope, itemType), underNone: false }, ctx, `${path}.where`);
    const valueType = 'field' in body ? checkFieldRead(body.field, itemType, scope, ctx, `${path}.field`) : itemType;
    // `field` gives a list when `path` reads one, which config does not show, and `concat` gives an array
    const list = hasWhere ? 'selected' : 'field' in body || read.list !== undefined ? 'maybe' : undefined;
    if (position === 'boolean') {
        if (!allows(valueType, 'boolean'))
            fail(ctx, path, `boolean position takes a boolean, and config types the value as ${describeType(valueType)}`);
        return typeOf('boolean');
    }
    return sourceType(valueType, list, position, ctx, path);
}

/**
 * Check one name an `api` reads: listed, and called exactly when it is a method. A method is also
 * read as a function before `apply` or `call`, and as the last name of an `args` entry, where its
 * listing as a method names the function the receiving method may call.
 *
 * @param {string} name
 * @param {boolean} isCall
 * @param {Context} ctx
 * @param {string} path
 * @param {string} [next] - the name read after it
 * @param {boolean} [asArgument] - whether the value is an `args` entry
 */
function checkApiName(name, isCall, ctx, path, next, asArgument = false) {
    const kind = Object.hasOwn(API_ALLOWLIST, name) ? API_ALLOWLIST[name] : undefined;
    if (!kind) {
        fail(ctx, path, `\`api\` reads "${name}", which is not in API_ALLOWLIST`);
    } else if (isCall && kind !== 'method') {
        fail(ctx, path, `calls "${name}", which API_ALLOWLIST records as a ${kind}`);
    } else if (!isCall && kind === 'method' && !asArgument && !(next !== undefined && FUNCTION_READS.includes(next))) {
        fail(
            ctx,
            path,
            `reads the method "${name}" without calling it; a method is called through \`args\`, as the last name of a path, or read before \`apply\`, \`call\` or \`bind\`, or as an \`args\` entry`,
        );
    }
}

/**
 * Check `args`, and return the type of each entry.
 *
 * @param {unknown} args
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType[]}
 */
function checkArgs(args, scope, ctx, path) {
    if (!Array.isArray(args)) {
        fail(ctx, path, '`args` is an array');
        return [];
    }
    return args.map((arg, index) => checkArg(arg, scope, ctx, `${path}[${index}]`));
}

/**
 * An `args` entry: an expression in value position, or an array of entries.
 *
 * @param {unknown} arg
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
function checkArg(arg, scope, ctx, path) {
    if (Array.isArray(arg)) {
        // An array is typed as a list of its entries, as `apply` and `concat` read it
        const entries = arg.map((entry, index) => checkArg(entry, scope, ctx, `${path}[${index}]`));
        return { ...(entries.length ? mergeTypes(entries.map(itemOf)) : UNKNOWN), list: 'maybe' };
    }
    if (isPlainObject(arg) && 'api' in arg) ctx.functionApis.add(arg);
    return checkExpr(arg, 'value', child(scope), ctx, path);
}

/**
 * Whether an `apply` list is one config shows is a list: a selected list, an array in `args`, or
 * `Array.from`, `Array.of` or `concat` over one. `apply` over any other value, such as `null` or
 * a `FontFaceSet`, passes no arguments.
 *
 * @param {unknown} arg
 * @param {StaticType | undefined} type
 * @returns {boolean}
 */
function isApplyList(arg, type) {
    if (Array.isArray(arg) || type?.list !== undefined) return true;
    if (!isPlainObject(arg)) return false;
    const body = apiBody(arg.api);
    if (!isPlainObject(body) || typeof body.path !== 'string') return false;
    const path = body.path;
    return path === 'Array.from' || path === 'Array.of' || path.endsWith('.concat.call');
}

/**
 * Check the arguments of a call config can type: the list `apply` takes, a string `JSON.parse`
 * parses, and the numbers `Math.max` and `Math.min` take.
 *
 * @param {string} apiPath
 * @param {unknown[]} args
 * @param {StaticType[]} argTypes
 * @param {Context} ctx
 * @param {string} path
 */
function checkCallArgs(apiPath, args, argTypes, ctx, path) {
    const isApply = apiPath.endsWith('.apply');
    if (isApply && !isApplyList(args[1], argTypes[1])) {
        fail(ctx, `${path}[1]`, '`apply` takes its arguments as a selected list, an array in `args`, or `Array.from` or `concat` over one');
    }
    if (apiPath === 'JSON.parse' && typeof args[0] === 'string') {
        try {
            JSON.parse(args[0]);
        } catch {
            fail(ctx, `${path}[0]`, 'the string passed to `JSON.parse` does not parse');
        }
    }
    const method = isApply ? apiPath.slice(0, -'.apply'.length) : apiPath;
    if (method !== 'Math.max' && method !== 'Math.min') return;
    const numbers = isApply ? argTypes.slice(1, 2).map(itemOf) : argTypes;
    numbers.forEach((type, index) => {
        const argPath = `${path}[${isApply ? 1 : index}]`;
        if (!isApply && type.list === 'selected') fail(ctx, argPath, `\`${method}\` takes numbers; \`${method}.apply\` takes a list`);
        else if (!allows(type, 'number'))
            fail(ctx, argPath, `\`${method}\` takes numbers, and config types the value as ${describeType(type)}`);
    });
}

/**
 * Check a `field` read, from an item or value of the given type, and return the type it reads. A
 * `field` given as an expression, and its `args`, read the item or value through `self`.
 *
 * @param {unknown} field
 * @param {StaticType} subject
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 * @returns {StaticType}
 */
function checkFieldRead(field, subject, scope, ctx, path) {
    if (isPlainObject(field) && expressionKeysOf(field).length) {
        const type = checkExpr(field, 'value', bindItem(scope, subject), ctx, path);
        // A selected list reaches the predicate as an array
        return type.list === 'selected' ? { ...type, list: 'maybe' } : type;
    }
    /** @type {Record<string, any>} */
    let read;
    if (typeof field === 'string') {
        read = { path: field };
    } else if (isPlainObject(field)) {
        for (const key of Object.keys(field)) {
            if (!FIELD_KEYS.includes(key)) fail(ctx, path, `unknown \`field\` key "${key}"`);
        }
        if (!FIELD_KEYS.some((key) => key in field))
            fail(ctx, path, '`field` needs at least one of `path`, `args` and `feature`, or is an expression');
        if ('args' in field && !('path' in field)) fail(ctx, path, '`args` calls the last name in `path`, so it needs `path`');
        read = field;
    } else {
        fail(ctx, path, '`field` is a string, an object or an expression');
        return UNKNOWN;
    }

    let current = subject;
    if (read.path !== undefined) {
        if (typeof read.path !== 'string' || read.path === '') {
            fail(ctx, path, '`path` is a non-empty string');
            return UNKNOWN;
        }
        const argTypes = read.args !== undefined ? checkArgs(read.args, bindItem(scope, subject), ctx, `${path}.args`) : undefined;
        const names = read.path.split('.');
        names.forEach((name, index) => {
            const isCall = read.args !== undefined && index === names.length - 1;
            current = readName(current, name, isCall, ctx, path, read.args, {
                next: names[index + 1],
                argTypes: isCall ? argTypes : undefined,
            });
        });
    }
    if (read.feature !== undefined) {
        const input = Object.hasOwn(FEATURE_INPUTS, read.feature)
            ? FEATURE_INPUTS[/** @type {keyof typeof FEATURE_INPUTS} */ (read.feature)]
            : undefined;
        if (!input) {
            fail(ctx, path, `unknown feature ${JSON.stringify(read.feature)}`);
        } else if (current.types !== null && input === 'string' && !current.types.includes('string')) {
            fail(ctx, path, `${read.feature} takes a string, and config types the value as ${describeType(current)}`);
        } else if (current.types !== null && input === 'element' && !current.interfaces) {
            fail(ctx, path, `${read.feature} takes an element, and config types the value as ${describeType(current)}`);
        }
        current = typeOf('number');
    }
    return current;
}

/**
 * The `Number` test a predicate object makes on its value through
 * `{"field": {"api": {"path": <test>, "args": [{"self": {}}]}}, "is": <boolean>}`: `Number.isFinite`
 * or `Number.isNaN`, with the boolean it expects.
 *
 * @param {Record<string, any>} predicate
 * @returns {{ name: string, expected: boolean } | undefined}
 */
function numberGuard(predicate) {
    const { field, is } = predicate;
    if (typeof is !== 'boolean' || !isPlainObject(field) || Object.keys(field).length !== 1 || !('api' in field)) return undefined;
    const body = apiBody(field.api);
    if (!isPlainObject(body) || Object.keys(body).length !== 2 || !Array.isArray(body.args) || body.args.length !== 1) return undefined;
    if (body.path !== 'Number.isFinite' && body.path !== 'Number.isNaN') return undefined;
    const [
        arg,
    ] = body.args;
    if (!isPlainObject(arg) || Object.keys(arg).length !== 1 || !isPlainObject(arg.self) || Object.keys(arg.self).length) return undefined;
    return { name: body.path, expected: is };
}

/**
 * Whether a read takes one item of an array: `at` called with one integer, or an index.
 *
 * @param {string} name
 * @param {boolean} isCall
 * @param {unknown} args
 */
function readsItem(name, isCall, args) {
    if (!isCall) return /^\d+$/.test(name);
    return name === 'at' && Array.isArray(args) && args.length === 1 && Number.isInteger(args[0]);
}

/**
 * Read one name from a value of the given type.
 *
 * An item read on a list, or on an `api` value, takes no name of its own: an item of
 * `performance.getEntriesByType` is named `performance.getEntriesByType`, as `where` names it.
 *
 * @param {StaticType} current
 * @param {string} name
 * @param {boolean} isCall
 * @param {Context} ctx
 * @param {string} path
 * @param {unknown} [args] - when `isCall`, the arguments
 * @param {{ next?: string, argTypes?: StaticType[], asArgument?: boolean }} [options] - the name read after it, the type of each argument, and whether the value is an `args` entry
 * @returns {StaticType}
 */
function readName(current, name, isCall, ctx, path, args, options = {}) {
    if (name === '') {
        fail(ctx, path, 'a path has an empty name');
        return UNKNOWN;
    }
    if (isCall && name === 'concat' && (current.list !== undefined || current.apiPaths !== undefined)) {
        // `concat` joins lists, and each item keeps the name and type of its list
        return {
            ...mergeTypes([
                itemOf(current),
                ...(options.argTypes ?? []).map(itemOf),
            ]),
            list: 'maybe',
        };
    }
    const item = readsItem(name, isCall, args);
    if (current.list === 'selected') {
        if (item) return oneItem(current, ctx, path);
        if (name === 'length' && !isCall) return typeOf('number');
        fail(ctx, path, `reads "${name}" on a list, which \`at\`, an index and \`length\` read; \`only\` takes its one item`);
        return UNKNOWN;
    }
    if (item && (current.list === 'maybe' || current.apiPaths !== undefined)) return oneItem(current, ctx, path);
    if (current.list) current = itemOf(current);
    if (current.apiPaths !== undefined && current.interfaces) {
        // Branches reading an `api` and branches giving an element: check the name both ways
        const { apiPaths, ...element } = current;
        return mergeTypes([
            readName({ types: null, nan: false, apiPaths }, name, isCall, ctx, path, args, options),
            readName(element, name, isCall, ctx, path, args, options),
        ]);
    }
    if (current.apiPaths !== undefined) {
        const apiPaths = current.apiPaths.map((apiPath) => `${apiPath}.${name}`);
        for (const apiPath of apiPaths) checkApiName(apiPath, isCall, ctx, path, options.next, options.asArgument);
        return { types: null, nan: false, apiPaths };
    }
    // The tables do not type the items of an IDL sequence
    if (isCall && item && current.types?.includes('array')) return UNKNOWN;
    if (isCall) {
        if (!current.interfaces) {
            fail(ctx, path, `calls ${name}() on a value that is not an element or an \`api\` read`);
            return UNKNOWN;
        }
        if (!Object.hasOwn(ELEMENT_METHOD_ALLOWLIST, name)) {
            fail(ctx, path, `calls ${name}() on an element, which is not in ELEMENT_METHOD_ALLOWLIST`);
            return UNKNOWN;
        }
        return typeFromIdl(ELEMENT_METHOD_ALLOWLIST[/** @type {keyof typeof ELEMENT_METHOD_ALLOWLIST} */ (name)]);
    }
    if (current.types === null) return UNKNOWN;

    const isIndex = /^\d+$/.test(name);
    /** @type {StaticType[]} */
    const results = [];
    const wrong = [];
    for (const type of current.types) {
        if (type === 'null' || type === 'undefined') {
            results.push(typeOf('undefined'));
        } else if ((type === 'string' || type === 'array') && name === 'length') {
            results.push(typeOf('number'));
        } else if (type === 'string' && isIndex) {
            results.push(
                mergeTypes([
                    typeOf('string'),
                    typeOf('undefined'),
                ]),
            );
        } else if (type === 'array' && isIndex) {
            results.push(UNKNOWN);
        } else if (type === 'object' && current.interfaces) {
            const found = current.interfaces.map((iface) => interfaceProperties(iface).get(name)).filter((idl) => idl !== undefined);
            if (found.length) {
                results.push(...found.map(typeFromIdl));
            } else if (current.customElement) {
                results.push(UNKNOWN);
            } else {
                fail(ctx, path, `"${name}" is not a property of ${describeInterfaces(current.interfaces)}`);
            }
        } else if (type === 'object') {
            results.push(UNKNOWN);
        } else {
            wrong.push(type);
        }
    }
    if (wrong.length) fail(ctx, path, `reads "${name}" on a value config types as ${wrong.join(' or ')}`);
    return results.length ? mergeTypes(results) : UNKNOWN;
}

/**
 * Check a predicate testing an item or a value of the given type.
 *
 * @param {unknown} predicate
 * @param {'item' | 'value'} level
 * @param {StaticType} subject
 * @param {Scope} scope - `underNone` is set under a `none`, in the predicate or the match tree
 * @param {Context} ctx
 * @param {string} path
 */
function checkPredicate(predicate, level, subject, scope, ctx, path) {
    if (
        predicate === null ||
        [
            'string',
            'number',
            'boolean',
        ].includes(typeof predicate)
    )
        return;
    if (Array.isArray(predicate)) {
        predicate.forEach((entry, index) => checkPredicate(entry, level, subject, scope, ctx, `${path}[${index}]`));
        return;
    }
    if (!isPlainObject(predicate)) {
        fail(ctx, path, `${JSON.stringify(predicate)} is not a predicate`);
        return;
    }

    if ('field' in predicate !== 'is' in predicate) fail(ctx, path, '`field` and `is` go together: `{"field": F, "is": P}`');
    const operators = level === 'value' ? Object.keys(predicate).filter((key) => VALUE_OPERATORS.includes(key)) : [];
    if (operators.length) checkOperators(predicate, subject, scope, ctx, path);

    for (const [
        key,
        value,
    ] of Object.entries(predicate)) {
        const keyPath = `${path}.${key}`;
        if (OPERATOR_KEYS.includes(key)) {
            const entryScope = { ...scope, underNone: scope.underNone || key === 'none' };
            for (const entry of asArray(value)) checkPredicate(entry, level, subject, entryScope, ctx, keyPath);
        } else if (key === 'field') {
            const read = checkFieldRead(value, subject, scope, ctx, keyPath);
            if ('is' in predicate) checkPredicate(predicate.is, 'value', read, scope, ctx, `${path}.is`);
        } else if (key === 'is' || operators.includes(key)) {
            continue;
        } else {
            const read = checkFieldRead(key, subject, scope, ctx, keyPath);
            checkPredicate(value, 'value', read, scope, ctx, keyPath);
        }
    }
}

/**
 * The operators of a value-level predicate object.
 *
 * @param {Record<string, any>} predicate
 * @param {StaticType} subject
 * @param {Scope} scope
 * @param {Context} ctx
 * @param {string} path
 */
function checkOperators(predicate, subject, scope, ctx, path) {
    /** @param {string} key */
    const has = (key) => Object.hasOwn(predicate, key);

    if (has('eq')) checkExpr(predicate.eq, 'value', child(scope), ctx, `${path}.eq`);
    const comparisons = COMPARISON_OPERATORS.filter(has);
    for (const key of comparisons) checkExpr(predicate[key], 'number', child(scope), ctx, `${path}.${key}`);

    for (const key of [
        'fails',
        'exists',
    ]) {
        if (has(key) && typeof predicate[key] !== 'boolean') fail(ctx, `${path}.${key}`, `\`${key}\` is a boolean`);
    }
    if (predicate.fails === true) {
        const beside = Object.keys(predicate).filter((key) => key !== 'fails' && key !== 'exists' && key !== 'type');
        if (beside.length)
            fail(
                ctx,
                path,
                `beside \`"fails": true\`, ${beside.join(', ')} read${beside.length === 1 ? 's' : ''} the failed value, which aborts the detector`,
            );
    }
    if (predicate.exists === false && Object.keys(predicate).length > 1)
        fail(ctx, path, '`"exists": false` stands alone: beside another key it never holds for a read value');

    /** @type {string[] | null} */
    let listed = null;
    if (has('type')) {
        const names = asArray(predicate.type);
        const unknown = names.filter((name) => !TYPE_NAMES.includes(name));
        if (unknown.length)
            fail(
                ctx,
                `${path}.type`,
                `unknown type name ${unknown.map((name) => JSON.stringify(name)).join(', ')}; names are ${TYPE_NAMES.join(', ')}`,
            );
        listed = names;
    }

    const guard = numberGuard(predicate);
    // `Number.isFinite` or `Number.isNaN` holding means a number, when tested before the comparisons
    const keys = Object.keys(predicate);
    const guardsFirst = keys.indexOf('field') < Math.min(...comparisons.map((key) => keys.indexOf(key)));
    const numberOnly = guard?.expected === true && guardsFirst;
    if (guard?.expected === true && listed && !listed.includes('number'))
        fail(ctx, path, `\`${guard.name}\` holding beside a \`type\` that leaves out number never holds`);

    if (comparisons.length) {
        const operatorList = comparisons.join(', ');
        if (listed) {
            const outside = listed.filter((name) => name !== 'number');
            if (outside.length)
                fail(ctx, path, `beside \`type\`, ${operatorList} takes numbers only, and \`type\` also lists ${outside.join(', ')}`);
        } else if (!numberOnly && subject.types !== null) {
            const outside = subject.types.filter((name) => name !== 'number');
            if (outside.length) {
                fail(
                    ctx,
                    path,
                    `${operatorList} takes numbers, and config types the value as ${describeType(subject)}; guard it with "type": "number", or \`Number.isFinite\` of \`self\` holding, before the comparison`,
                );
            }
        }
        if (scope.underNone && subject.nan && !guard) {
            fail(
                ctx,
                path,
                `under \`none\`, ${operatorList} on a value that can be NaN needs \`Number.isFinite\` or \`Number.isNaN\` of \`self\` beside it, since a comparison on NaN is false`,
            );
        }
    }
}

/**
 * @param {unknown} data
 * @param {Context} ctx
 * @param {string} path
 */
function checkPayloadSpec(data, ctx, path) {
    if (!isPlainObject(data)) {
        fail(ctx, path, '`data` maps payload keys to fields');
        return;
    }
    for (const [
        key,
        field,
    ] of Object.entries(data)) {
        const fieldPath = `${path}.${key}`;
        if (!NAME_PATTERN.test(key)) fail(ctx, fieldPath, `payload key "${key}" does not match ${NAME_PATTERN}`);
        if (key === 'nativeData') fail(ctx, fieldPath, 'payload key "nativeData" is reserved');
        if (!isPlainObject(field)) {
            fail(ctx, fieldPath, 'a payload field is an object with `value`');
            continue;
        }
        for (const fieldKey of Object.keys(field)) {
            if (!PAYLOAD_FIELD_KEYS.includes(fieldKey)) fail(ctx, fieldPath, `unknown payload field key "${fieldKey}"`);
        }
        if (!('value' in field)) {
            fail(ctx, fieldPath, 'a payload field needs `value`');
            continue;
        }
        const type = checkExpr(field.value, 'value', PAYLOAD_SCOPE, ctx, `${fieldPath}.value`);
        if (type.list === 'selected' && !('buckets' in field))
            fail(
                ctx,
                `${fieldPath}.value`,
                'a selected list is sent through `buckets`, read with `only`, or sent as its length through `using`',
            );
        if ('when' in field) {
            const whenPath = `${fieldPath}.when`;
            checkPredicate(field.when, 'value', predicateSubject(type, field.when, ctx, whenPath), PAYLOAD_SCOPE, ctx, whenPath);
        }
        if ('buckets' in field) checkBuckets(field.buckets, type, ctx, `${fieldPath}.buckets`);
    }
}

/**
 * @typedef {{ lo: number, loIn: boolean, hi: number, hiIn: boolean }} Interval
 * @typedef {{ intervals: Interval[], points: unknown[] }} BucketSet
 */

/**
 * @param {unknown} value
 * @returns {value is string | number | boolean | null}
 */
function isLiteral(value) {
    return (
        value === null ||
        [
            'string',
            'number',
            'boolean',
        ].includes(typeof value)
    );
}

/**
 * The values a bucket holds for, when its predicate is a literal, an array of literals or
 * comparisons against literals. Null for any other predicate, which the overlap check skips.
 *
 * @param {unknown} predicate
 * @returns {BucketSet | null}
 */
function simpleBucketSet(predicate) {
    if (typeof predicate === 'number')
        return {
            intervals: [
                { lo: predicate, loIn: true, hi: predicate, hiIn: true },
            ],
            points: [],
        };
    if (isLiteral(predicate))
        return {
            intervals: [],
            points: [
                predicate,
            ],
        };
    if (Array.isArray(predicate)) {
        const sets = predicate.map(simpleBucketSet);
        if (!predicate.every(isLiteral)) return null;
        return {
            intervals: sets.flatMap((set) => set?.intervals ?? []),
            points: sets.flatMap((set) => set?.points ?? []),
        };
    }
    if (!isPlainObject(predicate)) return null;
    const keys = Object.keys(predicate);
    if (!keys.length || !keys.every((key) => key === 'eq' || COMPARISON_OPERATORS.includes(key))) return null;
    if (keys.length === 1 && keys[0] === 'eq' && isLiteral(predicate.eq)) return simpleBucketSet(predicate.eq);
    if (!keys.every((key) => typeof predicate[key] === 'number')) return null;

    /** @type {Interval} */
    const interval = { lo: -Infinity, loIn: false, hi: Infinity, hiIn: false };
    /**
     * @param {number} bound
     * @param {boolean} inclusive
     */
    const raiseLow = (bound, inclusive) => {
        if (bound > interval.lo || (bound === interval.lo && !inclusive)) Object.assign(interval, { lo: bound, loIn: inclusive });
    };
    /**
     * @param {number} bound
     * @param {boolean} inclusive
     */
    const lowerHigh = (bound, inclusive) => {
        if (bound < interval.hi || (bound === interval.hi && !inclusive)) Object.assign(interval, { hi: bound, hiIn: inclusive });
    };
    for (const key of keys) {
        const bound = predicate[key];
        if (key === 'gte' || key === 'eq') raiseLow(bound, true);
        if (key === 'gt') raiseLow(bound, false);
        if (key === 'lte' || key === 'eq') lowerHigh(bound, true);
        if (key === 'lt') lowerHigh(bound, false);
    }
    return {
        intervals: [
            interval,
        ],
        points: [],
    };
}

/**
 * @param {Interval} a
 * @param {Interval} b
 */
function intervalsOverlap(a, b) {
    const lo = Math.max(a.lo, b.lo);
    const hi = Math.min(a.hi, b.hi);
    if (lo < hi) return true;
    if (lo > hi || !Number.isFinite(lo)) return false;
    // They meet at one point, held only if every bound there is inclusive
    return (a.lo < lo || a.loIn) && (b.lo < lo || b.loIn) && (a.hi > hi || a.hiIn) && (b.hi > hi || b.hiIn);
}

/**
 * @param {BucketSet} a
 * @param {BucketSet} b
 */
function bucketSetsOverlap(a, b) {
    return a.points.some((point) => b.points.includes(point)) || a.intervals.some((x) => b.intervals.some((y) => intervalsOverlap(x, y)));
}

/**
 * @param {unknown} buckets
 * @param {StaticType} type - the value's
 * @param {Context} ctx
 * @param {string} path
 */
function checkBuckets(buckets, type, ctx, path) {
    if (!isPlainObject(buckets) || Object.keys(buckets).length === 0) {
        fail(ctx, path, '`buckets` maps at least one bucket name to a predicate');
        return;
    }
    /** @type {{ name: string, set: BucketSet }[]} */
    const simple = [];
    for (const [
        name,
        predicate,
    ] of Object.entries(buckets)) {
        if (name === '') fail(ctx, path, 'a bucket name is a non-empty string');
        const bucketPath = `${path}.${name}`;
        checkPredicate(predicate, 'value', predicateSubject(type, predicate, ctx, bucketPath), PAYLOAD_SCOPE, ctx, bucketPath);
        const set = simpleBucketSet(predicate);
        if (set) simple.push({ name, set });
    }
    for (let i = 0; i < simple.length; i++) {
        for (let j = i + 1; j < simple.length; j++) {
            if (bucketSetsOverlap(simple[i].set, simple[j].set))
                fail(ctx, path, `buckets "${simple[i].name}" and "${simple[j].name}" overlap`);
        }
    }
}

/**
 * Report each cycle of refs once.
 *
 * @param {Context} ctx
 */
function checkRefCycles(ctx) {
    /** @type {Map<string, 'visiting' | 'done'>} */
    const state = new Map();
    const reported = new Set();
    /**
     * @param {string} name
     * @param {string[]} stack
     */
    const visit = (name, stack) => {
        if (state.get(name) === 'done') return;
        if (state.get(name) === 'visiting') {
            const cycle = [
                ...stack.slice(stack.indexOf(name)),
                name,
            ];
            const key = [
                ...new Set(cycle),
            ]
                .sort()
                .join(',');
            if (!reported.has(key)) {
                reported.add(key);
                ctx.structuralErrors.push(`${ctx.names.get(name)?.path}: refs form a cycle: ${cycle.join(' -> ')}`);
            }
            return;
        }
        state.set(name, 'visiting');
        for (const dependency of ctx.dependencies.get(name) ?? []) {
            if (ctx.names.has(dependency))
                visit(dependency, [
                    ...stack,
                    name,
                ]);
        }
        state.set(name, 'done');
    };
    for (const name of ctx.names.keys()) visit(name, []);
}

/**
 * A ref in match into an `if` branch from outside that branch reads an expression that may never
 * be read.
 *
 * @param {Context} ctx
 */
function checkBranchRefs(ctx) {
    for (const ref of ctx.refs) {
        const target = ctx.names.get(ref.name);
        if (!ref.inMatch || !target) continue;
        const outside = target.branch.filter((branch) => !ref.branch.includes(branch));
        if (outside.length)
            fail(
                ctx,
                ref.path,
                `\`ref\` "${ref.name}" in match reads an expression inside the \`if\` branch ${outside[0]} from outside it`,
            );
    }
}

/**
 * A rooted `element` or `text` read anywhere but in boolean position with no `none` above it needs
 * a guard. Each entry of its `root` is a `ref` to an earlier operand of match's top-level `all`,
 * which carries `is` unless it is an `element` or `text` source.
 *
 * @param {Record<string, any>} detector
 * @param {string} path
 * @param {Context} ctx
 */
function checkRootGuards(detector, path, ctx) {
    const match = detector.match;
    const topAll = isPlainObject(match) && expressionKeysOf(match).join() === 'all' ? asArray(match.all) : [];
    /** @type {Map<string, number>} */
    const guards = new Map();
    topAll.forEach((operand, index) => {
        if (isPlainObject(operand) && typeof operand.as === 'string') guards.set(operand.as, index);
    });
    const referenced = new Set(ctx.refs.map((ref) => ref.name));

    for (const rooted of ctx.rooted) {
        if (!rooted.needsGuard && !(rooted.owner && referenced.has(rooted.owner))) continue;
        asArray(rooted.root).forEach((entry, index) => {
            const entryPath = Array.isArray(rooted.root) ? `${rooted.path}.root[${index}]` : `${rooted.path}.root`;
            const name = isPlainObject(entry) && Object.keys(entry).join() === 'ref' ? entry.ref : undefined;
            const guardIndex = typeof name === 'string' ? guards.get(name) : undefined;
            const ahead = guardIndex !== undefined && (!rooted.inMatch || (rooted.topOperand !== null && guardIndex < rooted.topOperand));
            if (!ahead) {
                fail(
                    ctx,
                    entryPath,
                    `\`root\` needs a guard: each root's expression, named with \`as\`, as an earlier operand of ${path}.match's top-level \`all\`, and the root a \`ref\` to it`,
                );
                return;
            }
            const guard = topAll[guardIndex];
            const keys = expressionKeysOf(guard);
            const isSource = keys.length === 1 && (keys[0] === 'element' || keys[0] === 'text');
            if (!isSource && !('is' in guard)) {
                fail(
                    ctx,
                    `${path}.match.all[${guardIndex}]`,
                    `the guard "${name}" is not an \`element\` or \`text\` source, so it carries \`is\`, such as "is": {"type": "object"}`,
                );
            }
        });
    }
}

/**
 * Check a detector's match tree and payloads against the expression, predicate and payload rules.
 *
 * @param {Record<string, any>} detector
 * @param {string} path
 * @returns {string[]} the errors, empty when the detector is valid
 */
function validateDetector(detector, path) {
    /** @type {Context} */
    const ctx = {
        mode: 'collect',
        errors: [],
        functionApis: new WeakSet(),
        structuralErrors: [],
        names: new Map(),
        dependencies: new Map(),
        refs: [],
        rooted: [],
        refMemo: new Map(),
        resolving: new Set(),
        refFailures: [],
    };
    const walk = () => {
        checkExpr(detector.match, 'boolean', MATCH_SCOPE, ctx, `${path}.match`);
        for (const action of PAYLOAD_ACTIONS) {
            const data = detector.actions?.[action]?.data;
            if (data !== undefined) checkPayloadSpec(data, ctx, `${path}.actions.${action}.data`);
        }
    };

    walk();
    checkRefCycles(ctx);
    ctx.mode = 'check';
    ctx.errors = [];
    walk();
    checkBranchRefs(ctx);
    checkRootGuards(detector, path, ctx);
    const reported = new Set(ctx.errors);
    for (const failure of ctx.refFailures) {
        const added = failure.errors.find((error) => !reported.has(error));
        if (added)
            fail(
                ctx,
                failure.path,
                `\`ref\` "${failure.name}" is read in ${failure.position} position, which its target does not fill: ${added}`,
            );
    }
    return [
        ...new Set([
            ...ctx.structuralErrors,
            ...ctx.errors,
        ]),
    ];
}

/**
 * @param {Record<string, any>} detector
 * @param {string} path
 */
function assertValidDetector(detector, path) {
    const errors = validateDetector(detector, path);
    expect(errors, `\n${errors.join('\n')}`).to.deep.equal([]);
}

/**
 * JSON pointer segments of a patch path under `/detectors`.
 *
 * @param {string} pointer
 * @returns {string[]}
 */
function detectorPointer(pointer) {
    const segments = pointer
        .split('/')
        .slice(1)
        .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
    return segments[0] === 'detectors' ? segments.slice(1, 3) : [];
}

/**
 * Invoke `cb` for each detector a patch list touches, as the patch leaves it. Each list is
 * applied on its own, to the literal settings.
 *
 * @param {import('../schema/features/web-detection').WebDetectionFeature<number>} webDetection
 * @param {(detector: Record<string, any>, path: string) => void} cb
 */
function forEachPatchedDetector(webDetection, cb) {
    const settings = /** @type {Record<string, any>} */ (webDetection.settings);
    const lists = [
        ...(settings.domains ?? []).map((/** @type {Record<string, any>} */ entry, /** @type {number} */ index) => ({
            label: `domains[${index}] (${entry.domain})`,
            operations: entry.patchSettings ?? [],
        })),
        ...(settings.conditionalChanges ?? []).map((/** @type {Record<string, any>} */ entry, /** @type {number} */ index) => ({
            label: `conditionalChanges[${index}]`,
            operations: entry.patchSettings ?? [],
        })),
    ];
    for (const { label, operations } of lists) {
        if (!operations.length) continue;
        const patched = /** @type {Record<string, any>} */ (immutableJSONPatch(settings, operations));
        const detectors = patched.detectors ?? {};
        const touched = new Set();
        for (const operation of operations) {
            for (const pointer of [
                operation.path,
                operation.from,
            ]) {
                if (typeof pointer !== 'string' || !pointer.startsWith('/detectors')) continue;
                const [
                    group,
                    name,
                ] = detectorPointer(pointer);
                for (const groupName of group === undefined
                    ? Object.keys(detectors)
                    : [
                          group,
                      ]) {
                    for (const detectorName of name === undefined
                        ? Object.keys(detectors[groupName] ?? {})
                        : [
                              name,
                          ]) {
                        if (detectors[groupName]?.[detectorName]) touched.add(`${groupName}\u0000${detectorName}`);
                    }
                }
            }
        }
        for (const key of touched) {
            const [
                group,
                name,
            ] = key.split('\u0000');
            cb(detectors[group][name], `${label} detectors.${group}.${name}`);
        }
    }
}

// Features whose subfeatures may declare experiment metrics that consume events
// (see tests/experiment-metrics-tests.js).
const METRIC_PARENTS = [
    'contentScopeExperiments',
    'blockList',
    'contentBlocking',
];

/**
 * Event types something in a config consumes: counter and data `source`s, the `trigger.source`
 * of immediate telemetry entries, and experiment metric events.
 *
 * @param {Record<string, any> | undefined} configBody
 * @returns {Set<string>}
 */
function eventHubConsumers(configBody) {
    const telemetry = /** @type {import('../schema/features/event-hub').EventHubFeature<number> | undefined} */ (
        configBody?.features?.eventHub
    )?.settings.telemetry;
    const consumers = new Set();
    for (const entry of Object.values(telemetry ?? {})) {
        for (const param of Object.values(entry.parameters)) {
            if ('source' in param && param.source) consumers.add(param.source);
        }
        if ('source' in entry.trigger && entry.trigger.source) consumers.add(entry.trigger.source);
    }
    for (const parent of METRIC_PARENTS) {
        for (const subFeature of Object.values(configBody?.features?.[parent]?.features ?? {})) {
            for (const metric of Object.values(/** @type {Record<string, any>} */ (subFeature)?.settings?.metrics ?? {})) {
                if (typeof metric?.event === 'string') consumers.add(metric.event);
            }
        }
    }
    return consumers;
}

/** `temp_` types are placeholders for detectors whose eventHub telemetry is not defined yet (for example, during experiments) */
const TEMP_EVENT_TYPE_PREFIX = 'temp_';

describe('webDetection config tests', () => {
    describe('match tree validation', () => {
        forEachWebDetectionConfig(({ configName, webDetection, detectors }) => {
            describe(configName, () => {
                for (const [
                    groupName,
                    group,
                ] of Object.entries(detectors)) {
                    for (const [
                        detectorId,
                        detector,
                    ] of Object.entries(group)) {
                        it(`${groupName}.${detectorId} match tree and payloads are well formed`, () => {
                            assertValidDetector(detector, `detectors.${groupName}.${detectorId}`);
                        });
                    }
                }

                it('detectors as patch operations leave them are well formed', () => {
                    forEachPatchedDetector(webDetection, (detector, path) => {
                        assertValidDetector(detector, path);
                        forEachDetectorTextCondition(detector, path, assertTextConditionExpressions);
                        forEachDetectorTextCondition(detector, path, (condition, conditionPath) => {
                            if (condition.xpathConfig !== undefined)
                                assertXPathConfig(condition.xpathConfig, `${conditionPath}/xpathConfig`);
                        });
                    });
                });
            });
        });

        it('exercises every generated config (sanity)', () => {
            expect(latestConfigs.length).to.be.greaterThan(0);
        });
    });

    describe('naming validation', () => {
        forEachWebDetectionConfig(({ configName, detectors }) => {
            describe(configName, () => {
                it('detector and group names should be named correctly', () => {
                    for (const [
                        groupName,
                        groupDetectors,
                    ] of Object.entries(detectors)) {
                        expect(groupName).to.match(NAME_PATTERN);
                        for (const detectorName of Object.keys(groupDetectors)) {
                            expect(detectorName).to.match(NAME_PATTERN);
                        }
                    }
                });
            });
        });
    });

    describe('eventHub cross-reference', () => {
        forEachWebDetectionConfig(({ configName, detectors }) => {
            describe(configName, () => {
                it('fireEvent.type values should have a corresponding eventHub consumer or metric event', () => {
                    const knownConsumers = eventHubConsumers(latestConfigs.find((c) => c.name === configName)?.body);
                    /**
                     * @param {Record<string, any>} detector
                     * @param {string} detectorPath
                     */
                    const check = (detector, detectorPath) => {
                        const type = detector.actions?.fireEvent?.type;
                        if (type === undefined || type.startsWith(TEMP_EVENT_TYPE_PREFIX)) return;
                        expect(knownConsumers.has(type)).to.equal(
                            true,
                            `Detector '${detectorPath}' fires event type '${type}' but no eventHub parameter source, immediate trigger source or experiment metric event consumes '${type}' (known consumers: ${[
                                ...knownConsumers,
                            ].join(', ')})`,
                        );
                    };
                    for (const [
                        groupName,
                        groupDetectors,
                    ] of Object.entries(detectors)) {
                        for (const [
                            detectorName,
                            detector,
                        ] of Object.entries(groupDetectors)) {
                            check(detector, `${groupName}.${detectorName}`);
                        }
                    }
                });
            });
        });

        it('counts the trigger source of an immediate_v2 entry as a consumer (self-test)', () => {
            const consumers = eventHubConsumers({
                features: {
                    eventHub: {
                        settings: {
                            telemetry: {
                                webTelemetry_example_immediate: {
                                    state: 'disabled',
                                    trigger: { type: 'immediate_v2', source: 'exampleEvent' },
                                    parameters: { value: { template: 'data', dataKey: 'value' } },
                                },
                                webTelemetry_counted_day: {
                                    state: 'enabled',
                                    trigger: { period: { seconds: 86400 } },
                                    parameters: { count: { template: 'counter', source: 'countedEvent', buckets: { '0+': { gte: 0 } } } },
                                },
                            },
                        },
                    },
                },
            });
            expect(
                [
                    ...consumers,
                ].sort(),
            ).to.deep.equal([
                'countedEvent',
                'exampleEvent',
            ]);
        });
    });

    describe('xpathConfig validation', () => {
        forEachWebDetectionConfig(({ configName, webDetection, detectors }) => {
            describe(configName, () => {
                for (const [
                    groupName,
                    group,
                ] of Object.entries(detectors)) {
                    for (const [
                        detectorId,
                        detector,
                    ] of Object.entries(group)) {
                        it(`${groupName}.${detectorId} xpathConfig values are within sensible bounds`, () => {
                            forEachDetectorTextCondition(detector, `detectors.${groupName}.${detectorId}`, (condition, path) => {
                                if (condition.xpathConfig !== undefined) {
                                    assertXPathConfig(condition.xpathConfig, `${path}/xpathConfig`);
                                }
                            });
                        });
                    }
                }

                it('xpathConfig patch operations are within sensible bounds', () => {
                    forEachPatchOperation(webDetection, assertXPathConfigPatch);
                });
            });
        });
    });

    describe('expression validation', () => {
        forEachWebDetectionConfig(({ configName, webDetection, detectors }) => {
            describe(configName, () => {
                for (const [
                    groupName,
                    group,
                ] of Object.entries(detectors)) {
                    for (const [
                        detectorId,
                        detector,
                    ] of Object.entries(group)) {
                        it(`${groupName}.${detectorId} xpath and pattern values are well formed`, () => {
                            forEachDetectorTextCondition(detector, `detectors.${groupName}.${detectorId}`, assertTextConditionExpressions);
                        });
                    }
                }

                it('xpath and pattern patch operations are well formed', () => {
                    forEachPatchOperation(webDetection, assertExpressionPatch);
                });
            });
        });
    });

    describe('element property tables', () => {
        it('match what the generator builds from the installed @webref packages', async function () {
            this.timeout(60000);
            expect(await buildTables()).to.deep.equal(
                PROPERTY_TABLES,
                'tests/data/element-property-tables.json is stale: run npm run generate-element-property-tables',
            );
        });

        it('carry the types the load-state recipes read', () => {
            expect(interfaceProperties('HTMLImageElement').get('naturalWidth')).to.equal('unsigned long');
            expect(interfaceProperties('HTMLImageElement').get('currentSrc')).to.equal('USVString');
            expect(interfaceProperties('HTMLLinkElement').get('sheet')).to.equal('CSSStyleSheet?');
            // Inherited from Element and Node
            expect(interfaceProperties('HTMLImageElement').get('tagName')).to.equal('DOMString');
            expect(interfaceProperties('HTMLImageElement').get('isConnected')).to.equal('boolean');
            // `unrestricted` is kept
            expect(interfaceProperties('HTMLMediaElement').get('duration')).to.equal('unrestricted double');
        });

        it('map tags to their interfaces, in every namespace', () => {
            expect(selectorInterfaces('img')).to.deep.equal([
                'HTMLImageElement',
            ]);
            expect(selectorInterfaces('a').sort()).to.deep.equal([
                'HTMLAnchorElement',
                'MathMLElement',
                'SVGAElement',
            ]);
            expect(selectorInterfaces('svg')).to.deep.equal([
                'SVGSVGElement',
            ]);
        });

        it('list the properties named like a reserved key, which config reads through the long form', () => {
            for (const entry of PROPERTY_TABLES.reservedNameProperties) {
                const property = entry.split('.').pop();
                expect(OPERATOR_KEYS.concat('field', 'is')).to.include(property);
            }
        });
    });

    describe('forEachTextCondition (self-test)', () => {
        /**
         * @param {unknown} match
         * @returns {string[]}
         */
        function collect(match) {
            /** @type {string[]} */
            const found = [];
            forEachTextCondition(match, '$', (condition) => found.push(String(condition.pattern)));
            return found;
        }

        it('reaches a plain text leaf', () => {
            expect(collect({ text: { pattern: 'a' } })).to.deep.equal([
                'a',
            ]);
        });

        it('reaches leaves through operator blocks at both levels', () => {
            const match = {
                all: [
                    {
                        text: {
                            any: [
                                { pattern: 'a' },
                                { pattern: 'b' },
                            ],
                        },
                    },
                    {
                        text: {
                            none: [
                                { pattern: 'c' },
                            ],
                        },
                    },
                ],
            };
            expect(collect(match)).to.deep.equal([
                'a',
                'b',
                'c',
            ]);
        });

        it('reaches leaves through arrays', () => {
            const match = [
                {
                    text: [
                        { pattern: 'a' },
                        { pattern: 'b' },
                    ],
                },
                { element: { selector: '.x' } },
            ];
            expect(collect(match)).to.deep.equal([
                'a',
                'b',
            ]);
        });

        it('ignores element conditions', () => {
            expect(collect({ element: { selector: '.x' } })).to.deep.equal([]);
        });

        it('reaches text under operators, if branches and predicate operands', () => {
            const match = {
                all: [
                    { text: { pattern: 'a' }, using: 'length', is: { gte: 1 } },
                    {
                        if: {
                            test: { text: { pattern: 'b' } },
                            then: { text: { pattern: 'c' }, using: 'length' },
                            else: { text: { pattern: 'd' }, using: 'length' },
                        },
                        is: { gt: { text: { pattern: 'e' }, using: 'length' } },
                    },
                    {
                        element: { selector: 'img', where: { naturalWidth: { gt: { text: { pattern: 'f' }, using: 'length' } } } },
                        using: 'length',
                        is: 0,
                    },
                ],
            };
            expect(collect(match)).to.deep.equal([
                'a',
                'b',
                'c',
                'd',
                'e',
                'f',
            ]);
        });

        it('reaches text in source roots', () => {
            const match = {
                all: [
                    { element: { selector: 'img', root: { only: { text: { pattern: 'a' } } } } },
                    {
                        element: {
                            selector: 'p',
                            root: { if: { test: { text: { pattern: 'b' } }, then: { ref: 'x' }, else: { ref: 'y' } } },
                        },
                        using: 'length',
                    },
                ],
            };
            expect(collect(match)).to.deep.equal([
                'a',
                'b',
            ]);
        });

        it('does not mistake a property named text in `where` for a source', () => {
            expect(collect({ element: { selector: 'option', where: { text: 'Sign in' } } })).to.deep.equal([]);
        });

        it('reaches text in payload values, when and buckets', () => {
            /** @type {string[]} */
            const found = [];
            const detector = {
                match: true,
                actions: {
                    fireEvent: {
                        type: 't',
                        data: {
                            a: {
                                value: { text: { pattern: 'a' }, using: 'length' },
                                when: { gt: { text: { pattern: 'b' }, using: 'length' } },
                            },
                            c: { value: 1, buckets: { x: { lt: { text: { pattern: 'c' }, using: 'length' } } } },
                        },
                    },
                    breakageReportData: { data: { d: { value: { text: { pattern: 'd' }, using: 'length' } } } },
                },
            };
            forEachDetectorTextCondition(detector, '$', (condition) => found.push(String(condition.pattern)));
            expect(found).to.deep.equal([
                'a',
                'b',
                'c',
                'd',
            ]);
        });

        it('finds the text conditions in the real configs (sanity)', () => {
            /** @type {string[]} */
            const found = [];
            forEachWebDetectionConfig(({ detectors }) => {
                for (const group of Object.values(detectors)) {
                    for (const detector of Object.values(group)) {
                        forEachTextCondition(detector.match, '$', (condition) => found.push(String(condition.pattern)));
                    }
                }
            });
            expect(found.length).to.be.greaterThan(0);
        });
    });

    describe('xpathConfig validation (self-test)', () => {
        /**
         * @param {Record<string, unknown>} xpathConfig
         */
        const check = (xpathConfig) => () => assertXPathConfig(xpathConfig, '$');

        it('accepts an in-bounds config', () => {
            expect(check({ chunkSize: 8192, chunkTail: 512 })).to.not.throw();
        });

        it('accepts chunkSize 0, which disables chunking', () => {
            expect(check({ chunkSize: 0 })).to.not.throw();
            // The tail is unused once chunking is off, so the ratio does not apply
            expect(check({ chunkSize: 0, chunkTail: 99999 })).to.not.throw();
        });

        it('accepts chunkTail 0', () => {
            expect(check({ chunkSize: 8192, chunkTail: 0 })).to.not.throw();
        });

        it('rejects non-integer and negative values', () => {
            expect(check({ chunkSize: 8192.5 })).to.throw();
            expect(check({ chunkSize: -1 })).to.throw();
            expect(check({ chunkTail: '512' })).to.throw();
        });

        it('rejects a non-zero chunkSize below the floor', () => {
            expect(check({ chunkSize: 32 })).to.throw();
        });

        it('rejects a chunkTail above a quarter of chunkSize', () => {
            expect(check({ chunkSize: 8192, chunkTail: 2049 })).to.throw();
            expect(check({ chunkSize: 8192, chunkTail: 2048 })).to.not.throw();
        });

        it('checks a lone chunkTail in isolation, since the ratio needs a chunkSize', () => {
            expect(check({ chunkTail: 99999 })).to.not.throw();
            expect(check({ chunkTail: -1 })).to.throw();
        });
    });

    describe('expression validation (self-test)', () => {
        /** @param {unknown} expression */
        const checkXPath = (expression) => () => assertValidXPath(expression, '$');

        /** @param {unknown} pattern */
        const checkPattern = (pattern) => () => assertValidPattern(pattern, '$');

        it('accepts XPath expressions of the shape detectors use', () => {
            expect(checkXPath('//div//text()')).to.not.throw();
            expect(checkXPath('//*[@class="banner"]//text()')).to.not.throw();
            expect(checkXPath('//div[contains(@id, "consent")]')).to.not.throw();
        });

        it('rejects malformed XPath expressions', () => {
            expect(checkXPath('//div[')).to.throw();
            expect(checkXPath('//div[@class="a"')).to.throw();
            expect(checkXPath('')).to.throw();
        });

        it('rejects a non-string XPath expression', () => {
            expect(checkXPath(42)).to.throw();
            expect(checkXPath(null)).to.throw();
        });

        it('accepts a single pattern and an array of them', () => {
            expect(checkPattern('foo')).to.not.throw();
            expect(
                checkPattern([
                    'foo',
                    'bar(baz)?',
                ]),
            ).to.not.throw();
        });

        it('rejects a malformed pattern', () => {
            expect(checkPattern('foo(')).to.throw();
            expect(checkPattern('[a-')).to.throw();
        });

        it('rejects entries that are only valid as a pair', () => {
            expect(
                checkPattern([
                    'a(',
                    'b)',
                ]),
            ).to.throw();
        });

        it('rejects a non-string pattern entry', () => {
            expect(
                checkPattern([
                    'foo',
                    7,
                ]),
            ).to.throw();
        });

        it('checks both keys of a text leaf', () => {
            expect(() => assertTextConditionExpressions({ pattern: 'foo', xpath: '//div//text()' }, '$')).to.not.throw();
            expect(() => assertTextConditionExpressions({ pattern: 'foo(', xpath: '//div//text()' }, '$')).to.throw();
            expect(() => assertTextConditionExpressions({ pattern: 'foo', xpath: '//div[' }, '$')).to.throw();
            expect(() => assertTextConditionExpressions({ pattern: 'foo' }, '$')).to.not.throw();
        });

        it('checks every entry of an xpath array', () => {
            expect(() =>
                assertTextConditionExpressions(
                    {
                        pattern: 'foo',
                        xpath: [
                            '//div//text()',
                            '//span[',
                        ],
                    },
                    '$',
                ),
            ).to.throw();
        });
    });

    describe('expression patch validation (self-test)', () => {
        /** @param {Record<string, any>} operation */
        const check = (operation) => () => assertExpressionPatch(operation, '$');

        it('checks a patched xpath value', () => {
            expect(check({ op: 'replace', path: '/detectors/g/d/match/text/xpath', value: '//div//text()' })).to.not.throw();
            expect(check({ op: 'replace', path: '/detectors/g/d/match/text/xpath', value: '//div[' })).to.throw();
        });

        it('checks every entry of a patched xpath array', () => {
            expect(
                check({
                    op: 'replace',
                    path: '/detectors/g/d/match/text/xpath',
                    value: [
                        '//div//text()',
                        '//span[',
                    ],
                }),
            ).to.throw();
        });

        it('checks a patched single xpath array entry', () => {
            expect(check({ op: 'replace', path: '/detectors/g/d/match/text/xpath/1', value: '//div[' })).to.throw();
        });

        it('checks a patched pattern value', () => {
            expect(check({ op: 'add', path: '/detectors/g/d/match/text/pattern', value: 'foo' })).to.not.throw();
            expect(check({ op: 'add', path: '/detectors/g/d/match/text/pattern', value: 'foo(' })).to.throw();
        });

        it('ignores removals and unrelated paths', () => {
            expect(check({ op: 'remove', path: '/detectors/g/d/match/text/xpath' })).to.not.throw();
            expect(check({ op: 'replace', path: '/detectors/g/d/state', value: 'disabled' })).to.not.throw();
        });

        it('does not mistake xpathConfig for an xpath value', () => {
            expect(check({ op: 'replace', path: '/detectors/g/d/match/text/xpathConfig', value: { chunkSize: 8192 } })).to.not.throw();
        });
    });

    describe('validateDetector (self-test)', () => {
        /**
         * @param {unknown} match
         * @param {Record<string, unknown>} [data]
         */
        const errorsOf = (match, data) =>
            validateDetector({ match, ...(data ? { actions: { fireEvent: { type: 't', data } } } : {}) }, '$');

        /**
         * @param {unknown} match
         * @param {Record<string, unknown>} [data]
         */
        const expectValid = (match, data) => {
            const errors = errorsOf(match, data);
            expect(errors, errors.join('\n')).to.deep.equal([]);
        };

        /**
         * @param {string} fragment - text one of the errors contains
         * @param {unknown} match
         * @param {Record<string, unknown>} [data]
         */
        const expectError = (fragment, match, data) => {
            const errors = errorsOf(match, data);
            expect(
                errors.some((error) => error.includes(fragment)),
                `expected an error containing ${JSON.stringify(fragment)}, got:\n${errors.join('\n') || '(none)'}`,
            ).to.equal(true);
        };

        const img = { element: { selector: 'img' } };
        const imgCount = { ...img, using: 'length' };
        const loadEventEnd = {
            api: {
                path: 'performance.getEntriesByType',
                args: [
                    'navigation',
                ],
                field: 'loadEventEnd',
            },
        };
        const now = { api: { path: 'performance.now', args: [] } };
        const title = { api: { path: 'document.title' } };
        const guard = {
            element: {
                selector: [
                    '#comments',
                ],
            },
            as: 'comments',
        };
        const rootedImages = { element: { selector: 'img', root: { ref: 'comments' } }, using: 'length' };
        const text = { text: { pattern: 'a' } };

        /**
         * A count of the elements matching a selector that pass `where`.
         *
         * @param {string} selector
         * @param {unknown} where
         */
        const items = (selector, where) => ({ element: { selector, where }, using: 'length', is: 0 });

        /**
         * @param {string} selector
         * @param {unknown} field
         */
        const fieldOf = (selector, field) => ({ element: { selector, field } });

        /**
         * A predicate testing the value with `Number.isFinite` or `Number.isNaN`, passed it through `self`.
         *
         * @param {'isFinite' | 'isNaN'} name
         * @param {boolean} [expected]
         */
        const numberTest = (name, expected = true) => ({
            field: {
                api: {
                    path: `Number.${name}`,
                    args: [
                        { self: {} },
                    ],
                },
            },
            is: expected,
        });

        describe('shape', () => {
            it('passes the shipped forms: leaves, legacy blocks, arrays and boolean literals', () => {
                expectValid({ text: { pattern: 'foo' } });
                expectValid({
                    text: {
                        all: [
                            { pattern: 'foo' },
                            { pattern: 'bar' },
                        ],
                    },
                });
                expectValid({
                    text: {
                        all: [
                            {
                                any: [
                                    { pattern: 'a' },
                                    { pattern: 'b' },
                                ],
                            },
                            {
                                none: [
                                    { pattern: 'c' },
                                ],
                            },
                        ],
                    },
                });
                expectValid([
                    { text: { pattern: 'a' } },
                    { element: { selector: '.x', visibility: 'visible' } },
                ]);
                expectValid({
                    any: [
                        true,
                        false,
                    ],
                });
            });

            it('passes an object mixing operator keys with leaf keys at the match level, which ANDs them', () => {
                expectValid({
                    all: [
                        { text: { pattern: 'foo' } },
                    ],
                    text: { pattern: 'bar' },
                });
            });

            it('rejects mixing operator and body keys inside a source body', () => {
                expectError('mixes operator keys', {
                    text: {
                        all: [
                            { pattern: 'foo' },
                        ],
                        pattern: 'bar',
                    },
                });
                expectError('mixes operator keys', {
                    text: [
                        { pattern: 'ok' },
                        {
                            all: [
                                { pattern: 'foo' },
                            ],
                            pattern: 'bar',
                        },
                    ],
                });
            });

            it('rejects legacy blocks over bodies outside boolean position', () => {
                expectError('boolean only', {
                    text: {
                        any: [
                            { pattern: 'a' },
                        ],
                    },
                    using: 'length',
                    is: { gt: 0 },
                });
            });

            it('rejects unknown expression, body, field and payload field keys', () => {
                expectError('unknown expression key "aggregate"', { aggregate: imgCount });
                expectError('unknown source body key "selector"', {
                    api: { path: 'document.fonts', selector: '#a' },
                    using: 'length',
                    is: 0,
                });
                expectError('unknown source body key "where"', { text: { pattern: 'a', where: {} } });
                expectError('unknown source body key "allowGetter"', { text: { pattern: 'a', allowGetter: true } });
                expectError('unknown `field` key', { ...fieldOf('img', { name: 'src' }), is: {} });
                expectError('unknown payload field key', true, { a: { value: 1, bucket: {} } });
            });

            it('places an object of several expression keys, an AND, in boolean and value position, never beside `is`', () => {
                expectValid(true, { a: { value: { text: { pattern: 'a' }, element: { selector: 'img' } } } });
                expectError('several expression keys', {
                    sum: [
                        { text: { pattern: 'a' }, element: { selector: 'img' } },
                    ],
                    is: { gt: 0 },
                });
                expectError('several expression keys', { text: { pattern: 'a' }, element: { selector: 'img' }, is: {} });
            });

            it('rejects `is` outside boolean position', () => {
                expectError('`is` gives a boolean', true, { a: { value: { ...img, using: 'length', is: { gt: 0 } } } });
            });

            it('checks `div` takes two operands', () => {
                expectValid({
                    div: [
                        now,
                        1,
                    ],
                    is: { gt: 0 },
                });
                expectError('two operands', {
                    div: [
                        now,
                        1,
                        2,
                    ],
                    is: { gt: 0 },
                });
                expectError('two operands', { div: now, is: { gt: 0 } });
            });

            it('checks `if` has exactly `test`, `then` and `else`', () => {
                expectValid({ if: { test: true, then: 1, else: 2 }, is: 1 });
                expectError('missing [else]', { if: { test: true, then: 1 }, is: 1 });
                expectError('extra [otherwise]', { if: { test: true, then: 1, else: 2, otherwise: 3 }, is: 1 });
            });

            it('rejects `catch`', () => {
                expectError('unknown expression key "catch"', { ...imgCount, catch: { absent: 0 }, is: { gt: 0 } });
            });

            it('checks `field` has a read key, and `args` only with `path`', () => {
                expectError('needs at least one', { ...fieldOf('img', {}), is: {} });
                expectError('needs `path`', { ...fieldOf('img', { args: [] }), is: {} });
            });
        });

        describe('names', () => {
            it('rejects a duplicate `as`, in match or payloads', () => {
                expectError('already used', {
                    all: [
                        { ...imgCount, as: 'images', is: { gt: 0 } },
                        { ...imgCount, as: 'images', is: { lt: 9 } },
                    ],
                });
                expectError('already used', { ...imgCount, as: 'images', is: { gt: 0 } }, { a: { value: { ...imgCount, as: 'images' } } });
            });

            it('rejects an `as` or `ref` not matching the name pattern', () => {
                expectError('does not match', { ...imgCount, as: '1images', is: { gt: 0 } });
                expectError('does not match', { ref: 'not-a-name', is: 0 });
            });

            it('rejects an unresolved ref', () => {
                expectError('names no expression', { ref: 'missing', is: 0 });
            });

            it('rejects a cycle of refs', () => {
                expectError('cycle', {
                    sum: [
                        { ref: 'a' },
                        1,
                    ],
                    as: 'a',
                    is: { gt: 0 },
                });
                expectError('cycle', {
                    all: [
                        {
                            sum: [
                                now,
                                { ref: 'b' },
                            ],
                            as: 'a',
                            is: { gt: 0 },
                        },
                        {
                            div: [
                                { ref: 'a' },
                                1,
                            ],
                            as: 'b',
                            is: { gt: 0 },
                        },
                    ],
                });
            });

            it('rejects a ref in match into an `if` branch from outside it', () => {
                const ifExpr = { if: { test: { ...imgCount, is: { gt: 0 } }, then: { ...imgCount, as: 'inner' }, else: 0 }, is: { gt: 0 } };
                expectError('from outside it', {
                    all: [
                        ifExpr,
                        { ref: 'inner', is: { gt: 1 } },
                    ],
                });
                expectValid({
                    if: {
                        test: true,
                        then: {
                            all: [
                                { ...imgCount, as: 'inner', is: { gt: 0 } },
                                { ref: 'inner', is: { lt: 5 } },
                            ],
                        },
                        else: false,
                    },
                });
                expectValid(ifExpr, { inner: { value: { ref: 'inner' } } });
            });

            it('reads a ref in the ref’s own position', () => {
                expectValid({ ...img, as: 'images' }, { images: { value: { ref: 'images', using: 'length' } } });
                expectValid({
                    all: [
                        { ...imgCount, as: 'images', is: { gte: 5 } },
                        { ref: 'images', is: { gte: 5 } },
                    ],
                });
                expectError('which its target does not fill', {
                    all: [
                        { ...imgCount, as: 'images', is: { gte: 5 } },
                        { ref: 'images' },
                    ],
                });
            });
        });

        describe('placement', () => {
            it('rejects literals outside their positions', () => {
                expectError('A number fills', 1);
                expectError('A boolean fills', {
                    sum: [
                        true,
                        1,
                    ],
                    is: { gt: 0 },
                });
            });

            it('takes string and null literals in value position only', () => {
                expectError('A string fills', 'x');
                expectError('`null` fills', [
                    null,
                ]);
                expectError('A string fills', {
                    sum: [
                        'x',
                        1,
                    ],
                    is: { gt: 0 },
                });
                expectError('A string fills', { only: 'x', is: 1 });
                expectError('A string fills', { element: { selector: 'p' }, using: 'length', is: { gt: 'x' } });
                expectValid(true, {
                    word: { value: { if: { test: true, then: 'yes', else: 'no' } } },
                    state: { value: { if: { test: false, then: 'x', else: null } } },
                });
                expectValid({ api: { path: 'document.readyState' }, is: { eq: { api: { path: 'document.readyState' } } } });
            });

            it('places every source and boolean expression in value position', () => {
                expectValid(true, {
                    matched: { value: text, buckets: { some: { length: { gt: 0 } } } },
                    image: { value: img, buckets: { some: { length: { gt: 0 } } } },
                    either: {
                        value: {
                            any: [
                                text,
                                img,
                            ],
                        },
                    },
                    or: {
                        value: [
                            text,
                            img,
                        ],
                    },
                    always: { value: true },
                });
                // `length` on a selected list counts its items: here, the text's matches
                expectValid({ ...text, is: { length: { gt: 0 } } });
                expectValid({ only: { element: { selector: 'input' } }, is: { hidden: false } });
            });

            it('rejects a selected list in a payload without buckets', () => {
                expectError('sent through `buckets`', true, { matched: { value: text } });
                expectError('sent through `buckets`', { ...img, as: 'images' }, { image: { value: { ref: 'images' } } });
                expectValid({ ...img, as: 'images' }, { image: { value: { ref: 'images', using: 'length' } } });
                expectValid(true, { width: { value: fieldOf('img', 'naturalWidth'), buckets: { wide: { gt: 100 } } } });
            });

            it('places `text` and `element` without `field` in list position', () => {
                expectValid({ only: text, is: { length: { gt: 0 } } });
                expectValid({ only: img, is: { field: { path: 'tagName' }, is: 'IMG' } });
                expectValid({ ...text, using: 'length', is: { gt: 0 } });
            });

            it('rejects `text` and `element` without `field` in number position', () => {
                expectError('config types the value as string', {
                    div: [
                        text,
                        1,
                    ],
                    is: { gt: 0 },
                });
                expectError('config types the value as object', {
                    div: [
                        img,
                        1,
                    ],
                    is: { gt: 0 },
                });
            });

            it('places a bare `api` in boolean position, and keeps `element` with `field`, `api` with `where` and a length out of it', () => {
                expectValid({ api: { path: 'document.hidden' } });
                expectValid({
                    api: {
                        path: 'matchMedia',
                        args: [
                            '(prefers-reduced-motion: reduce)',
                        ],
                        field: 'matches',
                    },
                });
                expectError('`element` with `field` fills', fieldOf('img', 'complete'));
                expectError('`api` with `where` fills', { api: { path: 'document.fonts', where: { status: 'error' } } });
                expectError('boolean position takes a boolean, and config types the value as number', imgCount);
                expectError('boolean position takes a boolean, and config types the value as number', {
                    only: img,
                    using: 'naturalWidth',
                });
            });

            it('places lists of values under operators', () => {
                expectValid({ all: fieldOf('img', 'complete') });
                expectValid({ sum: fieldOf('img', 'naturalWidth'), is: { gt: 100 } });
                expectError('`all` takes booleans', { all: fieldOf('img', 'naturalWidth') });
                expectError('`sum` takes numbers', { sum: fieldOf('img', 'src'), is: { gt: 0 } });
                expectError('number position takes a number', {
                    div: [
                        fieldOf('img', 'src'),
                        1,
                    ],
                    is: { gt: 0 },
                });
            });

            it('places `only` over lists only', () => {
                expectValid({ only: fieldOf('img', 'naturalWidth'), is: { gt: 0 } });
                expectValid({ only: { api: { path: 'document.fonts' } }, is: { field: 'status', is: 'loaded' } });
                expectValid({
                    div: [
                        { only: fieldOf('img', 'naturalWidth') },
                        1,
                    ],
                    is: { gt: 0 },
                });
                expectError('`using` `length` fills', { only: imgCount, is: { gt: 0 } });
                expectError('A number fills', { only: 1, is: 0 });
                expectError('`if` fills', { only: { if: { test: true, then: img, else: img } }, is: 0 });
                expectError('`only` fills', { only: img });
                expectError('number position takes a number, and config types the value as string', {
                    div: [
                        { only: fieldOf('img', 'src') },
                        1,
                    ],
                    is: { gt: 0 },
                });
            });

            it('spreads sources under operators, with presence leaves booleans under `any`, `all` and `none`', () => {
                expectValid({
                    any: [
                        img,
                        text,
                    ],
                });
                expectValid({
                    sum: [
                        fieldOf('img', 'naturalWidth'),
                        loadEventEnd,
                    ],
                    is: { gt: 0 },
                });
                expectError('`sum` takes numbers, and config types the values as object', { sum: img, is: { gt: 0 } });
                expectError('`mul` takes numbers, and config types the values as string', { mul: text, is: { gt: 0 } });
            });

            it('tests a selected list’s one item under a predicate that compares, and the list as an array under any other', () => {
                expectValid({ element: { selector: 'body', field: { feature: 'renderedTextLength' } }, is: { lt: 2000 } });
                expectValid({ ...img, is: { length: { gte: 5 } } });
                expectValid({ ...img, is: { type: 'array' } });
                expectError('guard it', { ...fieldOf('img', 'src'), is: { gt: 3 } });
                expectError('guard it', {
                    ...img,
                    is: {
                        any: [
                            { gt: 0 },
                        ],
                    },
                });
                expectError('reads "length" on a value config types as number', {
                    ...fieldOf('img', 'naturalWidth'),
                    is: { length: 2, gt: 0 },
                });
                expectError('reads "naturalWidth" on a list', { ...img, is: { naturalWidth: 0 } });
                expectValid(true, { images: { value: img, buckets: { many: { length: { gte: 5 } } }, when: { length: { gt: 1 } } } });
                expectError('guard it', true, { images: { value: img, buckets: { many: { length: { gte: 5 } } }, when: { gt: 1 } } });
                expectError('guard it', true, { sources: { value: fieldOf('img', 'src'), buckets: { long: { gt: 100 } } } });
            });

            it('checks each `field` step suits the type the previous one gives', () => {
                expectValid(items('img', { 'currentSrc.length': { gt: 0 } }));
                expectValid(items('link', { 'sheet.cssRules': { exists: true } }));
                expectError('reads "length" on a value config types as number', items('img', { 'naturalWidth.length': 0 }));
                expectError('reads "foo" on a value config types as string', items('img', { 'src.foo': 0 }));
            });

            it('checks a feature’s input type', () => {
                expectValid({
                    api: { path: 'document', field: { path: 'title', feature: 'wordCount' } },
                    is: { lte: 3 },
                });
                expectValid({ element: { selector: 'body', field: { feature: 'renderedTextLength' } }, is: { lt: 1 } });
                expectError('wordCount takes a string', {
                    ...fieldOf('img', { path: 'naturalWidth', feature: 'wordCount' }),
                    is: { lt: 1 },
                });
                expectError('renderedTextLength takes an element', {
                    ...fieldOf('img', { path: 'src', feature: 'renderedTextLength' }),
                    is: { lt: 1 },
                });
                expectError('unknown feature', { ...fieldOf('img', { feature: 'textLength' }), is: { lt: 1 } });
            });
        });

        describe('`api` names and data reads', () => {
            it('rejects `allowGetter`, which is no source body or `field` key', () => {
                expectError('unknown source body key "allowGetter"', {
                    element: { selector: 'img', allowGetter: true, where: { complete: true } },
                    using: 'length',
                    is: 0,
                });
                expectError('unknown source body key "allowGetter"', {
                    api: { path: 'document.title', allowGetter: true },
                    is: { type: 'string' },
                });
                expectError('unknown `field` key "allowGetter"', {
                    ...fieldOf('img', { path: 'naturalWidth', allowGetter: true }),
                    is: { gt: 0 },
                });
            });

            it('checks expression `args`, and the calls config can type', () => {
                const widths = fieldOf('img', 'naturalWidth');
                const maxOf = (/** @type {unknown} */ list) => ({
                    api: {
                        path: 'Math.max.apply',
                        args: [
                            null,
                            list,
                        ],
                    },
                });
                expectValid({ ...maxOf(widths), is: { gt: 100 } });
                expectValid({
                    ...maxOf({
                        ...widths,
                        using: {
                            path: 'concat',
                            args: [
                                100,
                            ],
                        },
                    }),
                    is: { gt: 0 },
                });
                expectValid({
                    ...maxOf({
                        api: {
                            path: 'performance.getEntriesByType',
                            args: [
                                'resource',
                            ],
                            field: 'duration',
                        },
                    }),
                    is: { gt: 0 },
                });
                expectValid({
                    ...maxOf([
                        1,
                        { ...img, using: 'length' },
                    ]),
                    is: { gt: 0 },
                });
                expectValid({
                    all: [
                        { ...imgCount, as: 'images', is: { gt: 0 } },
                        {
                            api: {
                                path: 'Math.max',
                                args: [
                                    { ref: 'images' },
                                    1,
                                ],
                            },
                            is: { gt: 0 },
                        },
                    ],
                });
                expectError('`apply` takes its arguments as a selected list', { ...maxOf(5), is: {} });
                expectError('`apply` takes its arguments as a selected list', { ...maxOf({ api: { path: 'document.title' } }), is: {} });
                expectError('`Math.max` takes numbers, and config types the value as string', { ...maxOf(fieldOf('img', 'src')), is: {} });
                expectError('`Math.max.apply` takes a list', {
                    api: {
                        path: 'Math.max',
                        args: [
                            widths,
                        ],
                    },
                    is: {},
                });
                expectError('boolean position takes a boolean, and config types the value as number', maxOf(widths));
                expectError('reads the method "Math.max" without calling it', { api: { path: 'Math.max' }, is: {} });
                expectError('unknown expression key "composed"', {
                    api: {
                        path: 'Math.max',
                        args: [
                            { composed: true },
                        ],
                    },
                    is: {},
                });
                expectError('`args` is an array', { api: { path: 'Math.max', args: 1 }, is: {} });
                expectError('does not parse', {
                    api: {
                        path: 'JSON.parse',
                        args: [
                            '{',
                        ],
                    },
                    is: {},
                });
            });

            it('reads a method as a function in an `args` entry, named as its own call', () => {
                expectValid({
                    api: {
                        path: 'Math.max',
                        args: [
                            { api: { path: 'performance.now' } },
                        ],
                    },
                    is: {},
                });
                expectError('"Math.round", which is not in API_ALLOWLIST', {
                    api: {
                        path: 'Math.max',
                        args: [
                            { api: { path: 'Math.round' } },
                        ],
                    },
                    is: {},
                });
                expectError('reads the method "performance.now" without calling it', {
                    api: {
                        path: 'Math.max',
                        args: [
                            { only: { api: { path: 'performance.now' } } },
                        ],
                    },
                    is: {},
                });
            });

            it('checks `api` names are read as the kind API_ALLOWLIST records', () => {
                expectError('reads the method "performance.now" without calling it', { api: { path: 'performance.now' }, is: {} });
                expectError('calls "document.title", which API_ALLOWLIST records as a property', {
                    api: { path: 'document.title', args: [] },
                    is: {},
                });
                expectError('reads the method "performance.getEntriesByType" without calling it', {
                    api: { path: 'performance', field: 'getEntriesByType.length' },
                    is: {},
                });
            });

            it('reads `length` and indexes on strings', () => {
                expectValid({ only: text, is: { length: 1 } });
                expectValid({ only: text, is: { 0: 'a' } });
            });

            it('reads page-defined values under names outside the tables on custom elements only', () => {
                expectValid({ only: { element: { selector: 'x-widget' } }, is: { value: 3 } });
                expectError('"value" is not a property of HTMLDivElement', { only: { element: { selector: 'div' } }, is: { value: 3 } });
            });
        });

        describe('calls on element items', () => {
            it('admits methods on ELEMENT_METHOD_ALLOWLIST only', () => {
                expectValid({
                    element: {
                        selector: 'div',
                        where: {
                            field: {
                                path: 'getAttribute',
                                args: [
                                    'role',
                                ],
                            },
                            is: 'dialog',
                        },
                    },
                    using: 'length',
                    is: { gt: 0 },
                });
                expectError('not in ELEMENT_METHOD_ALLOWLIST', {
                    element: { selector: 'button', where: { field: { path: 'click', args: [] }, is: true } },
                    using: 'length',
                    is: 0,
                });
                expectError('not an element', items('img', { field: { path: 'src.toString', args: [] }, is: 'x' }));
            });
        });

        describe('`root` guard', () => {
            it('passes a guard ahead of the scoped expression', () => {
                expectValid(
                    {
                        all: [
                            guard,
                            { ...rootedImages, is: { lt: 1 } },
                        ],
                    },
                    { images: { value: rootedImages } },
                );
                expectValid({
                    all: [
                        { element: { selector: '#comments', visibility: 'visible', where: { hidden: false } }, as: 'comments' },
                        { ...rootedImages, is: { lt: 1 } },
                    ],
                });
            });

            it('checks each entry of an array root for a guard', () => {
                const sidebar = { element: { selector: '#sidebar' }, as: 'sidebar' };
                const scoped = (/** @type {unknown} */ root) => ({ element: { selector: 'img', root }, using: 'length', is: { lt: 1 } });
                expectValid({
                    all: [
                        guard,
                        sidebar,
                        scoped([
                            { ref: 'comments' },
                            { ref: 'sidebar' },
                        ]),
                    ],
                });
                expectError('root[1]', {
                    all: [
                        guard,
                        scoped([
                            { ref: 'comments' },
                            '#sidebar',
                        ]),
                    ],
                });
            });

            it('passes a scoped leaf read only in boolean position with no `none` above it', () => {
                expectValid({
                    element: {
                        selector: 'img',
                        root: [
                            '#comments',
                        ],
                    },
                });
                expectValid({ element: { selector: 'img', root: { element: { selector: '#comments' } } } });
            });

            it('rejects a scoped expression with no guard, or a guard behind it', () => {
                expectError('needs a guard', {
                    all: [
                        { element: { selector: 'img', root: '#comments' }, using: 'length', is: { lt: 1 } },
                    ],
                });
                expectError('needs a guard', {
                    all: [
                        { element: { selector: 'img', root: { element: { selector: '#comments' } } }, using: 'length', is: { lt: 1 } },
                    ],
                });
                expectError('needs a guard', {
                    all: [
                        { ...rootedImages, is: { lt: 1 } },
                        guard,
                    ],
                });
                expectError('needs a guard', {
                    all: [
                        { any: guard },
                        { ...rootedImages, is: { lt: 1 } },
                    ],
                });
                expectError(
                    'needs a guard',
                    { ...guard, as: 'region' },
                    { images: { value: { element: { selector: 'img', root: '#comments' }, using: 'length' } } },
                );
            });

            it('rejects a scoped leaf under `none`, or read through a ref, with no guard', () => {
                expectError('needs a guard', {
                    none: [
                        {
                            element: {
                                selector: 'img',
                                root: [
                                    '#comments',
                                ],
                            },
                        },
                    ],
                });
                expectError(
                    'needs a guard',
                    {
                        element: {
                            selector: 'img',
                            root: [
                                '#comments',
                            ],
                        },
                        as: 'images',
                    },
                    { n: { value: { ref: 'images', using: 'length' } } },
                );
            });

            it('requires `is` on a guard that is not an `element` or `text` source', () => {
                const shadowRoot = { only: { element: { selector: 'my-widget' } }, using: 'shadowRoot', as: 'shadow' };
                const shadowImages = { element: { selector: 'img', root: { ref: 'shadow' } }, using: 'length', is: { lt: 1 } };
                expectError('carries `is`', {
                    all: [
                        shadowRoot,
                        shadowImages,
                    ],
                });
                expectValid({
                    all: [
                        { ...shadowRoot, is: { type: 'object' } },
                        shadowImages,
                    ],
                });
            });

            it('rejects a scoped XPath expression that selects from the document', () => {
                expectError('starts ".//"', {
                    text: {
                        pattern: 'a',
                        xpath: '//p//text()',
                        root: [
                            '#comments',
                        ],
                    },
                });
                expectValid({
                    text: {
                        pattern: 'a',
                        xpath: './/p//text()',
                        root: [
                            '#comments',
                        ],
                    },
                });
            });
        });

        describe('predicates', () => {
            it('rejects `field` without `is`, and `is` without `field`', () => {
                expectError('go together', items('img', { field: 'src' }));
                expectError('go together', items('img', { is: true }));
            });

            it('rejects an unknown type name', () => {
                expectError('unknown type name', { ...loadEventEnd, is: { type: 'integer' } });
            });

            it('rejects predicates that never hold for a read value', () => {
                expectError('stands alone', { ...loadEventEnd, is: { exists: false, gt: 0 } });
                expectError('also lists string, null', {
                    ...loadEventEnd,
                    is: {
                        type: [
                            'string',
                            'null',
                        ],
                        gt: 0,
                    },
                });
                expectError('leaves out number', { ...loadEventEnd, is: { type: 'string', ...numberTest('isFinite') } });
                expectValid({ only: loadEventEnd, is: { exists: false } });
                expectValid({ ...loadEventEnd, is: { type: 'number', gt: 0 } });
            });

            it('checks `fails` is a boolean, and `"fails": true` reads no value', () => {
                expectValid({ ...loadEventEnd, is: { fails: false, gt: 0 } });
                expectValid({ ...loadEventEnd, is: { exists: true, fails: true } });
                expectValid({ ...loadEventEnd, is: { fails: true } });
                expectValid(items('link', { sheet: { fails: false } }));
                expectError('is a boolean', { ...loadEventEnd, is: { fails: 1 } });
                expectError('the failed value, which aborts', { ...loadEventEnd, is: { fails: true, gt: 0 } });
            });

            it('checks operators suit an element property’s type', () => {
                expectError('guard it', items('input', { selectionStart: { gt: 0 } }));
                expectError('guard it', items('img', { src: { gt: 0 } }));
                expectValid(items('input', { selectionStart: { type: 'number', gt: 0 } }));
                expectValid(items('input', { selectionStart: { ...numberTest('isFinite'), gt: 0 } }));
                expectError('guard it', items('input', { selectionStart: { gt: 0, ...numberTest('isFinite') } }));
                expectError('guard it', items('input', { selectionStart: { ...numberTest('isFinite', false), gt: 0 } }));
                expectValid(items('link', { sheet: null }));
            });

            it('checks property names per tag, and against every element interface when the selector names none', () => {
                expectError('"naturalwidth" is not a property of HTMLImageElement', items('img', { naturalwidth: 0 }));
                expectError('is not a property of HTMLDivElement', items('div.card', { naturalWidth: 0 }));
                expectValid(items('.card', { naturalWidth: 0 }));
                expectValid(items('x-widget', { hidden: false }));
            });

            it('rejects a property path on a value typed as a number', () => {
                expectError('reads "length" on a value config types as number', { ...imgCount, is: { length: 0 } });
            });

            it('requires `Number.isFinite` or `Number.isNaN` beside a comparison under `none` on a value that can be NaN', () => {
                const ratio = {
                    div: [
                        imgCount,
                        2,
                    ],
                };
                expectError('can be NaN', {
                    none: [
                        { ...ratio, is: { gt: 0 } },
                    ],
                });
                expectError('can be NaN', { ...ratio, is: { none: { gt: 0 } } });
                expectError('can be NaN', items('video', { none: { duration: { gt: 10 } } }));
                expectValid({
                    none: [
                        { ...ratio, is: { ...numberTest('isFinite'), gt: 0 } },
                    ],
                });
                expectValid(items('video', { none: { duration: { ...numberTest('isNaN', false), gt: 10 } } }));
                expectValid({ ...ratio, is: { gt: 0 } });
                expectValid({
                    none: [
                        { ...imgCount, is: { gt: 0 } },
                    ],
                });
            });
        });

        describe('`api` allowlist', () => {
            it('checks each name of the path, `field` names and the names predicates read', () => {
                expectError('"document.cookie", which is not in API_ALLOWLIST', {
                    api: { path: 'document.cookie' },
                    is: { type: 'string' },
                });
                expectError('"navigator", which is not in API_ALLOWLIST', {
                    api: { path: 'navigator.userAgent' },
                    is: { type: 'string' },
                });
                expectError('"document.title.foo"', { api: { path: 'document', field: 'title.foo' }, is: {} });
                expectError('"performance.getEntriesByType.name"', {
                    api: {
                        path: 'performance.getEntriesByType',
                        args: [
                            'resource',
                        ],
                        where: { name: 'x' },
                    },
                    using: 'length',
                    is: 0,
                });
                expectError('"document.readyState.length"', { api: { path: 'document.readyState' }, is: { length: 8 } });
                expectValid({ ...title, is: { type: 'string', length: { gte: 7 } } });
                expectValid({
                    api: {
                        path: 'performance.getEntriesByType',
                        args: [
                            'resource',
                        ],
                        where: { responseStatus: { exists: true, gte: 400 } },
                    },
                    using: 'length',
                    is: 0,
                });
            });

            it('rejects reading one value from performance.getEntries', () => {
                const entries = { api: { path: 'performance.getEntries', args: [] } };
                const durations = { api: { path: 'performance.getEntries', args: [], field: 'duration' } };
                expectError('performance.getEntries selects every entry', { ...durations, is: { gt: 0 } });
                expectError('performance.getEntries selects every entry', { only: entries, is: {} });
                expectError('performance.getEntries selects every entry', {
                    div: [
                        durations,
                        1,
                    ],
                    is: { gt: 0 },
                });
                expectError('performance.getEntries selects every entry', {
                    ...entries,
                    using: {
                        path: 'at',
                        args: [
                            0,
                        ],
                    },
                    is: {},
                });
                expectValid({ api: { ...entries.api, where: {} }, using: 'length', is: { gt: 0 } });
                expectError('"performance.getEntries.length", which is not in API_ALLOWLIST', {
                    ...entries,
                    using: 'length',
                    is: { gt: 0 },
                });
            });
        });

        describe('`self` and `api` paths', () => {
            it('takes a path as short for an `api` body', () => {
                expectValid({ api: 'document.title', is: { type: 'string' } });
                expectValid({
                    api: {
                        path: 'Math.max',
                        args: [
                            1,
                            { api: 'document.title.length' },
                        ],
                    },
                    is: { gt: 0 },
                });
                expectError('"document.cookie", which is not in API_ALLOWLIST', { api: 'document.cookie', is: {} });
                expectError('reads the method "performance.now" without calling it', { api: 'performance.now', is: {} });
                expectError('`api` takes a path or one body object', { api: 5, is: {} });
            });

            it('passes the value to a listed method through `self`, in `where` and under `is`', () => {
                expectValid(items('video', { duration: numberTest('isFinite') }));
                expectValid(
                    items('video', {
                        field: {
                            api: {
                                path: 'Number.isNaN',
                                args: [
                                    { self: 'duration' },
                                ],
                            },
                        },
                        is: true,
                    }),
                );
                expectValid({ ...imgCount, is: numberTest('isFinite') });
                expectValid({
                    ...imgCount,
                    is: {
                        all: [
                            numberTest('isFinite'),
                            numberTest('isNaN', false),
                        ],
                    },
                });
                expectValid({
                    sum: fieldOf('img', {
                        api: {
                            path: 'Math.min',
                            args: [
                                { self: 'naturalWidth' },
                                5,
                            ],
                        },
                    }),
                    is: { gt: 0 },
                });
            });

            it('reads each item through `self` in `where`, by the item’s type', () => {
                expectValid(items('img', { naturalWidth: { gt: { self: 'naturalHeight' } } }));
                expectValid(
                    items('img', {
                        field: {
                            api: {
                                path: 'Reflect.has',
                                args: [
                                    { self: {} },
                                    'naturalWidth',
                                ],
                            },
                        },
                        is: true,
                    }),
                );
                expectValid(items('img', { field: { self: 'naturalWidth' }, is: 0 }));
                expectError(
                    '"noSuchProperty" is not a property of HTMLImageElement',
                    items('img', { field: { self: 'noSuchProperty' }, is: 0 }),
                );
                expectError('"performance.getEntriesByType.name", which is not in API_ALLOWLIST', {
                    api: {
                        path: 'performance.getEntriesByType',
                        args: [
                            'resource',
                        ],
                        where: { duration: { gt: { self: 'name.length' } } },
                    },
                    using: 'length',
                    is: 0,
                });
            });

            it('rejects a method not on the allowlist, and `call` in `field`', () => {
                expectError(
                    '"Number.isInteger", which is not in API_ALLOWLIST',
                    items('video', {
                        field: {
                            api: {
                                path: 'Number.isInteger',
                                args: [
                                    { self: 'duration' },
                                ],
                            },
                        },
                        is: true,
                    }),
                );
                expectError(
                    'unknown `field` key "call"',
                    items('video', { duration: { field: { call: { api: 'Number.isFinite' } }, is: true } }),
                );
            });

            it('rejects `self` outside `using`, `where` and `field`', () => {
                expectError('`self` reads from `using`, `where` or `field`', { self: 'length', is: 0 });
                expectError('`self` reads from `using`, `where` or `field`', true, { x: { value: { self: {} } } });
            });

            it('rejects `as` on an expression reading `self` per item, and inside the branches of an `if` reading one', () => {
                expectError('`as` names one value per run', items('img', { naturalWidth: { gt: { self: 'naturalHeight', as: 'h' } } }));
                expectError(
                    '`as` names one value per run',
                    items('img', {
                        naturalWidth: {
                            gt: {
                                if: {
                                    test: { self: 'complete' },
                                    then: {
                                        sum: [
                                            1,
                                        ],
                                        as: 'one',
                                    },
                                    else: 2,
                                },
                            },
                        },
                    }),
                );
                expectValid(
                    items('img', {
                        naturalWidth: {
                            gt: {
                                sum: [
                                    1,
                                ],
                                as: 'one',
                            },
                        },
                    }),
                );
            });
        });

        describe('`using`', () => {
            const navigation = {
                api: {
                    path: 'performance.getEntriesByType',
                    args: [
                        'navigation',
                    ],
                },
            };

            it('names a path `using` reads by the name of the expression beside it, through `ref` and `only`', () => {
                expectValid({
                    all: [
                        { only: navigation, as: 'navigation', is: { type: 'object' } },
                        { ref: 'navigation', using: 'loadEventEnd', is: { gt: 0 } },
                    ],
                });
                expectValid({ only: navigation, using: 'responseStatus', is: { gte: 400 } });
                expectError('"performance.getEntriesByType.name", which is not in API_ALLOWLIST', {
                    only: navigation,
                    using: 'name',
                    is: { type: 'string' },
                });
                expectError('reads the method "performance.now" without calling it', {
                    api: { path: 'performance' },
                    using: 'now',
                    is: { gt: 0 },
                });
            });

            it('reads an item with `at` or an index on a list or an `api` read, under the item’s name', () => {
                const at = (
                    /** @type {Record<string, unknown>} */ root,
                    /** @type {unknown[]} */ args,
                    /** @type {string} */ field = '',
                ) => ({
                    ...root,
                    using: { path: 'at', args, ...(field && { field }) },
                });
                expectValid({
                    ...at(
                        navigation,
                        [
                            0,
                        ],
                        'loadEventEnd',
                    ),
                    is: { gt: 0 },
                });
                expectValid({
                    ...at(
                        img,
                        [
                            -1,
                        ],
                        'naturalWidth',
                    ),
                    is: { gt: 0 },
                });
                expectValid({ ...img, using: '0.naturalWidth', is: { gt: 0 } });
                expectValid({ ...img, using: 'length', is: { gte: 5 } });
                expectError('"naturalWidth" is not a property of HTMLHeadingElement', {
                    ...at(
                        { element: { selector: 'h1' } },
                        [
                            0,
                        ],
                        'naturalWidth',
                    ),
                    is: { gt: 0 },
                });
                expectError('reads "slice" on a list', {
                    ...img,
                    using: {
                        path: 'slice',
                        args: [
                            0,
                        ],
                    },
                    is: {},
                });
                expectError('reads "at" on a list', {
                    ...at(
                        img,
                        [
                            0,
                            1,
                        ],
                    ),
                    is: {},
                });
                expectError('"performance.getEntriesByType.at", which is not in API_ALLOWLIST', {
                    ...at(navigation, [
                        'x',
                    ]),
                    is: {},
                });
            });

            it('checks what `using` reads under each name the expression beside it may have', () => {
                const document = { api: { path: 'document' } };
                expectValid({
                    if: { test: true, then: document, else: document },
                    using: 'title',
                    is: { type: 'string' },
                });
                const byType = {
                    only: {
                        api: {
                            path: 'performance.getEntriesByType',
                            args: [
                                'paint',
                            ],
                        },
                    },
                };
                const byName = {
                    only: {
                        api: {
                            path: 'performance.getEntriesByName',
                            args: [
                                'first-paint',
                                'paint',
                            ],
                        },
                    },
                };
                const entry = { if: { test: { api: { path: 'document.hidden' } }, then: byType, else: byName } };
                expectError('"performance.getEntriesByType.startTime", which is not in API_ALLOWLIST', {
                    ...entry,
                    using: 'startTime',
                    is: { gt: 0 },
                });
                expectError('"performance.getEntriesByName.duration", which is not in API_ALLOWLIST', {
                    all: [
                        { ...entry, as: 'entry', is: {} },
                        { ref: 'entry', using: 'duration', is: { gt: 0 } },
                    ],
                });
                const image = { only: { element: { selector: 'img' } } };
                const either = { if: { test: true, then: image, else: document } };
                expectValid({ ...either, using: 'title', is: { type: 'string' } });
                expectError('"document.naturalWidth", which is not in API_ALLOWLIST', {
                    ...either,
                    using: 'naturalWidth',
                    is: { gt: 0 },
                });
            });

            it('rejects an expression beside `using` that CI cannot name', () => {
                expectError('this expression has neither', { only: text, using: 'length', is: { gt: 0 } });
                expectError('this expression has neither', { expr: imgCount, using: { path: 'toFixed', args: [] }, is: {} });
                expectError('A number fills', { expr: 1, using: { path: 'toFixed', args: [] }, is: {} });
            });

            it('takes a path, or an `api` body without `root`, beside an expression', () => {
                expectValid({ api: { path: 'document' }, using: 'fonts', is: { type: 'object' } });
                expectValid({ api: { path: 'document' }, using: { path: 'fonts', where: { status: 'error' } }, as: 'failed', is: {} });
                expectError('`using` reads from an expression', { using: 'length', is: 1 });
                expectError('`using` takes a path', { ...img, using: 1, is: {} });
                expectError('unknown source body key "root"', {
                    ...img,
                    using: {
                        path: 'at',
                        args: [
                            0,
                        ],
                        root: img,
                    },
                    is: {},
                });
                expectError('unknown source body key "root"', { api: { root: img, path: 'length' }, is: { gt: 0 } });
            });

            it('takes an expression reading the value beside it through `self`', () => {
                expectValid({
                    only: navigation,
                    using: {
                        div: [
                            { self: 'decodedBodySize' },
                            { self: 'duration' },
                        ],
                    },
                    as: 'ratio',
                    is: { gt: 0 },
                });
                expectValid({ ...img, using: { self: 'length' }, is: { gte: 5 } });
                expectError('"performance.getEntriesByType.name", which is not in API_ALLOWLIST', {
                    only: navigation,
                    using: {
                        sum: [
                            { self: 'name.length' },
                        ],
                    },
                    is: { gt: 0 },
                });
            });

            it('applies `using`, then `as`, then `is`', () => {
                expectValid({ ...img, using: 'length', as: 'images', is: { gte: 5 } }, { images: { value: { ref: 'images' } } });
                expectError(
                    'a selected list is sent through `buckets`',
                    { ...img, as: 'images' },
                    { images: { value: { ref: 'images' } } },
                );
            });
        });

        describe('`expr`', () => {
            it('names a value and what `using` reads from it', () => {
                expectValid(
                    { expr: { ...img, as: 'imageElements' }, using: 'length', as: 'imageCount', is: { gte: 2 } },
                    {
                        imageCount: { value: { ref: 'imageCount' } },
                        imageElements: { value: { ref: 'imageElements' }, buckets: { two: { length: 2 } } },
                    },
                );
            });

            it('names the boolean an `is` inside it gives', () => {
                expectValid(
                    { expr: { ...img, using: 'length', is: { gte: 2 } }, as: 'enoughImages' },
                    { enough: { value: { ref: 'enoughImages' } } },
                );
                expectValid(true, { enough: { value: { expr: { ...img, using: 'length', is: { gte: 2 } } } } });
                expectError('`expr` over `is` fills', {
                    sum: [
                        { expr: { ...img, using: 'length', is: { gte: 2 } } },
                    ],
                    is: 1,
                });
            });

            it('gives its operand in its own position', () => {
                expectValid({ sum: { expr: { element: { selector: 'img', field: 'naturalWidth' } } }, is: { gt: 0 } });
                expectValid({ expr: img });
                expectError('`element` with `field` fills', { expr: { element: { selector: 'img', field: 'naturalWidth' } } });
            });
        });

        describe('expression `root` on `element` and `text`', () => {
            it('takes an expression giving a node or a list of nodes', () => {
                expectValid({ element: { selector: 'img', root: { element: { selector: 'article' } } } });
                expectValid({ text: { pattern: 'a', root: { only: { element: { selector: 'article' } } } } });
                expectValid({
                    element: {
                        selector: 'img',
                        root: { only: { element: { selector: 'my-widget' } }, using: 'shadowRoot' },
                    },
                });
                expectValid({ element: { selector: 'img', root: { api: { path: 'document' } } } });
            });

            it('takes an array of selectors and expressions, and a selector a read gives', () => {
                expectValid({
                    element: {
                        selector: 'img',
                        root: [
                            '#comments',
                            { only: { element: { selector: 'article' } } },
                            null,
                        ],
                    },
                });
                expectValid({ text: { pattern: 'a', root: { only: fieldOf('a', 'href') } } });
            });

            it('rejects a root of text, numbers or values that are not nodes', () => {
                expectError('config types it as a list of string', { element: { selector: 'img', root: text } });
                expectError('config types it as a list of number', { element: { selector: 'img', root: fieldOf('img', 'naturalWidth') } });
                expectError('config types it as number', { text: { pattern: 'a', root: { only: fieldOf('img', 'naturalWidth') } } });
                expectError('A number fills', {
                    element: {
                        selector: 'img',
                        root: [
                            1,
                        ],
                    },
                });
                expectError('at least one entry', { element: { selector: 'img', root: [] } });
                expectError('An array, the OR of its entries,', {
                    element: {
                        selector: 'img',
                        root: [
                            [
                                '#a',
                            ],
                        ],
                    },
                });
                expectError('config types it as number', { element: { selector: 'img', root: imgCount } });
            });

            it('collects names, refs and cycles inside roots', () => {
                expectValid({
                    all: [
                        { element: { selector: 'img', root: { element: { selector: '#a' }, as: 'region' } } },
                        { ref: 'region' },
                    ],
                });
                expectError('names no expression', { element: { selector: 'img', root: { ref: 'missing' } } });
                expectError('names no expression', { ref: 'missing', using: 'length', is: {} });
                expectError('cycle', { element: { selector: 'img', root: { ref: 'images' } }, as: 'images' });
                expectError('cycle', { ref: 'widths', using: 'length', as: 'widths', is: {} });
                expectError('from outside it', {
                    all: [
                        { if: { test: true, then: { element: { selector: '#a' }, as: 'inner' }, else: false } },
                        { element: { selector: 'img', root: { ref: 'inner' } } },
                    ],
                });
            });
        });

        describe('payloads', () => {
            it('checks payload keys', () => {
                expectValid(true, { brokenImages: { value: imgCount } });
                expectError('reserved', true, { nativeData: { value: imgCount } });
                expectError('does not match', true, { _errors: { value: imgCount } });
                expectError('does not match', true, { '2x': { value: imgCount } });
                expectError('needs `value`', true, { a: { buckets: { x: 1 } } });
            });

            it('checks buckets: at least one, and no overlap among simple predicates', () => {
                expectValid(true, { a: { value: imgCount, buckets: { 0: 0, '1-2': { gte: 1, lt: 3 }, '3+': { gte: 3 } } } });
                expectValid(true, { a: { value: loadEventEnd, buckets: { loading: 0, fast: { gt: 0, lt: 3000 } } } });
                expectError('at least one bucket', true, { a: { value: imgCount, buckets: {} } });
                expectError('overlap', true, { a: { value: imgCount, buckets: { 0: 0, '0-3': { gte: 0, lt: 3 } } } });
                expectError('overlap', true, { a: { value: imgCount, buckets: { low: { lte: 3 }, high: { gte: 3 } } } });
                expectError('overlap', true, {
                    a: {
                        value: { api: { path: 'document.readyState' } },
                        buckets: {
                            early: [
                                'loading',
                                'interactive',
                            ],
                            mid: 'interactive',
                        },
                    },
                });
                expectValid(true, { a: { value: title, buckets: { empty: { length: 0 }, any: { length: { gte: 0 } } } } });
            });

            it('checks bucket and `when` operators against the value’s type', () => {
                expectError('guard it', true, { a: { value: { only: fieldOf('img', 'src') }, buckets: { long: { gt: 100 } } } });
                expectError('guard it', true, { a: { value: { only: fieldOf('img', 'src') }, when: { gt: 100 } } });
            });
        });
    });
});
