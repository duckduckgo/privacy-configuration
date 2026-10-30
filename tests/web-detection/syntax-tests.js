import {
    expectActionsError,
    expectActionsValid,
    expectError,
    expectValid,
    fieldOf,
    img,
    imgCount,
    items,
    loadEventEnd,
    now,
    text,
} from './fixtures.js';

describe('webDetection config tests', () => {
    describe('validateDetector (self-test)', () => {
        describe('shape', () => {
            it('passes the shipped forms: leaves, legacy blocks and boolean literals', () => {
                expectValid({ text: { pattern: 'foo' } });
                expectValid({
                    text: {
                        all: [
                            { pattern: 'foo' },
                            { pattern: 'bar' },
                        ],
                    },
                });
                expectValid({
                    text: {
                        all: [
                            {
                                any: [
                                    { pattern: 'a' },
                                    { pattern: 'b' },
                                ],
                            },
                            {
                                none: [
                                    { pattern: 'c' },
                                ],
                            },
                        ],
                    },
                });
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

            it('rejects an array as an expression, in every position', () => {
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
                    api: { path: 'document.title' },
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

            it('takes a list through `expr`, which stays a list', () => {
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

            it('rejects an array as a predicate, which `in` and `any` replace', () => {
                const notPredicate = 'an array is not a predicate';
                const title = { api: { path: 'document.title' } };
                expectError(notPredicate, {
                    ...title,
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
                        value: title,
                        when: [
                            'a',
                            'b',
                        ],
                    },
                });
                expectValid({
                    ...title,
                    is: {
                        in: [
                            'a',
                            'b',
                        ],
                    },
                });
                expectValid({ ...title, is: { in: 'a' } });
                expectValid({
                    ...title,
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
                    ...title,
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
                        value: title,
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
                    ...title,
                    is: {
                        in: [
                            { api: { path: 'document.cookie' } },
                        ],
                    },
                });
                expectError('an array is not an expression', {
                    ...title,
                    is: {
                        in: [
                            [
                                'a',
                            ],
                        ],
                    },
                });
            });

            it('rejects an object mixing operator keys with leaf keys, and passes them under `all`', () => {
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

            it('rejects mixing operator and body keys inside a source body', () => {
                expectError('mixes operator keys', {
                    text: {
                        all: [
                            { pattern: 'foo' },
                        ],
                        pattern: 'bar',
                    },
                });
                expectError('mixes operator keys', {
                    text: [
                        { pattern: 'ok' },
                        {
                            all: [
                                { pattern: 'foo' },
                            ],
                            pattern: 'bar',
                        },
                    ],
                });
            });

            it('rejects legacy blocks over bodies outside boolean position', () => {
                expectError('boolean only', {
                    text: {
                        any: [
                            { pattern: 'a' },
                        ],
                    },
                    using: 'length',
                    is: { gt: 0 },
                });
            });

            it('rejects unknown expression, body, field and payload field keys', () => {
                expectError('unknown expression key "aggregate"', { aggregate: imgCount });
                expectError('unknown source body key "selector"', {
                    api: { path: 'document.fonts', selector: '#a' },
                    using: 'length',
                    is: 0,
                });
                expectError('unknown source body key "where"', { text: { pattern: 'a', where: {} } });
                expectError('unknown source body key "allowGetter"', { text: { pattern: 'a', allowGetter: true } });
                expectError('unknown `field` key', { ...fieldOf('img', { name: 'src' }), is: {} });
                expectError('unknown payload field key', true, { a: { value: 1, bucket: {} } });
            });

            it('rejects several expression keys in one object, in every position', () => {
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

            it('places `is` in boolean and value position', () => {
                expectValid(true, { a: { value: { ...img, using: 'length', is: { gt: 0 } } } });
                expectError('`is` gives a boolean', {
                    sum: [
                        { ...img, using: 'length', is: { gt: 0 } },
                    ],
                    is: 1,
                });
            });

            it('checks `div` takes two operands', () => {
                expectValid({
                    div: [
                        now,
                        1,
                    ],
                    is: { gt: 0 },
                });
                expectError('two operands', {
                    div: [
                        now,
                        1,
                        2,
                    ],
                    is: { gt: 0 },
                });
                expectError('two operands', { div: now, is: { gt: 0 } });
            });

            it('checks `if` has `then`, and `else` outside value position', () => {
                expectValid({ if: true, then: 1, else: 2, is: 1 });
                expectValid({ if: true, then: 1, is: 1 });
                expectError('fills value position only, not number position', {
                    sum: [
                        { if: true, then: 1 },
                    ],
                    is: 1,
                });
                expectError('`if` needs `then`', { if: true, else: 2, is: 1 });
                expectError('unknown expression key "otherwise"', { if: true, then: 1, else: 2, otherwise: 3, is: 1 });
            });

            it('rejects `catch`', () => {
                expectError('unknown expression key "catch"', { ...imgCount, catch: { absent: 0 }, is: { gt: 0 } });
            });

            it('checks `field` has `path`, and `args` only with `path`', () => {
                expectError('`field` needs `path`', { ...fieldOf('img', {}), is: {} });
                expectError('needs `path`', { ...fieldOf('img', { args: [] }), is: {} });
            });

            it('rejects `"using": {}`, a `self` with `args` and no `path`, and an unknown `visibility`', () => {
                expectError('`path` is a non-empty string', { ...img, using: {}, is: {} });
                expectError('needs `path`', { ...img, using: { self: { args: [] } }, is: {} });
                expectError('unknown visibility', { element: { selector: 'img', visibility: 'shown' } });
            });
        });

        describe('names', () => {
            it('rejects a define or ref not matching the name pattern', () => {
                expectActionsError('does not match', { define: { '1images': imgCount } });
                expectActionsError('does not match', { define: { x: { ref: 'not-a-name' } } });
            });

            it('rejects a ref to a run name no define binds before it', () => {
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

            it('reads a ref in the ref’s own position', () => {
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
            it('rejects literals outside their positions', () => {
                expectError('A number fills', 1);
                expectError('A boolean fills', {
                    sum: [
                        true,
                        1,
                    ],
                    is: { gt: 0 },
                });
            });

            it('takes string and null literals in value position only', () => {
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
                expectError('A string fills', { element: { selector: 'p' }, using: 'length', is: { gt: 'x' } });
                expectValid(true, {
                    word: { value: { if: true, then: 'yes', else: 'no' } },
                    state: { value: { if: false, then: 'x', else: null } },
                });
                expectValid({ api: { path: 'document.readyState' }, is: { eq: { api: { path: 'document.readyState' } } } });
            });

            it('places every source and boolean expression in value position', () => {
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

            it('rejects a `fireEvent` payload field without buckets, and passes any `breakageReportData` value', () => {
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

            it('places `text` and `element` without `field` in list position', () => {
                expectValid({ only: text, is: { length: { gt: 0 } } });
                expectValid({ only: img, is: { field: { path: 'tagName' }, is: 'IMG' } });
                expectValid({ ...text, using: 'length', is: { gt: 0 } });
            });

            it('rejects `text` and `element` without `field` in number position', () => {
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

            it('places a bare `api` in boolean position, and keeps `element` with `field`, `api` with `where` and a length out of it', () => {
                expectValid({ api: { path: 'document.hidden' } });
                expectValid({
                    api: {
                        path: 'matchMedia',
                        args: [
                            '(prefers-reduced-motion: reduce)',
                        ],
                        field: 'matches',
                    },
                });
                expectError('`element` with `field` fills', fieldOf('img', 'complete'));
                expectError('`api` with `where` fills', { api: { path: 'document.fonts', where: { status: 'error' } } });
                expectError('boolean position takes a boolean, and config types the value as number', imgCount);
                expectError('boolean position takes a boolean, and config types the value as number', {
                    only: img,
                    using: 'naturalWidth',
                });
            });

            it('places lists of values under operators', () => {
                expectValid({ all: fieldOf('img', 'complete') });
                expectValid({ sum: fieldOf('img', 'naturalWidth'), is: { gt: 100 } });
                expectError('`all` takes booleans', { all: fieldOf('img', 'naturalWidth') });
                expectError('`sum` takes numbers', { sum: fieldOf('img', 'src'), is: { gt: 0 } });
                expectError('number position takes a number', {
                    div: [
                        fieldOf('img', 'src'),
                        1,
                    ],
                    is: { gt: 0 },
                });
            });

            it('places `only` over lists only', () => {
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
                expectError('`if` fills', { only: { if: true, then: img, else: img }, is: 0 });
                expectError('`only` fills', { only: img });
                expectError('number position takes a number, and config types the value as string', {
                    div: [
                        { only: fieldOf('img', 'src') },
                        1,
                    ],
                    is: { gt: 0 },
                });
            });

            it('spreads sources under operators, with presence leaves booleans under `any`, `all` and `none`', () => {
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

            it('tests a selected list’s one item under a predicate that compares, and the list as an array under any other', () => {
                expectValid({ ...fieldOf('img', 'naturalWidth'), is: { lt: 2000 } });
                expectValid({ ...img, is: { length: { gte: 5 } } });
                expectValid({ ...img, is: { type: 'array' } });
                expectError('guard it', { ...fieldOf('img', 'src'), is: { gt: 3 } });
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
                        value: fieldOf('img', 'src'),
                        buckets: [
                            { name: 'long', is: { gt: 100 } },
                        ],
                    },
                });
            });

            it('checks each `field` step suits the type the previous one gives', () => {
                expectValid(items('img', { 'currentSrc.length': { gt: 0 } }));
                expectValid(items('link', { 'sheet.cssRules': { fails: false } }));
                expectError('reads "length" on a value config types as number', items('img', { 'naturalWidth.length': 0 }));
                expectError('reads "foo" on a value config types as string', items('img', { 'src.foo': 0 }));
            });

            it('rejects `feature` in `field`, and counts rendered text through `text`', () => {
                expectError('unknown `field` key "feature"', {
                    ...fieldOf('body', { path: 'textContent', feature: 'renderedTextLength' }),
                    is: { lt: 1 },
                });
                const excluded = '[not(ancestor::script) and not(ancestor::style) and not(ancestor::template) and not(ancestor::noscript)]';
                const rendered = (root) => ({ text: { xpath: `.//text()${excluded}`, pattern: '\\S', root } });
                expectValid({ text: { xpath: `//body//text()${excluded}`, pattern: '\\S' }, using: 'length', is: { lt: 2000 } });
                expectValid({ element: { selector: 'p', where: { none: rendered({ self: {} }) } }, using: 'length', is: { gt: 0 } });
                expectValid({ sum: fieldOf('p', { ...rendered({ self: {} }), using: 'length' }), is: { gt: 0 } });
            });
        });

        describe('`iter`', () => {
            const widths = { iter: img, where: { complete: true }, field: 'naturalWidth' };

            it('streams a source under `sum`, `mul`, `any`, `all` and `none`, and through `using` `length`', () => {
                expectValid({ sum: widths, is: { gt: 0 } });
                expectValid({ mul: { iter: text, field: 'length' }, is: { gt: 0 } });
                expectValid({ any: { iter: img, field: 'complete' } });
                expectValid({ none: { expr: { iter: img, field: 'complete' } } });
                expectValid({ iter: img, where: { complete: false }, using: 'length', is: 0 });
                expectError('`sum` takes numbers, and config types the values as string', { sum: { iter: text }, is: { gt: 0 } });
                expectError('`all` takes booleans, and config types the values as number', { all: widths });
            });

            it('applies `where` then `field` to each item, the expression form of `where` to strings too', () => {
                expectValid({
                    sum: {
                        iter: text,
                        where: {
                            self: {},
                            is: {
                                in: [
                                    'a',
                                    'b',
                                ],
                            },
                        },
                        field: 'length',
                    },
                    is: { gt: 0 },
                });
                expectValid({
                    sum: {
                        iter: [
                            1,
                            2,
                        ],
                        where: { self: {}, is: { gt: 1 } },
                    },
                    is: { gt: 0 },
                });
                expectError('reads "foo" on a value config types as string', {
                    sum: { iter: text, where: { foo: 1 }, field: 'length' },
                    is: { gt: 0 },
                });
                expectError('"foo" is not a property of HTMLImageElement', { sum: { iter: img, field: 'foo' }, is: { gt: 0 } });
            });

            it('takes each array entry in the position the reader gives an operand', () => {
                expectValid({
                    any: {
                        iter: [
                            img,
                            { api: 'document.hidden' },
                            { ...imgCount, is: { gt: 3 } },
                        ],
                    },
                });
                expectValid({
                    sum: {
                        iter: [
                            imgCount,
                            2,
                            fieldOf('img', 'naturalWidth'),
                        ],
                    },
                    is: { gt: 0 },
                });
                expectError('`using` `length` fills', {
                    any: {
                        iter: [
                            imgCount,
                        ],
                    },
                });
                expectError('A string fills', {
                    sum: {
                        iter: [
                            'a',
                        ],
                    },
                    is: { gt: 0 },
                });
            });

            it('is read in full into a list in value, list and root position', () => {
                expectValid({ only: { iter: img, field: 'naturalWidth' }, is: { gt: 0 } });
                expectValid({
                    iter: [
                        1,
                        2,
                    ],
                    using: {
                        api: {
                            path: 'Math.max.apply',
                            args: [
                                null,
                                { self: {} },
                            ],
                        },
                    },
                    is: { gt: 1 },
                });
                expectValid({ text: { pattern: 'a', root: { iter: { element: { selector: 'dialog' } } } } });
                expectValid(true, {
                    widths: { value: widths },
                    entries: {
                        value: {
                            iter: [
                                1,
                                'a',
                            ],
                        },
                    },
                });
            });

            it('rejects boolean and number position, an operand that is neither a source nor an array, and stages without `iter`', () => {
                expectError('`iter` fills value, list, spread, root position, not boolean position', { iter: img });
                expectError('`iter` fills value, list, spread, root position, not number position', {
                    div: [
                        {
                            iter: [
                                1,
                            ],
                        },
                        1,
                    ],
                    is: { gt: 0 },
                });
                expectError('`iter` takes a source', { sum: { iter: imgCount }, is: { gt: 0 } });
                expectError('`iter` takes a source', { sum: { iter: 1 }, is: { gt: 0 } });
                expectError('`where` sits beside `iter`', { text: { pattern: 'a' }, where: { self: {}, is: 'a' } });
                expectError('`field` sits beside `iter`', { only: img, field: 'naturalWidth', is: 0 });
            });

            it('holds no action in `match`', () => {
                expectError('`match` reads the page only, and holds no action', {
                    any: {
                        iter: [
                            { expr: { define: { seen: 1 } }, is: { type: 'undefined' } },
                        ],
                    },
                });
            });
        });
    });
});
