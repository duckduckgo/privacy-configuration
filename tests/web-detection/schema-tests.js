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
