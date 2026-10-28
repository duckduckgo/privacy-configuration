import {
    BRANCH_KEYS,
    COMPARISON_OPERATORS,
    EXPRESSION_KEYS,
    OPERATOR_KEYS,
    PAYLOAD_ACTIONS,
    SOURCE_KEYS,
    VALUE_OPERATORS,
    apiBody,
} from './grammar.js';

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
export function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @template T
 * @param {T | T[]} value
 * @returns {T[]}
 */
export function asArray(value) {
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
export function forEachTextLeaf(node, path, cb) {
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
        } else if (BRANCH_KEYS.includes(key)) {
            forEachSource(value, childPath, cb);
        } else if (PAYLOAD_ACTIONS.includes(key)) {
            if (isPlainObject(value)) forEachPayloadSource(value.data, `${childPath}.data`, cb);
        } else if (key === 'define') {
            if (!isPlainObject(value)) continue;
            for (const [
                name,
                defined,
            ] of Object.entries(value)) {
                forEachSource(defined, `${childPath}.${name}`, cb);
            }
        } else if (key === 'is') {
            forEachPredicateSource(value, 'value', childPath, cb);
        } else if (EXPRESSION_KEYS.includes(key) && key !== 'ref') {
            forEachSource(value, childPath, cb);
        }
    }
}

/**
 * Invoke `cb` for every source in the operands of a predicate, and in its expressions at item level.
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
    if (level === 'item' && isItemExpression(predicate)) {
        forEachSource(predicate, path, cb);
        return;
    }

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
            if (key === 'in')
                asArray(value).forEach((entry, index) =>
                    forEachSource(entry, Array.isArray(value) ? `${childPath}[${index}]` : childPath, cb),
                );
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
 * Invoke `cb` for every source in a payload spec: its values, `when`s and buckets.
 *
 * @param {unknown} data
 * @param {string} path
 * @param {(key: string, body: unknown, path: string) => void} cb
 */
function forEachPayloadSource(data, path, cb) {
    if (!isPlainObject(data)) return;
    for (const [
        key,
        field,
    ] of Object.entries(data)) {
        if (!isPlainObject(field)) continue;
        const fieldPath = `${path}.${key}`;
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

/**
 * Invoke `cb` for every source in a detector: its `match`, and its `actions` with their payloads and
 * `define` values, in every branch and sequence.
 *
 * @param {Record<string, any>} detector
 * @param {string} path
 * @param {(key: string, body: unknown, path: string) => void} cb
 */
function forEachDetectorSource(detector, path, cb) {
    forEachSource(detector.match, `${path}.match`, cb);
    forEachSource(detector.actions, `${path}.actions`, cb);
}

/**
 * Invoke `cb` for every `text` body reachable from an expression, in any placement.
 *
 * @param {unknown} node
 * @param {string} path
 * @param {(condition: Record<string, any>, path: string) => void} cb
 */
export function forEachTextCondition(node, path, cb) {
    forEachSource(node, path, (key, body, sourcePath) => {
        if (key === 'text') forEachTextLeaf(body, sourcePath, cb);
    });
}

/**
 * Invoke `cb` for every `text` body in a detector's conditions, payloads and `define` values.
 *
 * @param {Record<string, any>} detector
 * @param {string} path
 * @param {(condition: Record<string, any>, path: string) => void} cb
 */
export function forEachDetectorTextCondition(detector, path, cb) {
    forEachDetectorSource(detector, path, (key, body, sourcePath) => {
        if (key === 'text') forEachTextLeaf(body, sourcePath, cb);
    });
}

/**
 * @param {Record<string, any>} node
 * @returns {string[]}
 */
export function expressionKeysOf(node) {
    return Object.keys(node).filter((key) => EXPRESSION_KEYS.includes(key));
}

/**
 * Whether config at item level is a boolean expression over `self`: an object with an expression key
 * other than `any`, `all` and `none`, which a predicate shares.
 *
 * @param {unknown} node
 * @returns {node is Record<string, any>}
 */
export function isItemExpression(node) {
    return isPlainObject(node) && expressionKeysOf(node).some((key) => !OPERATOR_KEYS.includes(key));
}

/**
 * Whether an expression reads a `self` it does not bind itself: one outside every `using`, `where`
 * and `field` inside the expression.
 *
 * @param {unknown} node
 * @returns {boolean}
 */
export function readsOuterSelf(node) {
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
                case 'ref':
                    return false;
                default:
                    return (EXPRESSION_KEYS.includes(key) || BRANCH_KEYS.includes(key)) && readsOuterSelf(value);
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
            if (level === 'value' && key === 'in') return asArray(value).some(readsOuterSelf);
            if (level === 'value' && VALUE_OPERATORS.includes(key)) return false;
            return predicateReadsOuterSelf(value, 'value');
        },
    );
}

/**
 * Every name a `ref` reads in an expression or body.
 *
 * @param {unknown} node
 * @param {Set<string>} [found]
 * @returns {Set<string>}
 */
export function refsIn(node, found = new Set()) {
    if (Array.isArray(node)) node.forEach((entry) => refsIn(entry, found));
    else if (isPlainObject(node)) {
        if (typeof node.ref === 'string') found.add(node.ref);
        Object.values(node).forEach((value) => refsIn(value, found));
    }
    return found;
}

/**
 * Whether a body holds a `define` of the name.
 *
 * @param {unknown} node
 * @param {string} name
 * @returns {boolean}
 */
export function definesName(node, name) {
    if (Array.isArray(node)) return node.some((entry) => definesName(entry, name));
    if (!isPlainObject(node)) return false;
    if (isPlainObject(node.define) && name in node.define) return true;
    return Object.values(node).some((value) => definesName(value, name));
}
