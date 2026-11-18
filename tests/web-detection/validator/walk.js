// @ts-check
import { BRANCH_KEYS, COMPARISON_OPERATORS, EXPRESSION_KEYS, OPERATOR_KEYS, VALUE_OPERATORS, apiBody } from './grammar.js';

import { isPlainObject } from '../../../util.js';

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
 * Invoke `cb` for every body of a `text` or `element` source: the body, or each entry of an array.
 *
 * @param {unknown} node
 * @param {string} path
 * @param {(body: Record<string, any>, path: string) => void} cb
 */
export function forEachSourceBody(node, path, cb) {
    if (Array.isArray(node)) {
        node.forEach((body, i) => {
            if (isPlainObject(body)) cb(body, `${path}[${i}]`);
        });
    } else if (isPlainObject(node)) {
        cb(node, path);
    }
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
                    forEachSourceBody(value, '', (leaf) => {
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
