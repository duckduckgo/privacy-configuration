import { expect } from 'chai';
import {
    errorsOf,
    expectActionsError,
    expectActionsValid,
    expectError,
    expectValid,
    fieldOf,
    guard,
    imgCount,
    items,
    loadEventEnd,
    numberTest,
    rootedImages,
    text,
    title,
} from './fixtures.js';

describe('webDetection config tests', () => {
    describe('validateDetector (self-test)', () => {
        describe('`root` guard', () => {
            it('passes a guard in match repeating the root, in the same top-level `all` or an enclosing `if`', () => {
                expectValid({
                    all: [
                        guard,
                        { ...rootedImages, is: { lt: 1 } },
                    ],
                });
                expectValid({
                    all: [
                        { ...rootedImages, is: { lt: 1 } },
                        guard,
                    ],
                });
                expectValid({ if: guard, then: { ...rootedImages, is: { lt: 1 } }, else: false });
                expectValid({
                    all: [
                        { element: { selector: '#comments', visibility: 'visible', where: { hidden: false } } },
                        {
                            element: {
                                selector: 'img',
                                root: { element: { selector: '#comments', visibility: 'visible', where: { hidden: false } } },
                            },
                            using: 'length',
                            is: { lt: 1 },
                        },
                    ],
                });
            });

            it('passes a guard in actions: a `ref` to the bound root', () => {
                const scoped = { element: { selector: 'img', root: { ref: 'comments' } }, using: 'length' };
                expectActionsValid([
                    { define: { comments: guard } },
                    { if: { ref: 'comments' }, then: { breakageReportData: { data: { images: { value: scoped } } } } },
                ]);
                expectActionsValid([
                    { define: { comments: guard } },
                    {
                        define: {
                            empty: {
                                all: [
                                    { ref: 'comments' },
                                    { ...scoped, is: 0 },
                                ],
                            },
                        },
                    },
                ]);
                expectActionsError('needs a guard', [
                    { define: { comments: guard } },
                    { breakageReportData: { data: { images: { value: scoped } } } },
                ]);
                expectActionsError('needs a guard', {
                    if: guard,
                    then: { breakageReportData: { data: { images: { value: rootedImages } } } },
                });
            });

            it('checks each entry of an array root for a guard', () => {
                const sidebar = { element: { selector: '#sidebar' } };
                const scoped = (/** @type {unknown} */ root) => ({ element: { selector: 'img', root }, using: 'length', is: { lt: 1 } });
                expectValid({
                    all: [
                        guard,
                        sidebar,
                        scoped([
                            guard,
                            sidebar,
                        ]),
                    ],
                });
                expectError('root[1]', {
                    all: [
                        guard,
                        scoped([
                            guard,
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

            it('rejects a scoped expression with no guard, or a guard elsewhere', () => {
                expectError('needs a guard', {
                    all: [
                        { element: { selector: 'img', root: '#comments' }, using: 'length', is: { lt: 1 } },
                    ],
                });
                expectError('needs a guard', {
                    all: [
                        { ...rootedImages, is: { lt: 1 } },
                    ],
                });
                expectError('needs a guard', {
                    all: [
                        { any: guard },
                        { ...rootedImages, is: { lt: 1 } },
                    ],
                });
                expectError('needs a guard', guard, { images: { value: rootedImages } });
            });

            it('rejects a scoped leaf under `none` with no guard', () => {
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
            });

            it('rejects a scoped leaf in `where` with a `none` above it, in the match tree or the predicate, with no guard', () => {
                const comments = {
                    self: {
                        path: 'querySelector',
                        args: [
                            '.comments',
                        ],
                    },
                };
                const cardsWithImage = { selector: '.card', where: { element: { selector: 'img', root: comments } } };
                expectValid({ element: cardsWithImage });
                expectError('needs a guard', { none: { element: cardsWithImage } });
                expectError('needs a guard', {
                    element: { selector: '.card', where: { none: { element: { selector: 'img', root: comments } } } },
                });
            });

            it('requires `is` on a guard that is not an `element` or `text` source', () => {
                const shadowRoot = { only: { element: { selector: 'my-widget' } }, using: 'shadowRoot' };
                const shadowImages = { element: { selector: 'img', root: shadowRoot }, using: 'length', is: { lt: 1 } };
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
                for (const expression of [
                    './/a | //b',
                    '(//a)[1]',
                    ' //a',
                ]) {
                    expectError('starts ".//"', { text: { pattern: 'a', xpath: expression, root: '#comments' } });
                }
                expectValid({ text: { pattern: 'a', xpath: './a[count(//b) > 0]', root: '#comments' } });
            });

            it('rejects an XPath expression evaluated from a shadow root', () => {
                const shadowRoot = { only: { element: { selector: 'x-widget' } }, using: 'shadowRoot' };
                expectError('cannot be evaluated from a shadow root', {
                    text: { pattern: 'a', xpath: './/text()', root: shadowRoot },
                });
                expectActionsError('cannot be evaluated from a shadow root', [
                    { define: { region: shadowRoot } },
                    {
                        if: { ref: 'region' },
                        then: {
                            if: { text: { pattern: 'a', xpath: './/text()', root: { ref: 'region' } } },
                            then: { fireEvent: { type: 'x' } },
                        },
                    },
                ]);
                expectValid({ text: { pattern: 'a', root: shadowRoot } });
                expectValid({ text: { pattern: 'a', selector: 'p', root: shadowRoot } });
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
                expectValid({ ...loadEventEnd, is: { type: 'number', gt: 0 } });
            });

            it('checks `fails` is a boolean, and `"fails": true` reads no value', () => {
                expectValid({ ...loadEventEnd, is: { fails: false, gt: 0 } });
                expectValid({ ...loadEventEnd, is: { fails: true } });
                expectValid(items('link', { sheet: { fails: false } }));
                expectError('is a boolean', { ...loadEventEnd, is: { fails: 1 } });
                expectError('the failed value, which aborts', { ...loadEventEnd, is: { fails: true, gt: 0 } });
                expectError('the failed value, which aborts', { ...loadEventEnd, is: { fails: true, type: 'number' } });
            });

            it('reads `exists` as a property name', () => {
                expectError('"performance.getEntriesByType.loadEventEnd.exists", which is not in API_ALLOWLIST', {
                    ...loadEventEnd,
                    is: { exists: true },
                });
            });

            it('checks operators suit an element property’s type', () => {
                expectError('guard it', items('input', { selectionStart: { gt: 0 } }));
                expectError('guard it', items('img', { src: { gt: 0 } }));
                expectValid(items('input', { selectionStart: { type: 'number', gt: 0 } }));
                expectValid(items('input', { selectionStart: { ...numberTest('isFinite'), gt: 0 } }));
                expectError('guard it', items('input', { selectionStart: { gt: 0, ...numberTest('isFinite') } }));
                expectError('guard it', items('input', { selectionStart: { ...numberTest('isFinite', false), gt: 0 } }));
                expectError('guard it', items('input', { selectionStart: { ...numberTest('isNaN'), gt: 0 } }));
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

        describe('`where` expressions', () => {
            it('admits a boolean expression over `self`, alone and beside predicates under combinators', () => {
                const has = {
                    api: {
                        path: 'Reflect.has',
                        args: [
                            { self: {} },
                            'currentSrc',
                        ],
                    },
                };
                expectValid(items('img', has));
                expectValid(
                    items('input', {
                        any: [
                            { self: 'checked', is: true },
                            { type: 'checkbox' },
                        ],
                    }),
                );
                expectError(
                    'an array is not a predicate',
                    items('input', [
                        { self: 'checked', is: true },
                        { type: 'checkbox' },
                    ]),
                );
                expectValid(items('option', { field: 'text', is: 'Sign in' }));
                expectValid(items('option', { self: 'text', is: 'Sign in' }));
            });

            it('admits a source rooted at the item without a guard', () => {
                expectValid(items('.card', { element: { selector: 'img', root: { self: {} } } }));
                expectValid(items('.card', { element: { selector: 'p', root: { self: {} } }, using: 'length', is: { gte: 2 } }));
                expectError(
                    'needs a guard',
                    items('.card', { element: { selector: 'p', root: { self: 'shadowRoot' } }, using: 'length', is: 0 }),
                );
            });

            it('rejects a source in a `where` or `field` reading neither `self` nor a `ref`, which a `define` before computes once', () => {
                const same = 'reads neither `self` nor a `ref`';
                const width = { api: 'innerWidth' };
                expectError(same, items('.card', { element: { selector: 'img' } }));
                expectError(same, items('.card', { element: { selector: 'img', where: { self: 'complete', is: true } } }));
                expectError(same, items('img', { naturalWidth: { gt: width } }));
                expectError(same, { sum: { element: { selector: 'img', field: width } }, is: { gt: 0 } });
                expectValid(
                    items('div', {
                        api: {
                            path: 'getComputedStyle',
                            args: [
                                { self: {} },
                            ],
                        },
                        using: 'position',
                        is: 'fixed',
                    }),
                );
                expectActionsValid([
                    { define: { width } },
                    {
                        define: {
                            wide: { element: { selector: 'img', where: { naturalWidth: { gt: { ref: 'width' } } } }, using: 'length' },
                        },
                    },
                ]);
            });

            it('binds `self` to each item in the stages beside `iter`, where the per-item rule applies', () => {
                const same = 'reads neither `self` nor a `ref`';
                expectValid({ sum: { iter: { element: { selector: 'img' } }, field: { self: 'naturalWidth' } }, is: { gt: 0 } });
                expectValid({
                    sum: {
                        iter: [
                            1,
                            2,
                        ],
                        field: {
                            sum: [
                                { self: {} },
                                1,
                            ],
                        },
                    },
                    is: { gt: 0 },
                });
                expectError(same, { sum: { iter: { element: { selector: 'img' } }, field: imgCount }, is: { gt: 0 } });
                expectError(same, {
                    sum: {
                        iter: [
                            1,
                        ],
                        where: { element: { selector: 'img' } },
                    },
                    is: { gt: 0 },
                });
                expectError('`self` reads from `using`, `where` or `field`, and none encloses it', {
                    sum: {
                        iter: [
                            { self: {} },
                        ],
                    },
                    is: 0,
                });
            });

            it('rejects `fireEvent` and `breakageReportData` in a `where`, which run once per item, and admits `define`', () => {
                const completeImages = (/** @type {unknown} */ then) => ({
                    define: {
                        n: {
                            element: { selector: 'img', where: { if: { self: 'complete', is: true }, then, else: false } },
                            using: 'length',
                        },
                    },
                });
                expectActionsError(
                    '`fireEvent` inside a `where` or `field` runs once per item',
                    completeImages([
                        { fireEvent: { type: 'a' } },
                        true,
                    ]),
                );
                expectActionsError(
                    '`breakageReportData` inside a `where` or `field` runs once per item',
                    completeImages([
                        { breakageReportData: {} },
                        true,
                    ]),
                );
                expectActionsValid(
                    completeImages([
                        { define: { loaded: { self: 'naturalWidth', is: { gt: 0 } } } },
                        { ref: 'loaded' },
                    ]),
                );
            });

            it('checks the names `self` reads against the item’s properties', () => {
                expectError('"naturalwidth" is not a property of HTMLImageElement', items('img', { self: 'naturalwidth', is: 0 }));
            });

            it('rejects an object mixing expression keys and property paths, and a property named like an expression key', () => {
                expectError('unknown expression key "naturalWidth"', items('img', { self: 'complete', is: true, naturalWidth: 0 }));
                expect(errorsOf(items('option', { text: 'Sign in' }))).to.not.deep.equal([]);
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
                expectError('an array is not an expression', {
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

            it('checks names inside roots', () => {
                expectActionsValid([
                    { define: { region: { element: { selector: '#a' } } } },
                    {
                        define: {
                            has: {
                                all: [
                                    { ref: 'region' },
                                    { element: { selector: 'img', root: { ref: 'region' } } },
                                ],
                            },
                        },
                    },
                ]);
                expectActionsError('reads a run name no `define` binds', {
                    define: { n: { element: { selector: 'img', root: { ref: 'missing' } } } },
                });
                expectActionsError('reads a run name no `define` binds', { define: { widths: { ref: 'widths', using: 'length' } } });
            });

            it('checks payload keys', () => {
                expectValid(true, { brokenImages: { value: imgCount } });
                expectError('reserved', true, { nativeData: { value: imgCount } });
                expectError('does not match', true, { _internal: { value: imgCount } });
                expectError('does not match', true, { '2x': { value: imgCount } });
                expectError('needs `value`', true, { a: { buckets: { x: 1 } } });
            });

            it('checks buckets: at least one, and no overlap among simple predicates', () => {
                expectValid(true, { a: { value: imgCount, buckets: { none: 0, '1-2': { gte: 1, lt: 3 }, '3+': { gte: 3 } } } });
                expectValid(true, { a: { value: loadEventEnd, buckets: { loading: 0, fast: { gt: 0, lt: 3000 } } } });
                expectError('at least one bucket', true, { a: { value: imgCount, buckets: {} } });
                expectError('overlap', true, { a: { value: imgCount, buckets: { none: 0, '0-3': { gte: 0, lt: 3 } } } });
                expectError('overlap', true, { a: { value: imgCount, buckets: { low: { lte: 3 }, high: { gte: 3 } } } });
                expectError('overlap', true, {
                    a: {
                        value: { api: { path: 'document.readyState' } },
                        buckets: {
                            early: {
                                in: [
                                    'loading',
                                    'interactive',
                                ],
                            },
                            mid: 'interactive',
                        },
                    },
                });
                expectValid(true, { a: { value: title, buckets: { empty: { length: 0 }, any: { length: { gte: 0 } } } } });
            });

            it('rejects integer-like bucket names, which JS lists first in ascending order', () => {
                expectError('integer-like', true, { a: { value: imgCount, buckets: { '1+': { gte: 1 }, 0: 0 } } });
                expectError('integer-like', true, { a: { value: imgCount, buckets: { 12: { gte: 12 } } } });
                expectValid(true, { a: { value: imgCount, buckets: { '01': 1, '0-3': { gte: 2, lt: 3 }, '-1': -1 } } });
            });

            it('checks overlap between a literal and a comparison that converts it', () => {
                // Config does not type `document.title`, so its buckets compare without a guard
                expectError('overlap', true, { a: { value: title, buckets: { none: null, some: { gte: 0 } } } });
                expectError('overlap', true, { a: { value: title, buckets: { s: '7', n: { gte: 0 } } } });
                expectError('overlap', true, {
                    a: {
                        value: title,
                        buckets: {
                            s: {
                                in: [
                                    true,
                                ],
                            },
                            n: { gte: 1 },
                        },
                    },
                });
                expectValid(true, { a: { value: title, buckets: { s: '7', n: 7 } } });
                expectValid(true, { a: { value: title, buckets: { none: null, some: { gt: 0 } } } });
                expectValid(true, { a: { value: title, buckets: { unsupported: 'unsupported', some: { gte: 0 } } } });
                expectValid(true, {
                    a: { value: { only: fieldOf('img', 'src') }, buckets: { none: null, some: { type: 'number', gte: 0 } } },
                });
            });

            it('checks bucket and `when` operators against the value’s type', () => {
                expectError('guard it', true, { a: { value: { only: fieldOf('img', 'src') }, buckets: { long: { gt: 100 } } } });
                expectError('guard it', true, { a: { value: { only: fieldOf('img', 'src') }, when: { gt: 100 } } });
            });

            it('admits a comparison on a value whose only strings are literals that convert to NaN', () => {
                /**
                 * @param {unknown} then
                 * @param {unknown} otherwise
                 */
                const engineGuarded = (then, otherwise) => ({
                    if: {
                        api: {
                            path: 'Reflect.has',
                            args: [
                                { api: 'PerformanceResourceTiming.prototype' },
                                'responseStatus',
                            ],
                        },
                    },
                    then,
                    else: otherwise,
                });
                const buckets = { unsupported: 'unsupported', none: 0, '1+': { gte: 1 } };
                expectValid(true, { a: { value: engineGuarded(imgCount, 'unsupported'), buckets } });
                // "7" and "" convert to numbers, and a string read from the page may too
                expectError('guard it', true, { a: { value: engineGuarded(imgCount, '7'), buckets: { '1+': { gte: 1 } } } });
                expectError('guard it', true, { a: { value: engineGuarded(imgCount, ''), buckets: { '1+': { gte: 1 } } } });
                expectError('guard it', true, {
                    a: { value: engineGuarded({ only: fieldOf('img', 'src') }, 'unsupported'), buckets: { '1+': { gte: 1 } } },
                });
            });
        });
    });
});
