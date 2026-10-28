import { expect } from 'chai';
import { validateDetector } from './validator/validate.js';

/**
 * @param {unknown} match
 * @param {Record<string, unknown>} [data]
 */
export const errorsOf = (match, data) => validateDetector({ match, actions: { breakageReportData: data ? { data } : {} } }, '$');

/**
 * @param {unknown} match
 * @param {Record<string, unknown>} [data]
 */
export const expectValid = (match, data) => {
    const errors = errorsOf(match, data);
    expect(errors, errors.join('\n')).to.deep.equal([]);
};

/**
 * @param {string} fragment - text one of the errors contains
 * @param {unknown} match
 * @param {Record<string, unknown>} [data]
 */
export const expectError = (fragment, match, data) => {
    const errors = errorsOf(match, data);
    expect(
        errors.some((error) => error.includes(fragment)),
        `expected an error containing ${JSON.stringify(fragment)}, got:\n${errors.join('\n') || '(none)'}`,
    ).to.equal(true);
};

/**
 * @param {unknown} actions
 */
export const expectActionsValid = (actions) => {
    const errors = validateDetector({ actions }, '$');
    expect(errors, errors.join('\n')).to.deep.equal([]);
};

/**
 * @param {string} fragment - text one of the errors contains
 * @param {unknown} actions
 */
export const expectActionsError = (fragment, actions) => {
    const errors = validateDetector({ actions }, '$');
    expect(
        errors.some((error) => error.includes(fragment)),
        `expected an error containing ${JSON.stringify(fragment)}, got:\n${errors.join('\n') || '(none)'}`,
    ).to.equal(true);
};

export const img = { element: { selector: 'img' } };
export const imgCount = { ...img, using: 'length' };
export const loadEventEnd = {
    api: {
        path: 'performance.getEntriesByType',
        args: [
            'navigation',
        ],
        field: 'loadEventEnd',
    },
};
export const now = { api: { path: 'performance.now', args: [] } };
export const title = { api: { path: 'document.title' } };
/** A region, which guards a source rooted at it when `match` repeats it */
export const guard = {
    element: {
        selector: [
            '#comments',
        ],
    },
};
export const rootedImages = { element: { selector: 'img', root: guard }, using: 'length' };
export const text = { text: { pattern: 'a' } };

/**
 * A count of the elements matching a selector that pass `where`.
 *
 * @param {string} selector
 * @param {unknown} where
 */
export const items = (selector, where) => ({ element: { selector, where }, using: 'length', is: 0 });

/**
 * @param {string} selector
 * @param {unknown} field
 */
export const fieldOf = (selector, field) => ({ element: { selector, field } });

/**
 * A predicate testing the value with `Number.isFinite` or `Number.isNaN`, passed it through `self`.
 *
 * @param {'isFinite' | 'isNaN'} name
 * @param {boolean} [expected]
 */
export const numberTest = (name, expected = true) => ({
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
