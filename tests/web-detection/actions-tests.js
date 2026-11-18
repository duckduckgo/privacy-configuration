import { expect } from 'chai';
import { clientViews, fireEventTypes, runsOnBreakageReport, writesBreakageData } from './clients.js';
import { expectDetectorError as expectError, expectDetectorValid as expectValid, imgCount, itAll } from './fixtures.js';
import { itemWalkWarnings, repeatedEventWarnings } from './validator/warnings.js';

describe('webDetection config tests', () => {
    describe('validateDetector, match and actions (self-test)', () => {
        itAll('passes a detector that detects once, with several actions in one object', () => {
            expectValid({
                match: { ...imgCount, is: { gte: 5 } },
                actions: [
                    { define: { n: imgCount } },
                    { fireEvent: { type: 'manyImages' }, breakageReportData: { data: { n: { value: { ref: 'n' } } } } },
                ],
            });
        });

        itAll('passes a measurement sending its event once, finished by a detector name', () => {
            expectValid({
                actions: {
                    if: {
                        none: [
                            { ref: 'this.finished', is: true },
                        ],
                    },
                    then: [
                        { define: { n: imgCount } },
                        { breakageReportData: { data: { n: { value: { ref: 'n' } } } } },
                        {
                            if: {
                                all: [
                                    { ref: 'n', is: { gte: 3 } },
                                    {
                                        none: [
                                            { ref: 'this.sent', is: true },
                                        ],
                                    },
                                ],
                            },
                            then: [
                                { fireEvent: { type: 'manyImages' } },
                                { define: { 'this.sent': true } },
                            ],
                        },
                        { define: { 'this.finished': { ref: 'n', is: { gt: 0 } } } },
                    ],
                },
            });
        });

        itAll('rejects shapes the client does not parse', () => {
            expectError('"api" is not an action', { actions: { fireEvent: { type: 'a' }, api: 'document' } });
            expectError('sits in value position only, not boolean position', {
                match: {
                    all: [
                        { element: { selector: 'p' } },
                        { define: { x: 1 } },
                    ],
                },
                actions: { breakageReportData: {} },
            });
            expectError('an array is not an expression', {
                actions: [
                    [
                        { breakageReportData: {} },
                    ],
                ],
            });
            expectError('`then` sits beside `if` only', { actions: { then: { breakageReportData: {} } } });
            expectError('`if` needs `then`', { actions: { if: true, else: { breakageReportData: {} } } });
            expectError('an object takes one expression key', { actions: { if: true, then: 1, api: 'document' } });
            expectError('fills value position only, not boolean position', {
                match: { if: true, then: true },
                actions: { breakageReportData: {} },
            });
            expectError('name does not match', { actions: { define: { 'that.x': 1 } } });
        });

        itAll('rejects an action, a ref and a detector name in a detector with match', () => {
            expectError('holds no action', { match: { expr: { define: { x: 1 } } }, actions: { breakageReportData: {} } });
            expectError('holds no `ref`', { match: { ref: 'x' }, actions: { breakageReportData: {} } });
            expectError('binds no detector name', { match: true, actions: { define: { 'this.x': 1 } } });
            expectError('reads no detector name', { match: true, actions: { define: { x: { ref: 'this.x' } } } });
        });

        itAll('rejects a run name read before a define binds it, and passes one bound in an earlier branch', () => {
            expectError('reads a run name no `define` binds before it', {
                actions: [
                    { define: { y: { ref: 'x' } } },
                    { define: { x: 1 } },
                ],
            });
            expectError('reads a run name no `define` binds before it', { actions: { define: { y: { ref: 'y' } } } });
            expectValid({ actions: { define: { x: 1, y: { ref: 'x' } } } });
            expectValid({
                actions: [
                    { if: { ...imgCount, is: 0 }, then: { define: { x: 1 } } },
                    { breakageReportData: { data: { x: { value: { ref: 'x' } } } } },
                ],
            });
            expectError('reads a run name no `define` binds before it', {
                actions: [
                    { if: { ref: 'x', is: 1 }, then: { define: { x: 1 } } },
                ],
            });
        });

        itAll('passes a detector name read before its define, and rejects one no define binds', () => {
            expectValid({
                actions: {
                    define: {
                        'this.count': {
                            if: { ref: 'this.count', is: { type: 'undefined' } },
                            then: 1,
                            else: {
                                sum: [
                                    { ref: 'this.count' },
                                    1,
                                ],
                            },
                        },
                    },
                },
            });
            expectError('reads a detector name no `define` in the detector binds', {
                actions: { define: { x: { ref: 'this.never', is: true } } },
            });
        });

        itAll('types a detector name bound to another detector name', () => {
            expectError('number position takes a number, and config types the value as string', {
                actions: [
                    { define: { 'this.a': 'x' } },
                    { define: { 'this.b': { ref: 'this.a' } } },
                    {
                        define: {
                            n: {
                                sum: [
                                    { ref: 'this.b' },
                                ],
                            },
                        },
                    },
                ],
            });
        });

        itAll('rejects a name bound to an `expr` array as a condition or a number, and reads its length', () => {
            const bindArray = {
                define: {
                    list: {
                        expr: [
                            6,
                        ],
                    },
                },
            };
            expectError('boolean position takes a boolean, and config types the name as an array of number', {
                actions: [
                    bindArray,
                    { if: { ref: 'list' }, then: { breakageReportData: {} } },
                ],
            });
            expectError('number position takes a number, and config types the value as an array of number', {
                actions: [
                    bindArray,
                    {
                        define: {
                            half: {
                                div: [
                                    { ref: 'list' },
                                    2,
                                ],
                            },
                        },
                    },
                ],
            });
            expectValid({
                actions: [
                    bindArray,
                    { if: { ref: 'list', using: 'length', is: { gt: 0 } }, then: { breakageReportData: {} } },
                ],
            });
        });

        itAll('types a ref by the defines that can bind it', () => {
            expectError('number position takes a number', {
                actions: [
                    { define: { x: 'unsupported' } },
                    {
                        define: {
                            y: {
                                sum: [
                                    { ref: 'x' },
                                ],
                            },
                        },
                    },
                ],
            });
            expectValid({
                actions: [
                    { define: { x: { element: { selector: 'p' } } } },
                    { if: { ref: 'x' }, then: { breakageReportData: {} } },
                ],
            });
            expectError('"x" is bound to a selected list of values: a list as a condition', {
                actions: [
                    { define: { x: { element: { selector: 'img', field: 'naturalWidth' } } } },
                    { if: { ref: 'x' }, then: { breakageReportData: {} } },
                ],
            });
            expectError('"x" is bound to a selected list of values: a list as a condition', {
                actions: [
                    {
                        define: {
                            x: {
                                api: {
                                    path: 'performance.getEntriesByType',
                                    args: [
                                        'resource',
                                    ],
                                    where: { responseStatus: { gte: 400 } },
                                },
                            },
                        },
                    },
                    { if: { ref: 'x' }, then: { breakageReportData: {} } },
                ],
            });
            expectValid({
                actions: [
                    { define: { x: { element: { selector: 'img', field: 'naturalWidth' } } } },
                    { if: { ref: 'x', using: 'length', is: { gt: 0 } }, then: { breakageReportData: {} } },
                ],
            });
            expectValid({
                actions: [
                    { define: { x: { element: { selector: 'p' } } } },
                    {
                        define: {
                            has: {
                                all: [
                                    { ref: 'x' },
                                    true,
                                ],
                            },
                        },
                    },
                ],
            });
        });

        describe('repeated events', () => {
            /**
             * @param {Record<string, unknown>} detector
             */
            const warningsOf = (detector) => repeatedEventWarnings(detector, '$');

            itAll('warns on an event in a detector with no match that no detector name guards', () => {
                expect(warningsOf({ actions: { fireEvent: { type: 'a' } } }).length).to.equal(1);
                expect(warningsOf({ actions: { if: { ref: 'n', is: 1 }, then: { fireEvent: { type: 'a' } } } }).length).to.equal(1);
                expect(
                    warningsOf({
                        actions: {
                            if: {
                                none: [
                                    { ref: 'this.sent', is: true },
                                ],
                            },
                            then: { fireEvent: { type: 'a' } },
                        },
                    }).length,
                ).to.equal(1);
            });

            itAll('passes an event guarded by a detector name its branch binds, and any event in a detector with match', () => {
                expect(
                    warningsOf({
                        actions: {
                            if: {
                                none: [
                                    { ref: 'this.sent', is: true },
                                ],
                            },
                            then: [
                                { fireEvent: { type: 'a' } },
                                { define: { 'this.sent': true } },
                            ],
                        },
                    }),
                ).to.deep.equal([]);
                expect(warningsOf({ match: true, actions: { fireEvent: { type: 'a' } } })).to.deep.equal([]);
            });
        });

        describe('walks from each item', () => {
            /**
             * @param {unknown} where
             */
            const walksOf = (where) => itemWalkWarnings({ match: { element: { selector: 'div', where } }, actions: {} }, '$');
            const words = { text: { pattern: 'consent', root: { self: {} } } };
            const positioned = {
                api: {
                    path: 'getComputedStyle',
                    args: [
                        { self: {} },
                    ],
                },
                using: 'position',
                is: 'fixed',
            };

            itAll('warns on a `text` source rooted at the item with no `if` above it in the `where`', () => {
                expect(walksOf(words)).to.deep.equal([
                    '$.match.element.where.text.root: walks the page from each item of the enclosing `where` or `field`, and nested items walk the same nodes again; test something cheaper in an `if` first',
                ]);
            });

            itAll('passes an `element` source rooted at the item, which runs one query from it', () => {
                expect(walksOf({ element: { selector: 'img', root: { self: {} } } })).to.deep.equal([]);
            });

            itAll('passes a walk behind an `if`, and one outside every `where` and `field`', () => {
                expect(
                    walksOf({
                        if: positioned,
                        then: words,
                        else: false,
                    }),
                ).to.deep.equal([]);
                expect(itemWalkWarnings({ match: { text: { pattern: 'consent', root: 'dialog' } }, actions: {} }, '$')).to.deep.equal([]);
            });
        });

        describe('client views', () => {
            const cohorts = [
                { name: 'control', weight: 1 },
                { name: 'treatment', weight: 1 },
            ];
            /**
             * A config whose entries patch detector `g.d`, with experiments `x` and `y` on.
             *
             * @param {unknown[]} conditionalChanges
             * @param {Record<string, any>} [experiment] - the `x` experiment's subfeature
             */
            const configWith = (conditionalChanges, experiment = { state: 'enabled', cohorts }) => ({
                features: {
                    contentScopeExperiments: { state: 'enabled', features: { x: experiment, y: { state: 'enabled', cohorts } } },
                    webDetection: { settings: { detectors: { g: { d: { match: true, triggers: { auto: {} } } } }, conditionalChanges } },
                },
            });
            /**
             * An entry adding `key` to `g.d` where the condition holds.
             *
             * @param {Record<string, unknown>} condition
             * @param {string} key
             */
            const adding = (condition, key) => ({
                condition,
                patchSettings: [
                    { op: 'add', path: `/detectors/g/d/${key}`, value: true },
                ],
            });
            /**
             * Each `android` view at the version, labelled, with the keys the entries added to `g.d`.
             *
             * @param {Record<string, any>} config
             * @param {number} [version]
             */
            const addedKeys = (config, version = 10) =>
                Object.fromEntries(
                    clientViews(config, 'android', version)
                        .filter(({ injectName }) => injectName === 'android')
                        .map(({ label, detectors }) => [
                            label,
                            Object.keys(detectors.g.d)
                                .filter((key) => key !== 'match' && key !== 'triggers')
                                .join(),
                        ]),
                );

            itAll('applies an entry when its platform and version hold, and never one with a key C-S-S does not match', () => {
                const config = configWith([
                    adding({ injectName: 'android', minSupportedVersion: 10 }, 'a'),
                    adding({ injectName: 'android', unknownKey: true }, 'b'),
                ]);
                expect(addedKeys(config, 10)).to.deep.equal({ 'android 10': 'a' });
                expect(addedKeys(config, 9)).to.deep.equal({ 'android 9': '' });
            });

            itAll('puts the client in one cohort of an experiment at a time, or in none', () => {
                const config = configWith([
                    {
                        condition: { experiment: { experimentName: 'x', cohort: 'control' } },
                        patchSettings: [
                            { op: 'remove', path: '/detectors/g/d' },
                        ],
                    },
                    {
                        condition: { experiment: { experimentName: 'x', cohort: 'treatment' } },
                        patchSettings: [
                            {
                                op: 'add',
                                path: '/detectors/g/d/triggers/auto/when',
                                value: {
                                    intervalMs: [
                                        1000,
                                    ],
                                },
                            },
                        ],
                    },
                ]);
                const views = clientViews(config, 'android', 10).filter(({ injectName }) => injectName === 'android');
                expect(views.flatMap(({ failed }) => failed)).to.deep.equal([]);
                expect(
                    views.map(({ label, detectors }) => [
                        label,
                        detectors.g.d?.triggers.auto.when ?? (detectors.g.d ? 'unchanged' : 'removed'),
                    ]),
                ).to.deep.equal([
                    [
                        'android 10, x: not enrolled',
                        'unchanged',
                    ],
                    [
                        'android 10, x: control',
                        'removed',
                    ],
                    [
                        'android 10, x: treatment',
                        {
                            intervalMs: [
                                1000,
                            ],
                        },
                    ],
                ]);
            });

            itAll('combines the cohorts of two experiments', () => {
                const config = configWith([
                    adding({ experiment: { experimentName: 'x', cohort: 'treatment' } }, 'a'),
                    adding({ experiment: { experimentName: 'y', cohort: 'treatment' } }, 'b'),
                ]);
                const keys = addedKeys(config);
                expect(Object.keys(keys)).to.have.length(9);
                expect(keys['android 10, x: treatment, y: treatment']).to.equal('a,b');
                expect(keys['android 10, x: not enrolled, y: treatment']).to.equal('b');
            });

            itAll('enrols the client only in an experiment on at its version', () => {
                const config = configWith(
                    [
                        adding({ experiment: { experimentName: 'x', cohort: 'treatment' } }, 'a'),
                    ],
                    { state: 'enabled', minSupportedVersion: 11, cohorts },
                );
                expect(addedKeys(config, 10)).to.deep.equal({ 'android 10, x: not enrolled': '' });
                expect(
                    addedKeys(
                        configWith(
                            [
                                adding({ experiment: { experimentName: 'x', cohort: 'treatment' } }, 'a'),
                            ],
                            { state: 'disabled', cohorts },
                        ),
                    ),
                ).to.deep.equal({
                    'android 10, x: not enrolled': '',
                });
            });

            itAll('puts the page on one domain at a time, which also matches its parent domains', () => {
                expect(
                    addedKeys(
                        configWith([
                            adding({ domain: 'a.com' }, 'a'),
                            adding({ domain: 'b.com' }, 'b'),
                        ]),
                    ),
                ).to.deep.equal({
                    'android 10, no domain': '',
                    'android 10, domain a.com': 'a',
                    'android 10, domain b.com': 'b',
                });
                expect(
                    addedKeys(
                        configWith([
                            adding({ domain: 'example.com' }, 'a'),
                            adding({ domain: 'shop.example.com' }, 'b'),
                        ]),
                    ),
                ).to.deep.equal({
                    'android 10, no domain': '',
                    'android 10, domain example.com': 'a',
                    'android 10, domain shop.example.com': 'a,b',
                });
            });

            itAll('applies an `internal` entry in internal builds only', () => {
                expect(
                    addedKeys(
                        configWith([
                            adding({ internal: true }, 'a'),
                        ]),
                    ),
                ).to.deep.equal({
                    'android 10, not internal': '',
                    'android 10, internal': 'a',
                });
            });

            itAll('runs a C-S-S release in each range the C-S-S version bounds split', () => {
                const config = configWith([
                    adding({ minContentScopeScriptsVersion: '20.0.0' }, 'a'),
                    adding({ maxContentScopeScriptsVersion: '25.0.0' }, 'b'),
                ]);
                expect(addedKeys(config)).to.deep.equal({
                    'android 10, C-S-S 0.0.0': 'b',
                    'android 10, C-S-S 20.0.0': 'a,b',
                    'android 10, C-S-S 20.0.1': 'a,b',
                    'android 10, C-S-S 25.0.0': 'a,b',
                    'android 10, C-S-S 25.0.1': 'a',
                });
            });

            itAll('fails an entry whose operation reads a pointer that names no value', () => {
                const typo = {
                    condition: { injectName: 'android' },
                    patchSettings: [
                        { op: 'replace', path: '/detectors/g/d/matc', value: false },
                    ],
                };
                const [
                    view,
                ] = clientViews(
                    configWith([
                        typo,
                        adding({ injectName: 'android' }, 'state'),
                    ]),
                    'android',
                    10,
                );
                expect(view.failed).to.deep.equal([
                    typo,
                ]);
                expect(view.detectors.g.d).to.deep.equal({ match: true, triggers: { auto: {} }, state: true });
            });

            itAll('lists the event type of every fireEvent, in branches and sequences', () => {
                expect(
                    fireEventTypes({
                        actions: [
                            { fireEvent: { type: 'a' } },
                            {
                                if: true,
                                then: [
                                    { fireEvent: { type: 'b' } },
                                ],
                                else: { if: false, then: { fireEvent: { type: 'c' } } },
                            },
                        ],
                    }),
                ).to.deep.equal([
                    'a',
                    'b',
                    'c',
                ]);
                expect(fireEventTypes({ match: true, actions: { fireEvent: { type: 'd' } } })).to.deep.equal([
                    'd',
                ]);
            });

            itAll('finds a breakageReportData action in branches and sequences', () => {
                expect(
                    writesBreakageData({
                        actions: [
                            { define: { x: 1 } },
                            {
                                if: true,
                                then: { fireEvent: { type: 'a' } },
                                else: [
                                    { breakageReportData: {} },
                                ],
                            },
                        ],
                    }),
                ).to.equal(true);
                expect(
                    writesBreakageData({
                        match: true,
                        actions: [
                            { fireEvent: { type: 'a' } },
                            { define: { x: 1 } },
                        ],
                    }),
                ).to.equal(false);
            });

            itAll('runs a detector on a breakage report unless it or its trigger is disabled', () => {
                expect(runsOnBreakageReport({ match: true, actions: {} })).to.equal(true);
                expect(runsOnBreakageReport({ state: 'disabled', match: true, actions: {} })).to.equal(false);
                expect(runsOnBreakageReport({ triggers: { breakageReport: { state: 'disabled' } }, match: true, actions: {} })).to.equal(
                    false,
                );
            });
        });
    });
});
