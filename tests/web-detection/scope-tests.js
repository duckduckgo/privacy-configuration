import { expect } from 'chai';
import { bucketWarnings } from './validator/warnings.js';
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
    shadowRoot,
    text,
    fontsStatus,
    itAll,
} from './fixtures.js';

/**
 * A payload of one field, `a`, sending the value through the buckets.
 *
 * @param {unknown} value
 * @param {unknown[]} buckets
 */
const bucketsOf = (value, buckets) => ({ a: { value, buckets } });

/**
 * The warnings on a payload field sending the value through the buckets.
 *
 * @param {unknown} value
 * @param {unknown[]} buckets
 */
const bucketWarningsOf = (value, buckets) => bucketWarnings({ actions: { breakageReportData: { data: bucketsOf(value, buckets) } } }, '$');

describe('webDetection config tests', () => {
    describe('validateDetector (self-test)', () => {
        describe('`root` guard', () => {
            itAll('passes a guard in match repeating the root, in the same top-level `all` or an enclosing `if`', () => {
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

            itAll('passes a guard in actions: a `ref` to the bound root', () => {
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

            itAll('checks each entry of an array root for a guard', () => {
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

            itAll('passes a scoped leaf read only in boolean position with no `none` above it', () => {
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

            itAll('rejects a scoped expression with no guard, or a guard elsewhere', () => {
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

            itAll('rejects a scoped leaf under `none` with no guard', () => {
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

            itAll('rejects a scoped leaf in `where` with a `none` above it, in the match tree or the predicate, with no guard', () => {
                const shadow = { self: 'shadowRoot' };
                const cardsWithImage = { selector: '.card', where: { element: { selector: 'img', root: shadow } } };
                expectValid({ element: cardsWithImage });
                expectError('needs a guard', { none: { element: cardsWithImage } });
                expectError('needs a guard', {
                    element: { selector: '.card', where: { none: { element: { selector: 'img', root: shadow } } } },
                });
            });

            itAll('requires `is` on a guard that is not an `element` or `text` source', () => {
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
                const scoped = { element: { selector: 'img', root: { ref: 'region' } }, using: 'length' };
                expectActionsError('carries `is`', [
                    { define: { region: shadowRoot } },
                    { if: { ref: 'region' }, then: { breakageReportData: { data: { n: { value: scoped } } } } },
                ]);
                expectActionsValid([
                    { define: { region: shadowRoot } },
                    { if: { ref: 'region', is: { type: 'object' } }, then: { breakageReportData: { data: { n: { value: scoped } } } } },
                ]);
            });

            itAll('rejects a scoped XPath expression that selects from the document', () => {
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

            itAll('rejects an XPath expression evaluated from a shadow root', () => {
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
            itAll('rejects `field` without `is`, and `is` without `field`', () => {
                expectError('go together', items('img', { field: 'currentSrc' }));
                expectError('go together', items('img', { is: true }));
            });

            itAll('takes the type names `typeof` gives', () => {
                expectValid({
                    ...loadEventEnd,
                    is: {
                        type: [
                            'function',
                            'symbol',
                            'bigint',
                            'number',
                        ],
                    },
                });
            });

            itAll('rejects predicates that never hold for a read value', () => {
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

            itAll('checks `"fails": true` reads no value', () => {
                expectValid({ ...loadEventEnd, is: { fails: false, gt: 0 } });
                expectValid({ ...loadEventEnd, is: { fails: true } });
                expectValid(items('link', { sheet: { fails: false } }));
                expectError('the failed value, which aborts', { ...loadEventEnd, is: { fails: true, gt: 0 } });
                expectError('the failed value, which aborts', { ...loadEventEnd, is: { fails: true, type: 'number' } });
            });

            itAll('reads `exists` as a property name', () => {
                expectError('"performance.getEntriesByType.loadEventEnd.exists", which is not in API_ALLOWLIST', {
                    ...loadEventEnd,
                    is: { exists: true },
                });
            });

            itAll('checks operators suit an element property’s type', () => {
                expectError('guard it', items('link', { sheet: { gt: 0 } }));
                expectError('guard it', items('img', { currentSrc: { gt: 0 } }));
                expectValid(items('link', { sheet: { type: 'number', gt: 0 } }));
                expectValid(items('link', { sheet: { ...numberTest('isFinite'), gt: 0 } }));
                expectError('guard it', items('link', { sheet: { gt: 0, ...numberTest('isFinite') } }));
                expectError('guard it', items('link', { sheet: { ...numberTest('isFinite', false), gt: 0 } }));
                expectError('guard it', items('link', { sheet: { ...numberTest('isNaN'), gt: 0 } }));
                expectValid(items('link', { sheet: null }));
            });

            itAll('checks property names per tag, and against every element interface when the selector names none', () => {
                expectError(
                    `reads "naturalwidth" on HTMLImageElement or HTMLElement or Element, which is not in ELEMENT_ALLOWLIST`,
                    items('img', { naturalwidth: 0 }),
                );
                expectError(
                    `reads "naturalWidth" on HTMLElement or Element, which is not in ELEMENT_ALLOWLIST`,
                    items('div.card', { naturalWidth: 0 }),
                );
                expectError(
                    `reads "naturalWidth" on HTMLElement or Element, which is not in ELEMENT_ALLOWLIST`,
                    items('.card', { naturalWidth: 0 }),
                );
                expectValid(items('.card', { hidden: false }));
                expectValid(items('x-widget', { hidden: false }));
            });

            itAll('rejects a property path on a value typed as a number', () => {
                expectError('reads "length" on a value config types as number', { ...imgCount, is: { length: 0 } });
            });

            itAll('requires `Number.isFinite` or `Number.isNaN` beside a comparison under `none` on a value that can be NaN', () => {
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
            itAll('admits a boolean expression over `self`, alone and beside predicates under combinators', () => {
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
                    items('img', {
                        any: [
                            { self: 'complete', is: true },
                            { naturalWidth: 0 },
                        ],
                    }),
                );
                expectError(
                    'an array is not a predicate',
                    items('img', [
                        { self: 'complete', is: true },
                        { naturalWidth: 0 },
                    ]),
                );
                expectValid(items('option', { field: 'textContent', is: 'Sign in' }));
                expectValid(items('option', { self: 'textContent', is: 'Sign in' }));
            });

            itAll('admits a source rooted at the item without a guard', () => {
                expectValid(items('.card', { element: { selector: 'img', root: { self: {} } } }));
                expectValid(items('.card', { element: { selector: 'p', root: { self: {} } }, using: 'length', is: { gte: 2 } }));
                expectError(
                    'needs a guard',
                    items('.card', { element: { selector: 'p', root: { self: 'shadowRoot' } }, using: 'length', is: 0 }),
                );
            });

            itAll(
                'rejects a source in a `where` or `field` reading neither `self` nor a `ref`, which a `define` before computes once',
                () => {
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
                },
            );

            itAll('rejects `fireEvent` and `breakageReportData` in a `where`, which run once per item, and admits `define`', () => {
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

            itAll('checks the names `self` reads against the item’s properties', () => {
                expectError(
                    `reads "naturalwidth" on HTMLImageElement or HTMLElement or Element, which is not in ELEMENT_ALLOWLIST`,
                    items('img', { self: 'naturalwidth', is: 0 }),
                );
            });

            itAll('rejects an object mixing expression keys and property paths, and a property named like an expression key', () => {
                expect(errorsOf(items('option', { text: 'Sign in' }))).to.not.deep.equal([]);
            });
        });

        describe('expression `root` on `element` and `text`', () => {
            itAll('refuses an empty selector root', () => {
                expectError('a selector root is a non-empty string', { element: { selector: 'img', root: '' } });
            });

            itAll('takes an expression giving a node or a list of nodes', () => {
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

            itAll('takes an array of selectors and expressions, and a selector a read gives', () => {
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
                expectValid({ text: { pattern: 'a', root: { only: fieldOf('template', 'textContent') } } });
            });

            itAll('rejects a root of text, numbers or values that are not nodes', () => {
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

            itAll('checks names inside roots', () => {
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

            itAll('checks payload keys', () => {
                expectValid(true, { brokenImages: { value: imgCount } });
                expectError('reserved', true, { nativeData: { value: imgCount } });
                expectError('does not match', true, { _internal: { value: imgCount } });
                expectError('does not match', true, { '2x': { value: imgCount } });
            });

            itAll('checks buckets for overlap among simple predicates', () => {
                expectValid(
                    true,
                    bucketsOf(imgCount, [
                        { name: 'none', is: 0 },
                        { name: '1-2', is: { gte: 1, lt: 3 } },
                        { name: '3+', is: { gte: 3 } },
                    ]),
                );
                expectValid(
                    true,
                    bucketsOf(loadEventEnd, [
                        { name: 'loading', is: 0 },
                        { name: 'fast', is: { gt: 0, lt: 3000 } },
                    ]),
                );
                expectValid(
                    true,
                    bucketsOf({ only: text }, [
                        { name: 'empty', is: { length: 0 } },
                        { name: 'any', is: { length: { gte: 0 } } },
                    ]),
                );
            });

            itAll('rejects a bucket that holds only values an earlier bucket holds', () => {
                const dead = 'never names a value';
                expectError(
                    dead,
                    true,
                    bucketsOf(fontsStatus, [
                        {
                            name: 'early',
                            is: {
                                in: [
                                    'loading',
                                    'interactive',
                                ],
                            },
                        },
                        { name: 'mid', is: 'interactive' },
                    ]),
                );
                expectError(
                    dead,
                    true,
                    bucketsOf(imgCount, [
                        { name: 'a', is: 7 },
                        {
                            name: 'b',
                            is: {
                                in: [
                                    7,
                                ],
                            },
                        },
                    ]),
                );
                expectError(
                    dead,
                    true,
                    bucketsOf(imgCount, [
                        { name: 'some', is: { gt: 0 } },
                        { name: 'many', is: { gte: 10 } },
                    ]),
                );
                expectValid(
                    true,
                    bucketsOf(imgCount, [
                        { name: 'many', is: { gte: 10 } },
                        { name: 'some', is: { gt: 0 } },
                    ]),
                );
            });

            itAll('rejects two ranges that share an endpoint both include', () => {
                expectError(
                    'buckets "low" and "high" both include 3; make one end exclusive with `gt` or `lt`',
                    true,
                    bucketsOf(imgCount, [
                        { name: 'low', is: { lte: 3 } },
                        { name: 'high', is: { gte: 3 } },
                    ]),
                );
                expectError(
                    'both include 2',
                    true,
                    bucketsOf(imgCount, [
                        { name: '1-2', is: { gte: 1, lte: 2 } },
                        { name: '2-3', is: { gte: 2, lte: 3 } },
                    ]),
                );
                expectValid(
                    true,
                    bucketsOf(imgCount, [
                        { name: '1-2', is: { gte: 1, lte: 2 } },
                        { name: '2-3', is: { gt: 2, lte: 3 } },
                    ]),
                );
            });

            itAll('warns on any other overlap, naming the values and the bucket that takes them', () => {
                const zeroToThree = [
                    { name: 'none', is: 0 },
                    { name: '0-3', is: { gte: 0, lt: 3 } },
                ];
                expectValid(true, bucketsOf(imgCount, zeroToThree));
                expect(bucketWarningsOf(imgCount, zeroToThree)).to.deep.equal([
                    '$.actions.breakageReportData.data.a.buckets: buckets "none" and "0-3" overlap on 0, which "none" names since it comes first',
                ]);
                expect(
                    bucketWarningsOf(imgCount, [
                        { name: 'low', is: { lt: 5 } },
                        { name: 'mid', is: { gte: 3, lt: 8 } },
                    ]),
                ).to.deep.equal([
                    '$.actions.breakageReportData.data.a.buckets: buckets "low" and "mid" overlap on {"gte":3,"lt":5}, which "low" names since it comes first',
                ]);
                expect(
                    bucketWarningsOf(imgCount, [
                        { name: 'none', is: 0 },
                        { name: '1-2', is: { gte: 1, lt: 3 } },
                        { name: '3+', is: { gte: 3 } },
                    ]),
                ).to.deep.equal([]);
            });

            itAll('takes any non-empty bucket name', () => {
                expectValid(
                    true,
                    bucketsOf(imgCount, [
                        { name: '0', is: 0 },
                        { name: '1+', is: { gte: 1 } },
                    ]),
                );
            });

            itAll('lets entries sharing a name overlap', () => {
                expectValid(
                    true,
                    bucketsOf(imgCount, [
                        { name: 'edge', is: { lt: 2 } },
                        { name: 'middle', is: { gte: 2, lt: 8 } },
                        { name: 'edge', is: { gte: 8 } },
                        { name: 'edge', is: { gte: 100 } },
                    ]),
                );
            });

            itAll('checks overlap between a literal and a comparison that converts it', () => {
                // Config does not type `document.fonts.status`, so its buckets compare without a guard
                /** @type {Array<[unknown, string]>} */
                const converted = [
                    [
                        null,
                        'null',
                    ],
                    [
                        '7',
                        '"7"',
                    ],
                    [
                        true,
                        'true',
                    ],
                ];
                for (const [
                    literal,
                    written,
                ] of converted) {
                    const buckets = [
                        { name: 's', is: literal },
                        { name: 'n', is: { gte: 0 } },
                    ];
                    expectValid(true, bucketsOf(fontsStatus, buckets));
                    expect(bucketWarningsOf(fontsStatus, buckets)).to.deep.equal([
                        `$.actions.breakageReportData.data.a.buckets: buckets "s" and "n" overlap on ${written}, which "s" names since it comes first`,
                    ]);
                }
                expectError(
                    'never names a value',
                    true,
                    bucketsOf(fontsStatus, [
                        { name: 'n', is: { gte: 1 } },
                        {
                            name: 's',
                            is: {
                                in: [
                                    true,
                                ],
                            },
                        },
                    ]),
                );
                /** @type {unknown[][]} */
                const apart = [
                    [
                        { name: 's', is: '7' },
                        { name: 'n', is: 7 },
                    ],
                    [
                        { name: 'none', is: null },
                        { name: 'some', is: { gt: 0 } },
                    ],
                    [
                        { name: 'unsupported', is: 'unsupported' },
                        { name: 'some', is: { gte: 0 } },
                    ],
                ];
                for (const buckets of apart) {
                    expectValid(true, bucketsOf(fontsStatus, buckets));
                    expect(bucketWarningsOf(fontsStatus, buckets)).to.deep.equal([]);
                }
                expectValid(
                    true,
                    bucketsOf({ only: fieldOf('img', 'currentSrc') }, [
                        { name: 'none', is: null },
                        { name: 'some', is: { type: 'number', gte: 0 } },
                    ]),
                );
            });

            itAll('checks bucket and `when` operators against the value’s type', () => {
                expectError(
                    'guard it',
                    true,
                    bucketsOf({ only: fieldOf('img', 'currentSrc') }, [
                        { name: 'long', is: { gt: 100 } },
                    ]),
                );
                expectError('guard it', true, { a: { value: { only: fieldOf('img', 'currentSrc') }, when: { gt: 100 } } });
            });

            itAll('admits a comparison on a value whose only strings are literals that convert to NaN', () => {
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
                const buckets = [
                    { name: 'unsupported', is: 'unsupported' },
                    { name: 'none', is: 0 },
                    { name: '1+', is: { gte: 1 } },
                ];
                expectValid(true, { a: { value: engineGuarded(imgCount, 'unsupported'), buckets } });
                // "7" and "" convert to numbers, and a string read from the page may too
                expectError(
                    'guard it',
                    true,
                    bucketsOf(engineGuarded(imgCount, '7'), [
                        { name: '1+', is: { gte: 1 } },
                    ]),
                );
                expectError(
                    'guard it',
                    true,
                    bucketsOf(engineGuarded(imgCount, ''), [
                        { name: '1+', is: { gte: 1 } },
                    ]),
                );
                expectError(
                    'guard it',
                    true,
                    bucketsOf(engineGuarded({ only: fieldOf('img', 'currentSrc') }, 'unsupported'), [
                        { name: '1+', is: { gte: 1 } },
                    ]),
                );
            });
        });
    });
});
