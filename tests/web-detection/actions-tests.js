import { expect } from 'chai';
import { clientDetectors, compareVersions, fireEventTypes, runsOnBreakageReport, writesBreakageData } from './clients.js';
import { validateDetector } from './validator/validate.js';
import { itemWalkWarnings, repeatedEventWarnings } from './validator/warnings.js';

describe('webDetection config tests', () => {
    describe('validateDetector, match and actions (self-test)', () => {
        /**
         * @param {Record<string, unknown>} detector
         */
        const errorsOf = (detector) => validateDetector(detector, '$');

        /**
         * @param {Record<string, unknown>} detector
         */
        const expectValid = (detector) => {
            const errors = errorsOf(detector);
            expect(errors, errors.join('\n')).to.deep.equal([]);
        };

        /**
         * @param {string} fragment
         * @param {Record<string, unknown>} detector
         */
        const expectError = (fragment, detector) => {
            const errors = errorsOf(detector);
            expect(
                errors.some((error) => error.includes(fragment)),
                `expected an error containing ${JSON.stringify(fragment)}, got:\n${errors.join('\n') || '(none)'}`,
            ).to.equal(true);
        };

        const imgCount = { element: { selector: 'img' }, using: 'length' };

        it('passes a detector that detects once, with several actions in one object', () => {
            expectValid({
                match: { ...imgCount, is: { gte: 5 } },
                actions: [
                    { define: { n: imgCount } },
                    { fireEvent: { type: 'manyImages' }, breakageReportData: { data: { n: { value: { ref: 'n' } } } } },
                ],
            });
        });

        it('passes a measurement sending its event once, finished by a detector name', () => {
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

        it('rejects shapes the client does not parse', () => {
            expectError('unknown detector key "items"', { items: [], actions: { breakageReportData: {} } });
            expectError('a detector needs `actions`', { state: 'disabled', triggers: {} });
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
            expectError('a sequence holds at least one element', { actions: [] });
            expectError('`then` sits beside `if` only', { actions: { then: { breakageReportData: {} } } });
            expectError('`if` needs `then`', { actions: { if: true, else: { breakageReportData: {} } } });
            expectError('an object takes one expression key', { actions: { if: true, then: 1, api: 'document' } });
            expectError('fills value position only, not boolean position', {
                match: { if: true, then: true },
                actions: { breakageReportData: {} },
            });
            expectError('name does not match', { actions: { define: { 'that.x': 1 } } });
            expectError('unknown key "state"', {
                match: true,
                actions: { breakageReportData: { data: {} }, fireEvent: { type: 'a', state: 'enabled' } },
            });
        });

        it('rejects an action, a ref and a detector name in a detector with match', () => {
            expectError('holds no action', { match: { expr: { define: { x: 1 } } }, actions: { breakageReportData: {} } });
            expectError('holds no `ref`', { match: { ref: 'x' }, actions: { breakageReportData: {} } });
            expectError('binds no detector name', { match: true, actions: { define: { 'this.x': 1 } } });
            expectError('reads no detector name', { match: true, actions: { define: { x: { ref: 'this.x' } } } });
        });

        it('rejects a run name read before a define binds it, and passes one bound in an earlier branch', () => {
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

        it('passes a detector name read before its define, and rejects one no define binds', () => {
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

        it('types a ref by the defines that can bind it', () => {
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
            expectError('the name is bound to a list', {
                actions: [
                    { define: { x: { element: { selector: 'img', field: 'naturalWidth' } } } },
                    { if: { ref: 'x' }, then: { breakageReportData: {} } },
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

        it('requires a root guard in actions: a ref to the bound root in an enclosing condition', () => {
            const scoped = { element: { selector: 'img', root: { ref: 'region' } }, using: 'length' };
            expectValid({
                actions: [
                    { define: { region: { element: { selector: '#comments' } } } },
                    { if: { ref: 'region' }, then: { breakageReportData: { data: { n: { value: scoped } } } } },
                ],
            });
            expectValid({
                actions: [
                    { define: { region: { element: { selector: '#comments' } } } },
                    {
                        define: {
                            empty: {
                                all: [
                                    { ref: 'region' },
                                    { ...scoped, is: 0 },
                                ],
                            },
                        },
                    },
                ],
            });
            expectError('`root` needs a guard', {
                actions: [
                    { define: { region: { element: { selector: '#comments' } } } },
                    { breakageReportData: { data: { n: { value: scoped } } } },
                ],
            });
            expectError('`root` needs a guard', {
                actions: {
                    if: true,
                    then: {
                        breakageReportData: {
                            data: { n: { value: { element: { selector: 'img', root: '#comments' }, using: 'length' } } },
                        },
                    },
                },
            });
            const shadow = { only: { element: { selector: 'x-widget' } }, using: 'shadowRoot' };
            expectError('carries `is`', {
                actions: [
                    { define: { region: shadow } },
                    { if: { ref: 'region' }, then: { breakageReportData: { data: { n: { value: scoped } } } } },
                ],
            });
            expectValid({
                actions: [
                    { define: { region: shadow } },
                    { if: { ref: 'region', is: { type: 'object' } }, then: { breakageReportData: { data: { n: { value: scoped } } } } },
                ],
            });
        });

        it('requires a root guard in match: the root expression repeated in the same condition', () => {
            const region = { element: { selector: '#comments' } };
            const empty = { element: { selector: 'img', root: region }, using: 'length', is: 0 };
            expectValid({
                match: {
                    all: [
                        region,
                        empty,
                    ],
                },
                actions: { breakageReportData: {} },
            });
            expectValid({ match: { if: region, then: empty, else: false }, actions: { breakageReportData: {} } });
            expectError('`root` needs a guard', { match: empty, actions: { breakageReportData: {} } });
            expectError('`root` needs a guard', {
                match: {
                    all: [
                        { element: { selector: '#other' } },
                        empty,
                    ],
                },
                actions: { breakageReportData: {} },
            });
            expectValid({ match: { element: { selector: 'img', root: region } }, actions: { breakageReportData: {} } });
        });

        describe('repeated events', () => {
            /**
             * @param {Record<string, unknown>} detector
             */
            const warningsOf = (detector) => repeatedEventWarnings(detector, '$');

            it('warns on an event in a detector with no match that no detector name guards', () => {
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

            it('passes an event guarded by a detector name its branch binds, and any event in a detector with match', () => {
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
            const links = {
                self: {
                    path: 'querySelectorAll',
                    args: [
                        'a',
                    ],
                },
                using: 'length',
                is: { gt: 0 },
            };
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

            it('warns on a source rooted at the item, and a call walking from it, with no `if` above it in the `where`', () => {
                expect(walksOf(words)).to.deep.equal([
                    '$.match.element.where.text.root: walks the page from each item of the enclosing `where` or `field`, and nested items walk the same nodes again; test something cheaper in an `if` first',
                ]);
                expect(
                    walksOf({
                        all: [
                            positioned,
                            links,
                        ],
                    }).length,
                ).to.equal(1);
                expect(
                    walksOf({
                        field: {
                            path: 'closest',
                            args: [
                                'form',
                            ],
                        },
                        is: { type: 'object' },
                    }).length,
                ).to.equal(1);
            });

            it('passes a walk behind an `if`, and one outside every `where` and `field`', () => {
                expect(
                    walksOf({
                        if: positioned,
                        then: {
                            all: [
                                words,
                                links,
                            ],
                        },
                        else: false,
                    }),
                ).to.deep.equal([]);
                expect(itemWalkWarnings({ match: { text: { pattern: 'consent', root: 'dialog' } }, actions: {} }, '$')).to.deep.equal([]);
            });
        });

        describe('client views', () => {
            const settings = {
                detectors: { g: { d: { match: true } } },
                conditionalChanges: [
                    {
                        condition: { injectName: 'android', minSupportedVersion: 10 },
                        patchSettings: [
                            { op: 'add', path: '/detectors/g/d/state', value: 'disabled' },
                        ],
                    },
                    {
                        condition: { experiment: { experimentName: 'x', cohort: 'y' } },
                        patchSettings: [
                            { op: 'add', path: '/detectors/g/d/triggers', value: {} },
                        ],
                    },
                ],
            };

            it('applies an entry when its platform and version hold, and other keys as given', () => {
                expect(
                    clientDetectors(
                        settings,
                        [
                            'android',
                        ],
                        10,
                        false,
                    ).g.d,
                ).to.deep.equal({ match: true, state: 'disabled' });
                expect(
                    clientDetectors(
                        settings,
                        [
                            'android',
                        ],
                        9,
                        false,
                    ).g.d,
                ).to.deep.equal({ match: true });
                expect(
                    clientDetectors(
                        settings,
                        [
                            'windows',
                        ],
                        10,
                        true,
                    ).g.d,
                ).to.deep.equal({ match: true, triggers: {} });
            });

            it('compares numbers numerically and strings by component, and no other mix', () => {
                expect(compareVersions('1.10.0', '1.9.0')).to.be.greaterThan(0);
                expect(compareVersions(52720000, 52700000)).to.be.greaterThan(0);
                expect(compareVersions('1.0.0', 1)).to.equal(undefined);
            });

            it('lists the event type of every fireEvent, in branches and sequences', () => {
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

            it('finds a breakageReportData action in branches and sequences', () => {
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

            it('runs a detector on a breakage report unless it or its trigger is disabled', () => {
                expect(runsOnBreakageReport({ match: true, actions: {} })).to.equal(true);
                expect(runsOnBreakageReport({ state: 'disabled', match: true, actions: {} })).to.equal(false);
                expect(runsOnBreakageReport({ triggers: { breakageReport: { state: 'disabled' } }, match: true, actions: {} })).to.equal(
                    false,
                );
            });
        });
    });
});
