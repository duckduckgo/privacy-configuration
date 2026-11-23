import { expectDetectorError as expectError, expectDetectorValid as expectValid, itAll } from './fixtures.js';

const noReport = { breakageReport: { state: 'disabled' } };
const placeholder = { only: { element: { selector: '#placeholder' } } };

/**
 * A detector that waits on the body.
 *
 * @param {Record<string, unknown>} body
 */
const waiting = (body) => ({
    triggers: noReport,
    actions: [
        { define: { el: placeholder } },
        { define: { x: { wait: { target: { ref: 'el' }, timeoutMs: 10000, ...body } } } },
    ],
});

describe('webDetection config tests', () => {
    describe('validateDetector, `intersection` and `resize` (self-test)', () => {
        itAll('takes the options on the allowlists, `{}` included', () => {
            expectValid(waiting({ intersection: {} }));
            expectValid(waiting({ intersection: { threshold: 0.5 } }));
            expectValid(
                waiting({
                    intersection: {
                        threshold: [
                            0,
                            0.5,
                            1,
                        ],
                    },
                }),
            );
            expectValid(waiting({ resize: {} }));
            expectValid(waiting({ resize: { box: 'border-box' } }));
            expectError('`threshold` is a number from 0 to 1', waiting({ intersection: { threshold: 1.5 } }));
            expectError('`threshold` is a number from 0 to 1', waiting({ intersection: { threshold: [] } }));
            expectError(
                '`threshold` is a number from 0 to 1',
                waiting({
                    intersection: {
                        threshold: [
                            0.5,
                            '1',
                        ],
                    },
                }),
            );
            expectError('"root" is never observed', waiting({ intersection: { root: null } }));
            expectError('"rootMargin" is never observed', waiting({ intersection: { rootMargin: '10px' } }));
            expectError(
                'intersection option "trackVisibility" is not on INTERSECTION_OPTION_ALLOWLIST',
                waiting({ intersection: { trackVisibility: true } }),
            );
            expectError('`box` is one of "content-box", "border-box"', waiting({ resize: { box: 'device-pixel-content-box' } }));
            expectError('resize option "boxes" is not on RESIZE_OPTION_ALLOWLIST', waiting({ resize: { boxes: [] } }));
            expectError('`intersection` is an object', waiting({ intersection: 0.5 }));
        });

        itAll('needs a `target`, and takes no `durationThreshold`', () => {
            expectError('an `intersection` body observes the element its `target` gives, so it needs `target`', {
                triggers: noReport,
                actions: { define: { x: { wait: { intersection: {}, timeoutMs: 100 } } } },
            });
            expectError('a `resize` body observes the element', {
                triggers: noReport,
                actions: { define: { x: { wait: { resize: {}, timeoutMs: 100 } } } },
            });
            expectError('`durationThreshold` goes with `entryType`, not `resize`', waiting({ resize: {}, durationThreshold: 16 }));
            expectError('takes exactly one of', waiting({ resize: {}, intersection: {} }));
        });

        itAll('reads the fields on each field allowlist', () => {
            expectValid(waiting({ intersection: {}, where: { isIntersecting: false }, field: 'intersectionRect.height' }));
            expectValid(waiting({ intersection: {}, field: 'intersectionRatio' }));
            expectValid(waiting({ resize: {}, where: { 'contentRect.height': { lt: 1 } }, field: 'timeStamp' }));
            expectError(
                'reads "boundingClientRect" on intersection entry items',
                waiting({ intersection: {}, field: 'boundingClientRect' }),
            );
            expectError('reads "target" on resize entry items', waiting({ resize: {}, field: 'target' }));
            expectError('reads "contentRect.x" on resize entry items', waiting({ resize: {}, field: 'contentRect.x' }));
        });

        itAll('takes `intersection` and `resize` in `wait` only', () => {
            expectError('`intersection` is allowed in `wait` only', {
                triggers: noReport,
                actions: { define: { x: { observed: { intersection: {}, target: { api: 'document' }, keep: { count: 1 } } } } },
            });
            expectError('`resize` is allowed in `wait` only', {
                triggers: {
                    ...noReport,
                    observe: {
                        state: 'enabled',
                        on: [
                            { resize: {}, target: { api: 'document' } },
                        ],
                    },
                },
                actions: { done: true },
            });
            expectError('`resize` is allowed in `wait` only', {
                triggers: {
                    ...noReport,
                    auto: {
                        state: 'enabled',
                        when: {
                            intervalMs: [
                                100,
                            ],
                        },
                    },
                },
                actions: { define: { x: { trigger: { resize: {} } } } },
            });
        });
    });
});
