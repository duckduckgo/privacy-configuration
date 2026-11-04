import { expect } from 'chai';
import {
    assertExpressionPatch,
    assertTextConditionExpressions,
    assertValidPattern,
    assertValidXPath,
    assertXPathConfig,
} from './validator/xpath.js';

describe('webDetection config tests', () => {
    describe('xpathConfig validation (self-test)', () => {
        /**
         * @param {Record<string, unknown>} xpathConfig
         */
        const check = (xpathConfig) => () => assertXPathConfig(xpathConfig, '$');

        it('accepts an in-bounds config', () => {
            expect(check({ chunkSize: 8192, chunkTail: 512 })).to.not.throw();
        });

        it('accepts chunkSize 0, which disables chunking', () => {
            expect(check({ chunkSize: 0 })).to.not.throw();
            // The tail is unused once chunking is off, so the ratio does not apply
            expect(check({ chunkSize: 0, chunkTail: 99999 })).to.not.throw();
        });

        it('accepts chunkTail 0', () => {
            expect(check({ chunkSize: 8192, chunkTail: 0 })).to.not.throw();
        });

        it('rejects non-integer and negative values', () => {
            expect(check({ chunkSize: 8192.5 })).to.throw();
            expect(check({ chunkSize: -1 })).to.throw();
            expect(check({ chunkTail: '512' })).to.throw();
        });

        it('rejects a non-zero chunkSize below the floor', () => {
            expect(check({ chunkSize: 32 })).to.throw();
        });

        it('rejects a chunkTail above a quarter of chunkSize', () => {
            expect(check({ chunkSize: 8192, chunkTail: 2049 })).to.throw();
            expect(check({ chunkSize: 8192, chunkTail: 2048 })).to.not.throw();
        });

        it('checks a lone chunkTail in isolation, since the ratio needs a chunkSize', () => {
            expect(check({ chunkTail: 99999 })).to.not.throw();
            expect(check({ chunkTail: -1 })).to.throw();
        });
    });

    describe('expression validation (self-test)', () => {
        /** @param {unknown} expression */
        const checkXPath = (expression) => () => assertValidXPath(expression, '$');

        /** @param {unknown} pattern */
        const checkPattern = (pattern) => () => assertValidPattern(pattern, '$');

        it('accepts XPath expressions of the shape detectors use', () => {
            expect(checkXPath('//div//text()')).to.not.throw();
            expect(checkXPath('//*[@class="banner"]//text()')).to.not.throw();
            expect(checkXPath('//div[contains(@id, "consent")]')).to.not.throw();
        });

        it('rejects malformed XPath expressions', () => {
            expect(checkXPath('//div[')).to.throw();
            expect(checkXPath('//div[@class="a"')).to.throw();
            expect(checkXPath('')).to.throw();
        });

        it('rejects a non-string XPath expression', () => {
            expect(checkXPath(42)).to.throw();
            expect(checkXPath(null)).to.throw();
        });

        it('accepts a single pattern and an array of them', () => {
            expect(checkPattern('foo')).to.not.throw();
            expect(
                checkPattern([
                    'foo',
                    'bar(baz)?',
                ]),
            ).to.not.throw();
        });

        it('rejects a malformed pattern', () => {
            expect(checkPattern('foo(')).to.throw();
            expect(checkPattern('[a-')).to.throw();
        });

        it('rejects entries that are only valid as a pair', () => {
            expect(
                checkPattern([
                    'a(',
                    'b)',
                ]),
            ).to.throw();
        });

        it('rejects a non-string pattern entry', () => {
            expect(
                checkPattern([
                    'foo',
                    7,
                ]),
            ).to.throw();
        });

        it('checks both keys of a text leaf', () => {
            expect(() => assertTextConditionExpressions({ pattern: 'foo', xpath: '//div//text()' }, '$')).to.not.throw();
            expect(() => assertTextConditionExpressions({ pattern: 'foo(', xpath: '//div//text()' }, '$')).to.throw();
            expect(() => assertTextConditionExpressions({ pattern: 'foo', xpath: '//div[' }, '$')).to.throw();
            expect(() => assertTextConditionExpressions({ pattern: 'foo' }, '$')).to.not.throw();
        });

        it('checks every entry of an xpath array', () => {
            expect(() =>
                assertTextConditionExpressions(
                    {
                        pattern: 'foo',
                        xpath: [
                            '//div//text()',
                            '//span[',
                        ],
                    },
                    '$',
                ),
            ).to.throw();
        });
    });

    describe('expression patch validation (self-test)', () => {
        /** @param {Record<string, any>} operation */
        const check = (operation) => () => assertExpressionPatch(operation, '$');

        it('checks a patched xpath value', () => {
            expect(check({ op: 'replace', path: '/detectors/g/d/match/text/xpath', value: '//div//text()' })).to.not.throw();
            expect(check({ op: 'replace', path: '/detectors/g/d/match/text/xpath', value: '//div[' })).to.throw();
        });

        it('checks every entry of a patched xpath array', () => {
            expect(
                check({
                    op: 'replace',
                    path: '/detectors/g/d/match/text/xpath',
                    value: [
                        '//div//text()',
                        '//span[',
                    ],
                }),
            ).to.throw();
        });

        it('checks a patched single xpath array entry', () => {
            expect(check({ op: 'replace', path: '/detectors/g/d/match/text/xpath/1', value: '//div[' })).to.throw();
        });

        it('checks a patched pattern value', () => {
            expect(check({ op: 'add', path: '/detectors/g/d/match/text/pattern', value: 'foo' })).to.not.throw();
            expect(check({ op: 'add', path: '/detectors/g/d/match/text/pattern', value: 'foo(' })).to.throw();
        });

        it('ignores removals and unrelated paths', () => {
            expect(check({ op: 'remove', path: '/detectors/g/d/match/text/xpath' })).to.not.throw();
            expect(check({ op: 'replace', path: '/detectors/g/d/state', value: 'disabled' })).to.not.throw();
        });

        it('does not mistake xpathConfig for an xpath value', () => {
            expect(check({ op: 'replace', path: '/detectors/g/d/match/text/xpathConfig', value: { chunkSize: 8192 } })).to.not.throw();
        });
    });
});
