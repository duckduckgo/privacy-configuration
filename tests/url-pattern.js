import { expect } from 'chai';
import { URLPattern } from 'urlpattern-polyfill';

/** content-scope-scripts resolves a string pattern against the page URL. Any URL serves to parse one. */
const BASE_URL = 'https://example.com/';

/**
 * Invoke `cb` for each block of a condition: a block, or an array of blocks.
 *
 * @param {unknown} condition
 * @param {(block: Record<string, any>, index: number) => void} cb
 */
export function forEachConditionBlock(condition, cb) {
    const blocks = Array.isArray(condition)
        ? condition
        : [
              condition,
          ];
    for (const [
        index,
        block,
    ] of blocks.entries()) {
        if (block !== null && typeof block === 'object') cb(block, index);
    }
}

/**
 * Assert a `urlPattern` constructs with the polyfill content-scope-scripts uses. A pattern that
 * throws there throws from every `getFeatureSetting` call that evaluates its condition.
 *
 * @param {unknown} pattern
 * @param {string} path - used in error messages
 */
export function assertValidUrlPattern(pattern, path) {
    const construct = typeof pattern === 'string' ? () => new URLPattern(pattern, BASE_URL) : () => new URLPattern(pattern);
    expect(construct, `${path}: ${JSON.stringify(pattern)} is not a valid urlPattern`).to.not.throw();
}
