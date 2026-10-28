import {
    expectActionsError,
    expectActionsValid,
    expectError,
    expectValid,
    fieldOf,
    img,
    imgCount,
    items,
    numberTest,
    text,
    title,
} from './fixtures.js';

describe('webDetection config tests', () => {
    describe('validateDetector (self-test)', () => {
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
                    ...maxOf({
                        expr: [
                            1,
                            { ...img, using: 'length' },
                        ],
                    }),
                    is: { gt: 0 },
                });
                expectActionsValid([
                    { define: { images: imgCount } },
                    {
                        define: {
                            most: {
                                api: {
                                    path: 'Math.max',
                                    args: [
                                        { ref: 'images' },
                                        1,
                                    ],
                                },
                                is: { gt: 0 },
                            },
                        },
                    },
                ]);
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

            it('counts words with `matchAll` and `Array.from`, as a number', () => {
                const words = {
                    api: {
                        path: 'Array.from',
                        args: [
                            {
                                api: {
                                    path: 'document.title.matchAll',
                                    args: [
                                        '\\S+',
                                    ],
                                },
                            },
                        ],
                    },
                    using: 'length',
                };
                expectValid({ ...words, is: { lte: 3 } });
                expectError('A string fills', { ...words, is: { lte: 'x' } });
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
                        where: { responseStatus: { gte: 400 } },
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

            it('rejects `as`', () => {
                expectError('unknown expression key "as"', items('img', { naturalWidth: { gt: { self: 'naturalHeight', as: 'h' } } }));
            });

            const navigation = {
                api: {
                    path: 'performance.getEntriesByType',
                    args: [
                        'navigation',
                    ],
                },
            };

            it('names a path `using` reads by the name of the expression beside it, through `ref` and `only`', () => {
                expectActionsValid([
                    { define: { navigation: { only: navigation } } },
                    { define: { ended: { ref: 'navigation', using: 'loadEventEnd', is: { gt: 0 } } } },
                ]);
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
                    if: true,
                    then: document,
                    else: document,
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
                const entry = { if: { api: { path: 'document.hidden' } }, then: byType, else: byName };
                expectError('"performance.getEntriesByType.name", which is not in API_ALLOWLIST', {
                    ...entry,
                    using: 'name',
                    is: { type: 'string' },
                });
                expectActionsError('"performance.getEntriesByName.duration", which is not in API_ALLOWLIST', [
                    { define: { entry } },
                    { define: { long: { ref: 'entry', using: 'duration', is: { gt: 0 } } } },
                ]);
                const image = { only: { element: { selector: 'img' } } };
                const either = { if: true, then: image, else: document };
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
                expectValid({ api: { path: 'document' }, using: { path: 'fonts', where: { status: 'error' } }, is: {} });
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

            it('applies `using`, then `is`', () => {
                expectValid({ ...img, using: 'length', is: { gte: 5 } });
                expectActionsValid([
                    { define: { images: { ...img, using: 'length' } } },
                    { breakageReportData: { data: { images: { value: { ref: 'images' } } } } },
                ]);
            });
        });

        describe('`expr`', () => {
            it('binds a value, and what `using` reads from it', () => {
                expectActionsValid([
                    { define: { imageElements: img, imageCount: { ref: 'imageElements', using: 'length' } } },
                    {
                        breakageReportData: {
                            data: {
                                imageCount: { value: { ref: 'imageCount' } },
                                imageElements: { value: { ref: 'imageElements' }, buckets: { two: { length: 2 } } },
                            },
                        },
                    },
                ]);
            });

            it('gives the boolean an `is` inside it gives', () => {
                expectActionsValid([
                    { define: { enoughImages: { expr: { ...img, using: 'length', is: { gte: 2 } } } } },
                    { breakageReportData: { data: { enough: { value: { ref: 'enoughImages' } } } } },
                ]);
                expectValid(true, { enough: { value: { ...img, using: 'length', is: { gte: 2 } } } });
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
    });
});
