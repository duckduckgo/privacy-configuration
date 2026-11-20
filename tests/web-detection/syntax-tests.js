import {
    expectActionsError,
    expectActionsValid,
    expectError,
    expectValid,
    fieldOf,
    fontsStatus,
    img,
    imgCount,
    items,
    loadEventEnd,
    now,
    text,
    itAll,
} from './fixtures.js';

describe('webDetection config tests', () => {
    describe('validateDetector (self-test)', () => {
        describe('shape', () => {
            itAll('passes leaves and boolean literals', () => {
                expectValid({ text: { pattern: 'foo' } });
                expectValid({
                    any: [
                        { text: { pattern: 'a' } },
                        { element: { selector: '.x', visibility: 'visible' } },
                    ],
                });
                expectValid({
                    any: [
                        true,
                        false,
                    ],
                });
            });

            itAll('rejects an `any`, `all` or `none` block inside a source body', () => {
                const block = 'a source body holds no';
                expectError(block, {
                    text: {
                        all: [
                            { pattern: 'foo' },
                            { pattern: 'bar' },
                        ],
                    },
                });
                expectError(block, {
                    element: [
                        { selector: 'img' },
                        {
                            none: [
                                { selector: 'video' },
                            ],
                        },
                    ],
                });
            });

            itAll('rejects an array as an expression, in every position', () => {
                const notExpression = 'an array is not an expression';
                expectError(notExpression, [
                    { text: { pattern: 'a' } },
                    { element: { selector: '.x', visibility: 'visible' } },
                ]);
                expectError(notExpression, {
                    all: [
                        { text: { pattern: 'a' } },
                        [
                            true,
                            false,
                        ],
                    ],
                });
                expectError(notExpression, {
                    if: [
                        true,
                    ],
                    then: true,
                    else: false,
                });
                expectError(notExpression, {
                    ...fontsStatus,
                    is: {
                        eq: [
                            'a',
                        ],
                    },
                });
                expectError(notExpression, true, {
                    a: {
                        value: [
                            1,
                            2,
                        ],
                    },
                });
                expectError(notExpression, {
                    api: {
                        path: 'Array.of',
                        args: [
                            [
                                1,
                            ],
                        ],
                    },
                    is: {},
                });
            });

            itAll('takes a list through `expr`, which stays a list', () => {
                expectValid({
                    any: {
                        expr: [
                            true,
                            { text: { pattern: 'a' }, is: { length: { gt: 0 } } },
                        ],
                    },
                });
                expectValid({
                    sum: {
                        expr: [
                            1,
                            2,
                        ],
                    },
                    is: 3,
                });
                expectValid({
                    sum: [
                        {
                            expr: [
                                1,
                                2,
                            ],
                        },
                        3,
                    ],
                    is: 6,
                });
                expectValid({
                    only: {
                        expr: [
                            'a',
                        ],
                    },
                    is: 'a',
                });
                expectValid({
                    expr: [
                        1,
                        2,
                    ],
                    using: 'length',
                    is: 2,
                });
                expectValid({
                    api: {
                        path: 'Math.max.apply',
                        args: [
                            null,
                            {
                                expr: [
                                    1,
                                    2,
                                ],
                            },
                        ],
                    },
                    is: 2,
                });
                expectError('`expr` over an array, a list, fills', {
                    expr: [
                        true,
                    ],
                });
                expectError('`expr` over an array, a list, fills', {
                    div: [
                        {
                            expr: [
                                6,
                            ],
                        },
                        2,
                    ],
                    is: 3,
                });
            });

            itAll('rejects an array as a predicate, which `in` and `any` replace', () => {
                const notPredicate = 'an array is not a predicate';
                expectError(notPredicate, {
                    ...fontsStatus,
                    is: [
                        'a',
                        'b',
                    ],
                });
                expectError(notPredicate, {
                    element: {
                        selector: 'img',
                        where: [
                            { complete: true },
                        ],
                    },
                });
                expectError(notPredicate, {
                    element: {
                        selector: 'img',
                        where: {
                            currentSrc: [
                                'a',
                                'b',
                            ],
                        },
                    },
                });
                expectError(notPredicate, true, {
                    a: {
                        value: fontsStatus,
                        when: [
                            'a',
                            'b',
                        ],
                    },
                });
                expectValid({
                    ...fontsStatus,
                    is: {
                        in: [
                            'a',
                            'b',
                        ],
                    },
                });
                expectValid({ ...fontsStatus, is: { in: 'a' } });
                expectValid({
                    ...fontsStatus,
                    is: {
                        in: {
                            expr: [
                                'a',
                                'b',
                            ],
                        },
                    },
                });
                expectValid({
                    ...fontsStatus,
                    is: {
                        none: {
                            in: [
                                'a',
                                'b',
                            ],
                        },
                    },
                });
                expectValid({
                    element: {
                        selector: 'img',
                        where: {
                            currentSrc: {
                                in: [
                                    'a',
                                    'b',
                                ],
                            },
                        },
                    },
                });
                expectValid(true, {
                    a: {
                        value: fontsStatus,
                        when: {
                            in: [
                                'a',
                                'b',
                            ],
                        },
                    },
                });
                // Each entry is an expression in value position
                expectError('"document.cookie", which is not in API_ALLOWLIST', {
                    ...fontsStatus,
                    is: {
                        in: [
                            { api: { path: 'document.cookie' } },
                        ],
                    },
                });
                expectError('an array is not an expression', {
                    ...fontsStatus,
                    is: {
                        in: [
                            [
                                'a',
                            ],
                        ],
                    },
                });
            });

            itAll('rejects an object mixing operator keys with leaf keys, and passes them under `all`', () => {
                expectError('an object takes one expression key', {
                    all: [
                        { text: { pattern: 'foo' } },
                    ],
                    text: { pattern: 'bar' },
                });
                expectValid({
                    all: [
                        {
                            all: [
                                { text: { pattern: 'foo' } },
                            ],
                        },
                        { text: { pattern: 'bar' } },
                    ],
                });
            });

            itAll('rejects several expression keys in one object, in every position', () => {
                const oneKey = 'an object takes one expression key';
                expectError(oneKey, true, { a: { value: { text: { pattern: 'a' }, element: { selector: 'img' } } } });
                expectError(oneKey, { text: { pattern: 'a' }, element: { selector: 'img' } });
                expectError(oneKey, {
                    any: [
                        true,
                    ],
                    none: [
                        false,
                    ],
                });
                expectError(oneKey, {
                    sum: [
                        { text: { pattern: 'a' }, element: { selector: 'img' } },
                    ],
                    is: { gt: 0 },
                });
                expectError(oneKey, { text: { pattern: 'a' }, element: { selector: 'img' }, is: {} });
                expectError(oneKey, { text: { pattern: 'a' }, element: { selector: 'img' }, using: 'length', is: 1 });
                expectValid(true, {
                    a: {
                        value: {
                            all: [
                                { text: { pattern: 'a' } },
                                { element: { selector: 'img' } },
                            ],
                        },
                    },
                });
            });

            itAll('places `is` in boolean and value position', () => {
                expectValid(true, { a: { value: { ...img, using: 'length', is: { gt: 0 } } } });
                expectError('`is` gives a boolean', {
                    sum: [
                        { ...img, using: 'length', is: { gt: 0 } },
                    ],
                    is: 1,
                });
            });

            itAll('takes two operands in `div`', () => {
                expectValid({
                    div: [
                        now,
                        1,
                    ],
                    is: { gt: 0 },
                });
            });

            itAll('checks `if` has `then`, and `else` outside value position', () => {
                expectValid({ if: true, then: 1, else: 2, is: 1 });
                expectValid({ if: true, then: 1, is: 1 });
                expectError('fills value position only, not number position', {
                    sum: [
                        { if: true, then: 1 },
                    ],
                    is: 1,
                });
                expectError('`if` needs `then`', { if: true, else: 2, is: 1 });
            });

            itAll('rejects a `self` with `args` and no `path`', () => {
                expectError('needs `path`', { ...img, using: { self: { args: [] } }, is: {} });
            });
        });

        describe('names', () => {
            itAll('rejects a define or ref not matching the name pattern', () => {
                expectActionsError('does not match', { define: { '1images': imgCount } });
                expectActionsError('does not match', { define: { x: { ref: 'not-a-name' } } });
            });

            itAll('rejects a ref to a run name no define binds before it', () => {
                expectActionsError('reads a run name no `define` binds before it', { define: { x: { ref: 'missing' } } });
                expectActionsError('reads a run name no `define` binds before it', {
                    define: {
                        a: {
                            sum: [
                                { ref: 'a' },
                                1,
                            ],
                        },
                    },
                });
                expectActionsValid({
                    define: {
                        a: imgCount,
                        b: {
                            sum: [
                                { ref: 'a' },
                                1,
                            ],
                        },
                    },
                });
            });

            itAll('reads a ref in the ref’s own position', () => {
                expectActionsValid([
                    { define: { images: img } },
                    { breakageReportData: { data: { images: { value: { ref: 'images', using: 'length' } } } } },
                ]);
                expectActionsValid([
                    { define: { images: imgCount } },
                    { define: { many: { ref: 'images', is: { gte: 5 } } } },
                ]);
                expectActionsError('boolean position takes a boolean, and config types the name as number', [
                    { define: { images: imgCount } },
                    { if: { ref: 'images' }, then: { breakageReportData: {} } },
                ]);
            });
        });

        describe('placement', () => {
            itAll('refuses a number in list position, through `ref` and `only`', () => {
                expectActionsError('list position takes a list, and config types the name as number', [
                    { define: { n: 1 } },
                    { define: { x: { only: { ref: 'n' } } } },
                ]);
                expectError('list position takes a list, and config types the value as number', {
                    only: { only: fieldOf('img', 'naturalWidth') },
                    is: {},
                });
            });

            itAll('refuses `self` in boolean position on an element', () => {
                expectError('boolean position takes a boolean, and config types the value as object', {
                    element: { selector: 'div', where: { self: {} } },
                });
            });

            itAll('refuses a `field` path with an empty name', () => {
                expectError('a path has an empty name', { ...fieldOf('img', 'currentSrc..length'), using: 'length', is: 0 });
            });

            itAll('takes `field` on every body of an `element` source, or none', () => {
                expectError('every body of one `element` source has `field`, or none does', {
                    element: [
                        { selector: 'img', field: 'naturalWidth' },
                        { selector: 'p' },
                    ],
                    using: 'length',
                    is: 0,
                });
            });

            itAll('rejects literals outside their positions', () => {
                expectError('A number fills', 1);
                expectError('A boolean fills', {
                    sum: [
                        true,
                        1,
                    ],
                    is: { gt: 0 },
                });
            });

            itAll('takes string and null literals in value position only', () => {
                expectError('A string fills', 'x');
                expectError('`null` fills', {
                    any: [
                        null,
                    ],
                });
                expectError('A string fills', {
                    sum: [
                        'x',
                        1,
                    ],
                    is: { gt: 0 },
                });
                expectError('A string fills', { only: 'x', is: 1 });
                expectValid(true, {
                    word: { value: { if: true, then: 'yes', else: 'no' } },
                    state: { value: { if: false, then: 'x', else: null } },
                });
                expectValid({ ...fontsStatus, is: { eq: fontsStatus } });
            });

            itAll('places the operands of `lt`, `lte`, `gt` and `gte` in value position, which the JS operators convert', () => {
                expectValid({ ...imgCount, is: { gt: '5' } });
            });

            itAll('places every source and boolean expression in value position', () => {
                expectValid(true, {
                    matched: {
                        value: text,
                        buckets: [
                            { name: 'some', is: { length: { gt: 0 } } },
                        ],
                    },
                    image: {
                        value: img,
                        buckets: [
                            { name: 'some', is: { length: { gt: 0 } } },
                        ],
                    },
                    either: {
                        value: {
                            any: [
                                text,
                                img,
                            ],
                        },
                    },
                    always: { value: true },
                });
                // `length` on a selected list counts its items: here, the text's matches
                expectValid({ ...text, is: { length: { gt: 0 } } });
                expectValid({ only: { element: { selector: 'input' } }, is: { hidden: false } });
            });

            itAll('rejects a `fireEvent` payload field without buckets, and passes any `breakageReportData` value', () => {
                const images = { define: { images: img } };
                for (const value of [
                    { ref: 'images' },
                    { ref: 'images', using: 'length' },
                    true,
                ]) {
                    expectActionsError('a `fireEvent` payload field is sent through `buckets`', [
                        images,
                        { fireEvent: { type: 't', data: { x: { value } } } },
                    ]);
                    expectActionsValid([
                        images,
                        { breakageReportData: { data: { x: { value } } } },
                    ]);
                }
                expectActionsValid([
                    images,
                    {
                        fireEvent: {
                            type: 't',
                            data: {
                                x: {
                                    value: { ref: 'images', using: 'length' },
                                    buckets: [
                                        { name: 'some', is: { gt: 0 } },
                                    ],
                                },
                            },
                        },
                    },
                ]);
                expectActionsValid([
                    {
                        fireEvent: {
                            type: 't',
                            data: {
                                width: {
                                    value: fieldOf('img', 'naturalWidth'),
                                    buckets: [
                                        { name: 'wide', is: { gt: 100 } },
                                    ],
                                },
                            },
                        },
                    },
                ]);
            });

            itAll('places `text` and `element` without `field` in list position', () => {
                expectValid({ only: text, is: { length: { gt: 0 } } });
                expectValid({ only: img, is: { field: { path: 'textContent' }, is: '' } });
                expectValid({ ...text, using: 'length', is: { gt: 0 } });
            });

            itAll('rejects `text` and `element` without `field` in number position', () => {
                expectError('config types the value as string', {
                    div: [
                        text,
                        1,
                    ],
                    is: { gt: 0 },
                });
                expectError('config types the value as object', {
                    div: [
                        img,
                        1,
                    ],
                    is: { gt: 0 },
                });
            });

            itAll(
                'places a bare `api` in boolean position, and keeps `element` with `field`, `api` with `where` and a length out of it',
                () => {
                    expectValid({ api: { path: 'document.hidden' } });
                    expectError('a list as a condition holds when it has an item', fieldOf('img', 'complete'));
                    expectError('a list as a condition holds when it has an item', {
                        api: { path: 'document.fonts', where: { status: 'error' } },
                    });
                    expectError('boolean position takes a boolean, and config types the value as number', imgCount);
                    expectError('boolean position takes a boolean, and config types the value as number', {
                        only: img,
                        using: 'naturalWidth',
                    });
                },
            );

            itAll('places lists of values under operators', () => {
                expectValid({ all: fieldOf('img', 'complete') });
                expectValid({ sum: fieldOf('img', 'naturalWidth'), is: { gt: 100 } });
                expectError('`all` takes booleans', { all: fieldOf('img', 'naturalWidth') });
                expectError('`sum` takes numbers', { sum: fieldOf('img', 'currentSrc'), is: { gt: 0 } });
                expectError('number position takes a number', {
                    div: [
                        fieldOf('img', 'currentSrc'),
                        1,
                    ],
                    is: { gt: 0 },
                });
            });

            itAll('rejects a source with no body', () => {
                expectError('`element` needs at least one body', { element: [] });
                expectError('`text` needs at least one body', { text: [] });
            });

            itAll('places `only` in any position, checking its item', () => {
                expectValid({ only: fieldOf('img', 'complete') });
                expectError('boolean position takes a boolean, and config types the value as number', {
                    only: fieldOf('img', 'naturalWidth'),
                });
                expectValid({
                    only: {
                        only: {
                            api: {
                                path: 'performance.getEntriesByType',
                                args: [
                                    'navigation',
                                ],
                            },
                        },
                    },
                    is: {},
                });
                expectValid({ only: { if: true, then: img, else: img }, is: {} });
            });

            itAll('spreads an `if` under `sum`, `any`, `all` and `none` when a branch gives a list', () => {
                expectValid({ sum: { if: true, then: fieldOf('img', 'naturalWidth'), else: 0 }, is: { gt: 0 } });
                expectValid({
                    any: {
                        if: true,
                        then: {
                            expr: [
                                true,
                                false,
                            ],
                        },
                        else: false,
                    },
                });
                expectError('this operand takes booleans', { all: { if: true, then: fieldOf('img', 'naturalWidth'), else: true } });
                expectError('`if` without `else`', { sum: { if: true, then: fieldOf('img', 'naturalWidth') }, is: { gt: 0 } });
            });

            itAll('places `only` over lists only', () => {
                expectValid({ only: fieldOf('img', 'naturalWidth'), is: { gt: 0 } });
                expectValid({ only: { api: { path: 'document.fonts' } }, is: { field: 'status', is: 'loaded' } });
                expectValid({
                    div: [
                        { only: fieldOf('img', 'naturalWidth') },
                        1,
                    ],
                    is: { gt: 0 },
                });
                expectError('`using` `length` fills', { only: imgCount, is: { gt: 0 } });
                expectError('A number fills', { only: 1, is: 0 });
                expectError('boolean position takes a boolean, and config types the value as object', { only: img });
                expectError('number position takes a number, and config types the value as string', {
                    div: [
                        { only: fieldOf('img', 'currentSrc') },
                        1,
                    ],
                    is: { gt: 0 },
                });
            });

            itAll('spreads sources under operators, with presence leaves booleans under `any`, `all` and `none`', () => {
                expectValid({
                    any: [
                        img,
                        text,
                    ],
                });
                expectValid({
                    sum: [
                        fieldOf('img', 'naturalWidth'),
                        loadEventEnd,
                    ],
                    is: { gt: 0 },
                });
                expectError('`sum` takes numbers, and config types the values as object', { sum: img, is: { gt: 0 } });
                expectError('`mul` takes numbers, and config types the values as string', { mul: text, is: { gt: 0 } });
            });

            itAll('tests a selected list’s one item under a predicate that compares, and the list as an array under any other', () => {
                expectValid({ ...fieldOf('img', 'naturalWidth'), is: { lt: 2000 } });
                expectValid({ ...img, is: { length: { gte: 5 } } });
                expectValid({ ...img, is: { type: 'array' } });
                expectError('guard it', { ...fieldOf('img', 'currentSrc'), is: { gt: 3 } });
                expectError('guard it', {
                    ...img,
                    is: {
                        any: [
                            { gt: 0 },
                        ],
                    },
                });
                expectError('reads "length" on a value config types as number', {
                    ...fieldOf('img', 'naturalWidth'),
                    is: { length: 2, gt: 0 },
                });
                expectError('reads "naturalWidth" on a list', { ...img, is: { naturalWidth: 0 } });
                expectValid(true, {
                    images: {
                        value: img,
                        buckets: [
                            { name: 'many', is: { length: { gte: 5 } } },
                        ],
                        when: { length: { gt: 1 } },
                    },
                });
                expectError('guard it', true, {
                    images: {
                        value: img,
                        buckets: [
                            { name: 'many', is: { length: { gte: 5 } } },
                        ],
                        when: { gt: 1 },
                    },
                });
                expectError('guard it', true, {
                    sources: {
                        value: fieldOf('img', 'currentSrc'),
                        buckets: [
                            { name: 'long', is: { gt: 100 } },
                        ],
                    },
                });
            });

            itAll('checks each `field` step suits the type the previous one gives', () => {
                expectValid(items('img', { 'currentSrc.length': { gt: 0 } }));
                expectError(
                    'reads "cssRules" on an object no ELEMENT_ALLOWLIST interface',
                    items('link', { 'sheet.cssRules': { fails: false } }),
                );
                expectError('reads "length" on a value config types as number', items('img', { 'naturalWidth.length': 0 }));
                expectError('reads "foo" on a value config types as string', items('img', { 'currentSrc.foo': 0 }));
            });

            itAll('rejects `feature` in `field`, and counts rendered text through `text`', () => {
                const excluded = '[not(ancestor::script) and not(ancestor::style) and not(ancestor::template) and not(ancestor::noscript)]';
                const rendered = (root) => ({ text: { xpath: `.//text()${excluded}`, pattern: '\\S', root } });
                expectValid({ text: { xpath: `//body//text()${excluded}`, pattern: '\\S' }, using: 'length', is: { lt: 2000 } });
                expectValid({ element: { selector: 'p', where: { none: rendered({ self: {} }) } }, using: 'length', is: { gt: 0 } });
                expectValid({ sum: fieldOf('p', { ...rendered({ self: {} }), using: 'length' }), is: { gt: 0 } });
            });
        });
    });
});
