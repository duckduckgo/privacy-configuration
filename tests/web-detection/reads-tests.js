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
    fontsStatus,
    itAll,
} from './fixtures.js';

describe('webDetection config tests', () => {
    describe('validateDetector (self-test)', () => {
        describe('`api` names and data reads', () => {
            itAll('checks expression `args`, and the calls config can type', () => {
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
                expectError('`apply` takes its arguments as a selected list', { ...maxOf(fontsStatus), is: {} });
                expectError('`Math.max` takes numbers, and config types the value as string', {
                    ...maxOf(fieldOf('img', 'textContent')),
                    is: {},
                });
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
            });

            itAll('reads a method as a function in an `args` entry, named as its own call', () => {
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

            itAll('checks `api` names are read as the kind API_ALLOWLIST records', () => {
                expectError('reads the method "performance.now" without calling it', { api: { path: 'performance.now' }, is: {} });
                expectError('calls "document.fonts.status", which API_ALLOWLIST records as a property', {
                    api: { path: 'document.fonts.status', args: [] },
                    is: {},
                });
                expectError('reads the method "performance.getEntriesByType" without calling it', {
                    api: { path: 'performance', field: 'getEntriesByType.length' },
                    is: {},
                });
            });

            itAll('reads `length` and indexes on strings', () => {
                expectValid({ only: text, is: { length: 1 } });
                expectValid({ only: text, is: { 0: 'a' } });
            });
        });

        describe('element names', () => {
            const notListed = 'which is not in ELEMENT_ALLOWLIST';

            itAll('reads a name ELEMENT_ALLOWLIST lists for the tag, or for every element', () => {
                expectValid({ only: img, is: { complete: true, naturalWidth: 0 } });
                expectValid({ only: { element: { selector: 'video' } }, using: 'duration', is: { gt: 0 } });
                expectValid({ only: { element: { selector: '#main > div' } }, using: 'textContent.length', is: 0 });
                expectError(`reads "naturalWidth" on HTMLMediaElement or HTMLElement or Element, ${notListed}`, {
                    only: { element: { selector: 'video' } },
                    is: { naturalWidth: 0 },
                });
            });

            itAll('refuses an unlisted name, a typo, and a name on an element of unknown tag', () => {
                expectError(`reads "naturalWidht" on HTMLImageElement or HTMLElement or Element, ${notListed}`, {
                    only: img,
                    is: { naturalWidht: 0 },
                });
                expectError(`reads "value" on HTMLElement or Element, ${notListed}`, {
                    only: { element: { selector: 'div' } },
                    is: { value: 3 },
                });
                expectError(`reads "complete" on HTMLElement or Element, ${notListed}`, {
                    only: { element: { selector: '.thumbnail' } },
                    is: { complete: true },
                });
            });

            itAll('refuses names reading user data or URLs, and any read from an object no interface names', () => {
                /**
                 * @param {string} using
                 * @param {unknown} [element]
                 */
                const sent = (using, element = img) => ({ breakageReportData: { data: { c: { value: { only: element, using } } } } });
                expectActionsError(
                    `reads "ownerDocument" on HTMLImageElement or HTMLElement or Element, ${notListed}`,
                    sent('ownerDocument.cookie'),
                );
                expectActionsError(`reads "href" on HTMLElement or Element, ${notListed}`, sent('href', { element: { selector: 'a' } }));
                expectError('reads "cssRules" on an object no ELEMENT_ALLOWLIST interface', {
                    only: { element: { selector: 'link' } },
                    using: 'sheet.cssRules.length',
                    is: 0,
                });
            });

            itAll('reads a listed interface a method gives', () => {
                expectValid({
                    only: img,
                    using: { self: { path: 'getBoundingClientRect', args: [] }, using: 'width' },
                    is: { gt: 0 },
                });
                expectError(`reads "x" on DOMRect, ${notListed}`, {
                    only: img,
                    using: { self: { path: 'getBoundingClientRect', args: [] }, using: 'x' },
                    is: { gt: 0 },
                });
            });

            itAll('reads page-defined values under names outside ELEMENT_ALLOWLIST on custom elements only', () => {
                expectValid({ only: { element: { selector: 'x-widget' } }, is: { value: 3 } });
                expectError(`reads "value" on HTMLElement or Element, ${notListed}`, {
                    only: { element: { selector: 'div' } },
                    is: { value: 3 },
                });
            });
        });

        describe('calls on element items', () => {
            itAll('admits methods on ELEMENT_ALLOWLIST only, called', () => {
                expectValid({
                    element: {
                        selector: 'div',
                        where: {
                            field: {
                                path: 'checkVisibility',
                                args: [],
                            },
                            is: true,
                        },
                    },
                    using: 'length',
                    is: { gt: 0 },
                });
                expectError('calls "click" on HTMLElement or Element, which is not in ELEMENT_ALLOWLIST', {
                    element: { selector: 'button', where: { field: { path: 'click', args: [] }, is: true } },
                    using: 'length',
                    is: 0,
                });
                expectError('not an element', items('img', { field: { path: 'currentSrc.toString', args: [] }, is: 'x' }));
                expectError('reads the method "checkVisibility" without calling it', items('img', { checkVisibility: true }));
                expectError(
                    'calls "complete", which ELEMENT_ALLOWLIST records as a property',
                    items('img', { field: { path: 'complete', args: [] }, is: true }),
                );
            });
        });

        describe('`api` allowlist', () => {
            itAll('checks each name of the path, `field` names and the names predicates read', () => {
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
                expectError('"document.fonts.status.length"', { ...fontsStatus, is: { length: 8 } });
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
        });

        describe('`self` and `api` paths', () => {
            itAll('takes a path as short for an `api` body', () => {
                expectValid({ api: 'document.fonts.status', is: { type: 'string' } });
                expectValid({
                    api: {
                        path: 'Math.max',
                        args: [
                            1,
                            { api: 'innerWidth' },
                        ],
                    },
                    is: { gt: 0 },
                });
                expectError('"document.cookie", which is not in API_ALLOWLIST', { api: 'document.cookie', is: {} });
                expectError('reads the method "performance.now" without calling it', { api: 'performance.now', is: {} });
            });

            itAll('passes the value to a listed method through `self`, in `where` and under `is`', () => {
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
                            path: 'Math.max',
                            args: [
                                { self: 'naturalWidth' },
                                5,
                            ],
                        },
                    }),
                    is: { gt: 0 },
                });
            });

            itAll('reads each item through `self` in `where`, by the item’s type', () => {
                expectValid(items('img', { width: { gt: { self: 'height' } } }));
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
                    `reads "noSuchProperty" on HTMLImageElement or HTMLElement or Element, which is not in ELEMENT_ALLOWLIST`,
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

            itAll('rejects a method not on the allowlist, and `call` in `field`', () => {
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
            });

            itAll('rejects `self` outside `using`, `where` and `field`', () => {
                expectError('`self` reads from `using`, `where` or `field`', { self: 'length', is: 0 });
                expectError('`self` reads from `using`, `where` or `field`', true, { x: { value: { self: {} } } });
            });

            const navigation = {
                api: {
                    path: 'performance.getEntriesByType',
                    args: [
                        'navigation',
                    ],
                },
            };

            itAll('names a path `using` reads by the name of the expression beside it, through `ref` and `only`', () => {
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

            itAll('reads an item with `at` or an index on a list or an `api` read, under the item’s name', () => {
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
                expectError(`reads "naturalWidth" on HTMLElement or Element, which is not in ELEMENT_ALLOWLIST`, {
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

            itAll('checks what `using` reads under each name the expression beside it may have', () => {
                const document = { api: { path: 'document' } };
                expectValid({
                    if: true,
                    then: document,
                    else: document,
                    using: 'hidden',
                    is: { type: 'boolean' },
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
                expectValid({ ...either, using: 'hidden', is: { type: 'boolean' } });
                expectError('"document.naturalWidth", which is not in API_ALLOWLIST', {
                    ...either,
                    using: 'naturalWidth',
                    is: { gt: 0 },
                });
            });

            itAll('rejects an expression beside `using` that CI cannot name', () => {
                expectError('this expression has neither', { only: text, using: 'length', is: { gt: 0 } });
                expectError('this expression has neither', { expr: imgCount, using: { path: 'toFixed', args: [] }, is: {} });
                expectError('this expression has neither', { expr: 1, using: { path: 'toFixed', args: [] }, is: {} });
            });

            itAll('places the expression beside `using` in value position', () => {
                expectValid({
                    sum: [
                        imgCount,
                        1,
                    ],
                    using: {
                        div: [
                            { self: {} },
                            2,
                        ],
                    },
                    is: { gt: 1 },
                });
            });

            itAll('takes a path, or an `api` body without `root`, beside an expression', () => {
                expectValid({ api: { path: 'document' }, using: 'fonts', is: { type: 'object' } });
                expectValid({ api: { path: 'document' }, using: { path: 'fonts', where: { status: 'error' } }, is: {} });
                expectError('`using` reads from an expression', { using: 'length', is: 1 });
            });

            itAll('takes an expression reading the value beside it through `self`', () => {
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

            itAll('applies `using`, then `is`', () => {
                expectValid({ ...img, using: 'length', is: { gte: 5 } });
                expectActionsValid([
                    { define: { images: { ...img, using: 'length' } } },
                    { breakageReportData: { data: { images: { value: { ref: 'images' } } } } },
                ]);
            });
        });

        describe('`expr`', () => {
            itAll('binds a value, and what `using` reads from it', () => {
                expectActionsValid([
                    { define: { imageElements: img, imageCount: { ref: 'imageElements', using: 'length' } } },
                    {
                        breakageReportData: {
                            data: {
                                imageCount: { value: { ref: 'imageCount' } },
                                imageElements: {
                                    value: { ref: 'imageElements' },
                                    buckets: [
                                        { name: 'two', is: { length: 2 } },
                                    ],
                                },
                            },
                        },
                    },
                ]);
            });

            itAll('gives the boolean an `is` inside it gives', () => {
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

            itAll('gives its operand in its own position', () => {
                expectValid({ sum: { expr: { element: { selector: 'img', field: 'naturalWidth' } } }, is: { gt: 0 } });
                expectValid({ expr: img });
                expectError('a list as a condition holds when it has an item', {
                    expr: { element: { selector: 'img', field: 'naturalWidth' } },
                });
            });
        });
    });
});
