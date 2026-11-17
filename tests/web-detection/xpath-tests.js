import { expectError, expectValid, itAll } from './fixtures.js';

describe('webDetection config tests', () => {
    describe('xpathConfig validation (self-test)', () => {
        /**
         * @param {Record<string, unknown>} xpathConfig
         */
        const withConfig = (xpathConfig) => ({ text: { pattern: 'a', xpath: '//p//text()', xpathConfig } });

        itAll('accepts an in-bounds config, chunkSize 0 with any tail, and chunkTail 0', () => {
            expectValid(withConfig({ chunkSize: 8192, chunkTail: 512 }));
            expectValid(withConfig({ chunkSize: 0 }));
            // The tail is unused once chunking is off, so the ratio does not apply
            expectValid(withConfig({ chunkSize: 0, chunkTail: 99999 }));
            expectValid(withConfig({ chunkSize: 8192, chunkTail: 0 }));
        });

        itAll('rejects non-integer and negative values', () => {
            expectError('expected a non-negative integer', withConfig({ chunkSize: 8192.5 }));
            expectError('expected a non-negative integer', withConfig({ chunkSize: -1 }));
            expectError('expected a non-negative integer', withConfig({ chunkTail: '512' }));
        });

        itAll('rejects a non-zero chunkSize below the floor', () => {
            expectError('expected 0 (chunking disabled) or at least 1024', withConfig({ chunkSize: 32 }));
        });

        itAll('rejects a chunkTail above a quarter of chunkSize', () => {
            expectError('expected at most chunkSize / 4', withConfig({ chunkSize: 8192, chunkTail: 2049 }));
            expectValid(withConfig({ chunkSize: 8192, chunkTail: 2048 }));
        });

        itAll('checks a lone chunkTail in isolation, since the ratio needs a chunkSize', () => {
            expectValid(withConfig({ chunkTail: 99999 }));
            expectError('expected a non-negative integer', withConfig({ chunkTail: -1 }));
        });
    });

    describe('expression validation (self-test)', () => {
        /** @param {unknown} xpath */
        const withXPath = (xpath) => ({ text: { pattern: 'a', xpath } });

        /** @param {unknown} pattern */
        const withPattern = (pattern) => ({ text: { pattern } });

        itAll('accepts XPath expressions of the shape detectors use', () => {
            expectValid(withXPath('//div//text()'));
            expectValid(withXPath('//*[@class="banner"]//text()'));
            expectValid(withXPath('//div[contains(@id, "consent")]'));
        });

        itAll('rejects malformed XPath expressions, in a single value or an array entry', () => {
            expectError('is not a valid XPath expression', withXPath('//div['));
            expectError('is not a valid XPath expression', withXPath('//div[@class="a"'));
            expectError('$.match.text.xpath[1]: "//span[" is not a valid XPath expression', {
                text: {
                    pattern: 'a',
                    xpath: [
                        '//div//text()',
                        '//span[',
                    ],
                },
            });
        });

        itAll('accepts a single pattern and an array of them', () => {
            expectValid(withPattern('foo'));
            expectValid(
                withPattern([
                    'foo',
                    'bar(baz)?',
                ]),
            );
        });

        itAll('rejects a malformed pattern, and entries only valid as a pair', () => {
            expectError('is not a valid regular expression', withPattern('foo('));
            expectError('is not a valid regular expression', withPattern('[a-'));
            expectError(
                '$.match.text.pattern[0]: "a(" is not a valid regular expression',
                withPattern([
                    'a(',
                    'b)',
                ]),
            );
        });
    });
});
