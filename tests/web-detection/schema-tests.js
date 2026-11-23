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

        it('accepts the `observe` trigger, `observed`, `trigger`, `wait` and `done`', () => {
            expect(
                validate({
                    triggers: {
                        observe: {
                            state: 'enabled',
                            on: [
                                { entryType: 'event', durationThreshold: 16, where: { duration: { gte: 200 } }, delayMs: 100 },
                                { event: 'scroll', target: { api: 'visualViewport' }, delayMs: 250, whenPending: 'batch' },
                                { event: 'pagehide', sync: true, whenBusy: 'interrupt' },
                            ],
                        },
                    },
                    actions: [
                        { define: { n: { observed: { event: 'click', keep: { count: 4, withinMs: 1000 } }, using: 'length' } } },
                        { define: { h: { observed: { event: 'pagehide', keep: null, field: 'persisted' } } } },
                        { define: { t: { trigger: { auto: {} } } } },
                        { define: { w: { wait: { event: 'click', target: { ref: 't' }, timeoutMs: null } } } },
                        {
                            define: {
                                m: {
                                    wait: {
                                        mutation: {
                                            childList: true,
                                            subtree: true,
                                            attributeFilter: [
                                                'hidden',
                                            ],
                                        },
                                        target: { api: 'document.body' },
                                        where: { 'addedNodes.length': { gt: 0 } },
                                        timeoutMs: 2500,
                                    },
                                },
                            },
                        },
                        { done: true },
                    ],
                }),
            ).to.equal(true);
        });

        it('rejects an empty `on`, an empty `keep`, two types in a body, keys of other bodies, and malformed `wait` bodies', () => {
            expectRejected('empty on', { triggers: { observe: { on: [] } }, actions });
            expectRejected('empty keep', { actions: { define: { n: { observed: { event: 'click', keep: {} } } } } });
            expectRejected('two types', { actions: { define: { n: { observed: { event: 'click', entryType: 'event' } } } } });
            expectRejected('a value in `auto`', { actions: { define: { n: { trigger: { auto: { a: 1 } } } } } });
            expectRejected('an unknown whenBusy', {
                triggers: {
                    observe: {
                        on: [
                            { event: 'click', whenBusy: 'later' },
                        ],
                    },
                },
                actions,
            });
            expectRejected('a whenPending value it does not take', {
                triggers: {
                    observe: {
                        on: [
                            { event: 'click', whenPending: 'queue' },
                        ],
                    },
                },
                actions,
            });
            expectRejected('mutation without a target', { actions: { define: { n: { wait: { mutation: { childList: true } } } } } });
            expectRejected('empty mutation options', {
                actions: { define: { n: { wait: { mutation: {}, target: { api: 'document' } } } } },
            });
            expectRejected('a mutation flag set to false', {
                actions: { define: { n: { wait: { mutation: { childList: false }, target: { api: 'document' } } } } },
            });
            expectRejected('a negative timeoutMs', { actions: { define: { n: { wait: { event: 'click', timeoutMs: -1 } } } } });
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
