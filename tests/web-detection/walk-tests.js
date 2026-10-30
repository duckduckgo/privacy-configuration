import { expect } from 'chai';
import { forEachWebDetectionConfig } from './configs.js';
import { forEachDetectorTextCondition, forEachTextCondition } from './validator/walk.js';

describe('webDetection config tests', () => {
    describe('forEachTextCondition (self-test)', () => {
        /**
         * @param {unknown} match
         * @returns {string[]}
         */
        function collect(match) {
            /** @type {string[]} */
            const found = [];
            forEachTextCondition(match, '$', (condition) => found.push(String(condition.pattern)));
            return found;
        }

        it('reaches a plain text leaf', () => {
            expect(collect({ text: { pattern: 'a' } })).to.deep.equal([
                'a',
            ]);
        });

        it('reaches leaves through operator blocks at both levels', () => {
            const match = {
                all: [
                    {
                        text: {
                            any: [
                                { pattern: 'a' },
                                { pattern: 'b' },
                            ],
                        },
                    },
                    {
                        text: {
                            none: [
                                { pattern: 'c' },
                            ],
                        },
                    },
                ],
            };
            expect(collect(match)).to.deep.equal([
                'a',
                'b',
                'c',
            ]);
        });

        it('reaches leaves through arrays', () => {
            const match = [
                {
                    text: [
                        { pattern: 'a' },
                        { pattern: 'b' },
                    ],
                },
                { element: { selector: '.x' } },
            ];
            expect(collect(match)).to.deep.equal([
                'a',
                'b',
            ]);
        });

        it('ignores element conditions', () => {
            expect(collect({ element: { selector: '.x' } })).to.deep.equal([]);
        });

        it('reaches text under operators, if branches and predicate operands', () => {
            const match = {
                all: [
                    { text: { pattern: 'a' }, using: 'length', is: { gte: 1 } },
                    {
                        if: { text: { pattern: 'b' } },
                        then: { text: { pattern: 'c' }, using: 'length' },
                        else: { text: { pattern: 'd' }, using: 'length' },
                        is: { gt: { text: { pattern: 'e' }, using: 'length' } },
                    },
                    {
                        element: { selector: 'img', where: { naturalWidth: { gt: { text: { pattern: 'f' }, using: 'length' } } } },
                        using: 'length',
                        is: 0,
                    },
                ],
            };
            expect(collect(match)).to.deep.equal([
                'a',
                'b',
                'c',
                'd',
                'e',
                'f',
            ]);
        });

        it('reaches text in source roots', () => {
            const match = {
                all: [
                    { element: { selector: 'img', root: { only: { text: { pattern: 'a' } } } } },
                    {
                        element: {
                            selector: 'p',
                            root: { if: { text: { pattern: 'b' } }, then: { ref: 'x' }, else: { ref: 'y' } },
                        },
                        using: 'length',
                    },
                ],
            };
            expect(collect(match)).to.deep.equal([
                'a',
                'b',
            ]);
        });

        it('reaches text in a `where` expression, and not a property named text read through the long form', () => {
            expect(collect({ element: { selector: 'option', where: { text: { pattern: 'g' } } } })).to.deep.equal([
                'g',
            ]);
            expect(collect({ element: { selector: 'option', where: { field: 'text', is: 'Sign in' } } })).to.deep.equal([]);
        });

        it('reaches text in payload values, when and buckets', () => {
            /** @type {string[]} */
            const found = [];
            const detector = {
                match: true,
                actions: {
                    fireEvent: {
                        type: 't',
                        data: {
                            a: {
                                value: { text: { pattern: 'a' }, using: 'length' },
                                when: { gt: { text: { pattern: 'b' }, using: 'length' } },
                            },
                            c: {
                                value: 1,
                                buckets: [
                                    { name: 'x', is: { lt: { text: { pattern: 'c' }, using: 'length' } } },
                                ],
                            },
                        },
                    },
                    breakageReportData: { data: { d: { value: { text: { pattern: 'd' }, using: 'length' } } } },
                },
            };
            forEachDetectorTextCondition(detector, '$', (condition) => found.push(String(condition.pattern)));
            expect(found).to.deep.equal([
                'a',
                'b',
                'c',
                'd',
            ]);
        });

        it('finds the text conditions in the real configs (sanity)', () => {
            /** @type {string[]} */
            const found = [];
            forEachWebDetectionConfig(({ detectors }) => {
                for (const group of Object.values(detectors)) {
                    for (const detector of Object.values(group)) {
                        forEachTextCondition(detector.match, '$', (condition) => found.push(String(condition.pattern)));
                    }
                }
            });
            expect(found.length).to.be.greaterThan(0);
        });
    });
});
