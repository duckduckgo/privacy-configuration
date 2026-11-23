import { expect } from 'chai';
import { createValidator } from '../schema-validation.js';

describe('webDetection config tests', () => {
    describe('detector schema (self-test)', () => {
        const validate = createValidator('DetectorConfig');
        const actions = { breakageReportData: {} };

        /**
         * @param {string} name
         * @param {unknown} detector
         */
        const expectRejected = (name, detector) => expect(validate(detector), name).to.equal(false);

        it('accepts a detector with every value non-empty', () => {
            expect(
                validate({
                    match: { text: { pattern: 'a', selector: 'p', xpath: './/text()', root: '#main' } },
                    actions: [
                        { define: { n: 1 } },
                        {
                            breakageReportData: {
                                data: {
                                    n: {
                                        value: { ref: 'n' },
                                        buckets: [
                                            { name: 'one', is: 1 },
                                        ],
                                    },
                                },
                            },
                        },
                    ],
                }),
            ).to.equal(true);
        });

        it('accepts the `observe` trigger, `observed`, `trigger` and `done`', () => {
            expect(
                validate({
                    triggers: {
                        observe: {
                            state: 'enabled',
                            on: [
                                { entryType: 'event', durationThreshold: 16, where: { duration: { gte: 200 } }, delayMs: 100 },
                                { event: 'scroll', target: { api: 'visualViewport' } },
                                { event: 'pagehide', sync: true },
                            ],
                        },
                    },
                    actions: [
                        { define: { n: { observed: { event: 'click', keep: { count: 4, withinMs: 1000 } }, using: 'length' } } },
                        { define: { h: { observed: { event: 'pagehide', keep: null, field: 'persisted' } } } },
                        { define: { t: { trigger: { auto: {} } } } },
                        { done: true },
                    ],
                }),
            ).to.equal(true);
        });

        it('rejects an empty `on`, an empty `keep`, two types in a body, and keys of other bodies', () => {
            expectRejected('empty on', { triggers: { observe: { on: [] } }, actions });
            expectRejected('empty keep', { actions: { define: { n: { observed: { event: 'click', keep: {} } } } } });
            expectRejected('two types', { actions: { define: { n: { observed: { event: 'click', entryType: 'event' } } } } });
            expectRejected('a value in `auto`', { actions: { define: { n: { trigger: { auto: { a: 1 } } } } } });
            expectRejected('whenBusy on an on body', {
                triggers: {
                    observe: {
                        on: [
                            { event: 'click', whenBusy: 'skip' },
                        ],
                    },
                },
                actions,
            });
            expectRejected('negative delayMs', {
                triggers: {
                    observe: {
                        on: [
                            { event: 'click', delayMs: -1 },
                        ],
                    },
                },
                actions,
            });
        });

        it('rejects an empty source body, an empty body list, and an `any`, `all` or `none` block as a body', () => {
            expectRejected('empty text body', { match: { text: {} }, actions });
            expectRejected('empty element body', { match: { element: {} }, actions });
            expectRejected('empty text body list', { match: { text: [] }, actions });
            expectRejected('block over text bodies', {
                match: {
                    text: {
                        all: [
                            { pattern: 'a' },
                            { pattern: 'b' },
                        ],
                    },
                },
                actions,
            });
        });

        it('rejects empty strings, lists and `define`', () => {
            expectRejected('empty pattern', { match: { text: { pattern: '' } }, actions });
            expectRejected('empty pattern list', { match: { text: { pattern: [] } }, actions });
            expectRejected('empty selector entry', {
                match: {
                    element: {
                        selector: [
                            'a',
                            '',
                        ],
                    },
                },
                actions,
            });
            expectRejected('empty xpath', { match: { text: { pattern: 'a', xpath: '' } }, actions });
            expectRejected('empty root list', { match: { element: { selector: 'a', root: [] } }, actions });
            expectRejected('empty api path', { match: { api: { path: '' } }, actions });
            expectRejected('empty field path', { match: { element: { selector: 'a', field: { path: '' } } }, actions });
            expectRejected('empty sequence', { actions: [] });
            expectRejected('empty define', { actions: { define: {} } });
            expectRejected('empty buckets', { actions: { breakageReportData: { data: { a: { value: 1, buckets: [] } } } } });
            expectRejected('empty bucket name', {
                actions: {
                    breakageReportData: {
                        data: {
                            a: {
                                value: 1,
                                buckets: [
                                    { name: '', is: 1 },
                                ],
                            },
                        },
                    },
                },
            });
        });
    });
});
