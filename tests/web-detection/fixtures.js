import { expect } from 'chai';
import { validateDetector } from './validator/validate.js';

/** The failures of the checks in the running `itAll` test, or null outside one. */
/** @type {string[] | null} */
let failures = null;

/**
 * Report a failed check: collected when inside `itAll`, thrown otherwise.
 *
 * @param {string} message
 */
function report(message) {
    if (failures) failures.push(message);
    else expect.fail(message);
}

/**
 * A test that runs every check in its body, and fails listing each check that failed.
 *
 * @param {string} name
 * @param {() => void} body
 */
export function itAll(name, body) {
    it(name, () => {
        failures = [];
        try {
            body();
        } finally {
            const failed = failures;
            failures = null;
            if (failed.length) expect.fail(failed.join('\n\n'));
        }
    });
}

/**
 * @param {unknown} detector
 */
export const expectDetectorValid = (detector) => {
    const errors = validateDetector(/** @type {Record<string, any>} */ (detector), '$');
    if (errors.length) report(`expected no errors, got:\n${errors.join('\n')}`);
};

/**
 * @param {string} fragment - text one of the errors contains
 * @param {unknown} detector
 */
export const expectDetectorError = (fragment, detector) => {
    const errors = validateDetector(/** @type {Record<string, any>} */ (detector), '$');
    if (!errors.some((error) => error.includes(fragment))) {
        report(`expected an error containing ${JSON.stringify(fragment)}, got:\n${errors.join('\n') || '(none)'}`);
    }
};

/**
 * @param {unknown} match
 * @param {Record<string, unknown>} [data]
 */
const detectorOf = (match, data) => ({ match, actions: { breakageReportData: data ? { data } : {} } });

/**
 * @param {unknown} match
 * @param {Record<string, unknown>} [data]
 */
export const errorsOf = (match, data) => validateDetector(detectorOf(match, data), '$');

/**
 * @param {unknown} match
 * @param {Record<string, unknown>} [data]
 */
export const expectValid = (match, data) => expectDetectorValid(detectorOf(match, data));

/**
 * @param {string} fragment - text one of the errors contains
 * @param {unknown} match
 * @param {Record<string, unknown>} [data]
 */
export const expectError = (fragment, match, data) => expectDetectorError(fragment, detectorOf(match, data));

/**
 * @param {unknown} actions
 */
export const expectActionsValid = (actions) => expectDetectorValid({ actions });

/**
 * @param {string} fragment - text one of the errors contains
 * @param {unknown} actions
 */
export const expectActionsError = (fragment, actions) => expectDetectorError(fragment, { actions });

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
export const fontsStatus = { api: { path: 'document.fonts.status' } };
/** A region, which guards a source rooted at it when `match` repeats it */
export const guard = {
    element: {
        selector: [
            '#comments',
        ],
    },
};
export const rootedImages = { element: { selector: 'img', root: guard }, using: 'length' };
/** A custom element's shadow root, which needs `is` to guard a source rooted at it */
export const shadowRoot = { only: { element: { selector: 'x-widget' } }, using: 'shadowRoot' };
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
