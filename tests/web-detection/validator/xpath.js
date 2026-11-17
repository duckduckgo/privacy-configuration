// @ts-check
import xpathModule from 'xpath';
import { fail } from './context.js';
import { isPlainObject } from '../../../util.js';
import { asArray } from './walk.js';

/**
 * @typedef {import('./context.js').Context} Context
 */

/**
 * The parser `xpath` uses internally, which its types leave out.
 *
 * @typedef {{
 *   parse(source: string): { expression: { expression: unknown } },
 *   BarOperation: new (...args: never[]) => { lhs: unknown, rhs: unknown },
 *   PathExpr: new (...args: never[]) => { locationPath?: { absolute?: boolean }, filter: unknown },
 * }} XPathParser
 */
const xpath = /** @type {XPathParser} */ (/** @type {unknown} */ (xpathModule));

/** Floor for a non-zero chunkSize. Smaller chunks multiply regex tests for little gain. */
const MIN_CHUNK_SIZE = 1024;

/**
 * Upper bound on chunkTail as a fraction of chunkSize. A tail is re-scanned by the
 * following test, so this caps the scanning overhead a config can impose at 1.25x.
 */
const MAX_TAIL_RATIO = 4;

/**
 * Check an `xpathConfig` block holds sensible values. Clients use these values as configured.
 *
 * The chunkSize/chunkTail ratio is only checked when both are present in the same block. Judging a
 * lone chunkTail would mean hardcoding the client's default chunkSize here.
 *
 * @param {unknown} xpathConfig
 * @param {Context} ctx
 * @param {string} path
 */
function checkXPathConfig(xpathConfig, ctx, path) {
    if (!isPlainObject(xpathConfig)) return;
    const { chunkSize, chunkTail } = xpathConfig;
    for (const [
        key,
        value,
    ] of Object.entries({ chunkSize, chunkTail })) {
        if (value !== undefined && !(Number.isInteger(value) && Number(value) >= 0)) {
            fail(ctx, `${path}.${key}`, `expected a non-negative integer, got ${JSON.stringify(value)}`);
        }
    }
    if (Number.isInteger(chunkSize) && chunkSize !== 0 && Number(chunkSize) < MIN_CHUNK_SIZE) {
        fail(ctx, `${path}.chunkSize`, `expected 0 (chunking disabled) or at least ${MIN_CHUNK_SIZE}, got ${chunkSize}`);
    }
    // A chunkSize of 0 disables chunking, leaving the tail unused
    if (!Number.isInteger(chunkSize) || chunkSize === 0 || !Number.isInteger(chunkTail)) return;
    const maxTail = Number(chunkSize) / MAX_TAIL_RATIO;
    if (Number(chunkTail) > maxTail) {
        fail(ctx, `${path}.chunkTail`, `expected at most chunkSize / ${MAX_TAIL_RATIO} (${maxTail}), got ${chunkTail}`);
    }
}

/**
 * Whether an XPath expression selects from an absolute path, through any branch of a union or
 * parentheses, so that it reads from the document whatever its context node. Paths inside
 * predicates are not selections and are allowed. An expression that does not parse is reported by
 * `checkTextExpressions`.
 *
 * @param {string} expression
 * @returns {boolean}
 */
export function selectsFromDocument(expression) {
    /** @type {unknown} */
    let tree;
    try {
        tree = xpath.parse(expression).expression.expression;
    } catch {
        return false;
    }
    /**
     * @param {unknown} node
     * @returns {boolean}
     */
    const absolute = (node) => {
        if (node instanceof xpath.BarOperation) return absolute(node.lhs) || absolute(node.rhs);
        if (!(node instanceof xpath.PathExpr)) return false;
        return node.locationPath?.absolute === true || absolute(node.filter);
    };
    return absolute(tree);
}

/**
 * Check the `pattern` and `xpath` entries of a `text` body parse, and its `xpathConfig`. Only the
 * syntax is checked: patterns against this Node version, and XPath against the XPath 1.0 grammar,
 * where browser engines may disagree at the edges of the spec.
 *
 * @param {Record<string, unknown>} body
 * @param {Context} ctx
 * @param {string} path - the path of the body
 */
export function checkTextExpressions(body, ctx, path) {
    for (const [
        key,
        parse,
        what,
    ] of /** @type {Array<[string, (source: string) => unknown, string]>} */ ([
        [
            'pattern',
            (source) => new RegExp(source, 'i'),
            'regular expression',
        ],
        [
            'xpath',
            (source) => xpath.parse(source),
            'XPath expression',
        ],
    ])) {
        const value = body[key];
        for (const [
            index,
            source,
        ] of asArray(value).entries()) {
            if (typeof source !== 'string') continue;
            try {
                parse(source);
            } catch (error) {
                const entryPath = Array.isArray(value) ? `${path}.${key}[${index}]` : `${path}.${key}`;
                fail(ctx, entryPath, `${JSON.stringify(source)} is not a valid ${what}: ${/** @type {Error} */ (error).message}`);
            }
        }
    }
    if ('xpathConfig' in body) checkXPathConfig(body.xpathConfig, ctx, `${path}.xpathConfig`);
}
