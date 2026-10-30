import { expect } from 'chai';
import xpath from 'xpath';
import { MAX_TAIL_RATIO, MIN_CHUNK_SIZE } from './grammar.js';

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
export function assertXPathConfig(xpathConfig, path) {
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
export function assertValidXPath(expression, path) {
    expect(typeof expression, `${path}: expected a string, got ${JSON.stringify(expression)}`).to.equal('string');
    try {
        xpath.parse(/** @type {string} */ (expression));
    } catch (error) {
        expect.fail(`${path}: ${JSON.stringify(expression)} is not a valid XPath expression - ${error.message}`);
    }
}

/**
 * Whether an XPath expression selects from an absolute path, through any branch of a union or
 * parentheses, so that it reads from the document whatever its context node. Paths inside
 * predicates are not selections and are allowed. An expression that does not parse is left to
 * `assertValidXPath`.
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
    /** @param {unknown} node */
    const absolute = (node) => {
        if (node instanceof xpath.BarOperation) return absolute(node.lhs) || absolute(node.rhs);
        if (!(node instanceof xpath.PathExpr)) return false;
        return node.locationPath?.absolute === true || absolute(node.filter);
    };
    return absolute(tree);
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
export function assertValidPattern(pattern, path) {
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
export function assertTextConditionExpressions(condition, path) {
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
export function assertXPathConfigPatch(operation, path) {
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
export function assertExpressionPatch(operation, path) {
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
