import { expectDetectorError as expectError, expectDetectorValid as expectValid, itAll, waitDetector } from './fixtures.js';
import { MAX_WAIT_TIMEOUT_MS } from '../../web-detection-util.js';

/** Breakage reports off, as a detector with a `wait` needs. */
const noReport = { breakageReport: { state: 'disabled' } };

/**
 * A detector a breakage report doesn't run, with the actions and any other triggers.
 *
 * @param {unknown} actions
 * @param {Record<string, unknown>} [triggers]
 */
const waiting = (actions, triggers = {}) => ({ triggers: { ...noReport, ...triggers }, actions });

/**
 * A `wait` body with a timeout.
 *
 * @param {Record<string, unknown>} body
 */
const wait = (body) => ({ wait: { timeoutMs: 2000, ...body } });

const click = wait({ event: 'click' });
const clickX = wait({ event: 'click', field: 'clientX' });
const mutation = {
    wait: {
        mutation: { childList: true, subtree: true },
        target: { api: 'document' },
        where: { 'addedNodes.length': { gt: 0 } },
        timeoutMs: 2500,
    },
};

/** Where C-S-S can't suspend a run. */
const OUT_OF_REACH = 'so it goes only where a run can suspend';

describe('webDetection config tests', () => {
    describe('validateDetector, `wait` (self-test)', () => {
        itAll('passes a detector waiting in a `sync` run for the page to change', () => {
            expectValid(waitDetector);
        });

        itAll('takes `wait` where a run can suspend', () => {
            expectValid(waiting({ define: { next: click } }));
            expectValid(
                waiting([
                    click,
                    { done: true },
                ]),
            );
            expectValid(waiting({ if: { ...click, is: { type: 'object' } }, then: { breakageReportData: {} } }));
            expectValid(waiting({ if: true, then: click, else: { define: { x: clickX } } }));
            expectValid(waiting({ define: { x: { expr: clickX } } }));
            expectValid(waiting({ define: { x: { ...click, using: 'clientX' } } }));
            expectValid(waiting({ breakageReportData: { data: { x: { value: clickX } } } }));
            expectValid(waiting({ done: { ...click, is: { type: 'undefined' } } }));
            expectValid(waiting({ define: { added: mutation } }));
        });

        itAll('rejects `wait` where a run can’t suspend', () => {
            expectError(
                OUT_OF_REACH,
                waiting({
                    if: {
                        any: [
                            { ...click, is: { type: 'object' } },
                        ],
                    },
                    then: { done: true },
                }),
            );
            expectError(
                OUT_OF_REACH,
                waiting({
                    define: {
                        x: {
                            sum: [
                                clickX,
                                1,
                            ],
                        },
                    },
                }),
            );
            expectError(
                OUT_OF_REACH,
                waiting({
                    define: {
                        x: {
                            div: [
                                clickX,
                                2,
                            ],
                        },
                    },
                }),
            );
            expectError(OUT_OF_REACH, waiting({ define: { x: { only: click } } }));
            expectError(
                OUT_OF_REACH,
                waiting({
                    define: {
                        x: {
                            expr: [
                                click,
                            ],
                        },
                    },
                }),
            );
            expectError(
                OUT_OF_REACH,
                waiting([
                    { define: { y: 1 } },
                    { define: { x: { ref: 'y', using: { expr: clickX } } } },
                ]),
            );
            expectError(OUT_OF_REACH, waiting({ define: { x: { element: { selector: 'p', root: click }, using: 'length' } } }));
            expectError(
                OUT_OF_REACH,
                waiting({
                    define: {
                        x: {
                            api: {
                                path: 'Math.max',
                                args: [
                                    clickX,
                                    1,
                                ],
                            },
                        },
                    },
                }),
            );
            expectError(OUT_OF_REACH, waiting({ define: { x: { ...clickX, is: { eq: clickX } } } }));
            expectError(
                OUT_OF_REACH,
                waiting({ define: { x: wait({ event: 'pointerdown', where: { expr: { ...click, is: { type: 'object' } } } }) } }),
            );
            expectError(
                OUT_OF_REACH,
                waiting({
                    fireEvent: {
                        type: 'a',
                        data: {
                            x: {
                                value: 1,
                                when: { eq: clickX },
                                buckets: [
                                    { name: 'one', is: 1 },
                                ],
                            },
                        },
                    },
                }),
            );
            expectError('holds no `wait`', {
                triggers: noReport,
                match: { ...click, is: { type: 'object' } },
                actions: { breakageReportData: {} },
            });
        });

        itAll('rejects `wait` in a detector a breakage report runs', () => {
            expectError('a breakage report never waits on one', { actions: { define: { x: click } } });
            expectError('a breakage report never waits on one', {
                triggers: { breakageReport: { state: 'enabled' } },
                actions: { define: { x: click } },
            });
        });

        itAll('gives the item or `undefined`, so it takes `is` in boolean position', () => {
            const TEST_IT = 'which fails in boolean position, so test it with `is`';
            expectError(TEST_IT, waiting({ if: click, then: { done: true } }));
            expectError(TEST_IT, waiting({ if: wait({ event: 'click', field: 'ctrlKey' }), then: { done: true } }));
            expectError(TEST_IT, waiting({ done: wait({ event: 'click', field: 'ctrlKey' }) }));
            expectValid(waiting({ if: { ...wait({ event: 'click', field: 'ctrlKey' }), is: true }, then: { done: true } }));
            expectValid(waiting({ if: { ...click, is: { type: 'object' } }, then: { done: true } }));
            expectError('reads "key" on `keydown` event items', waiting({ define: { x: wait({ event: 'keydown', field: 'key' }) } }));
        });

        itAll('takes one type, and `target` as any expression giving one object', () => {
            expectError('a `wait` body takes exactly one of `entryType`, `event`, `mutation`', waiting({ define: { x: wait({}) } }));
            expectError('a `wait` body takes exactly one of', waiting({ define: { x: wait({ event: 'click', entryType: 'event' }) } }));
            expectValid(
                waiting([
                    { define: { form: { only: { element: { selector: 'form' } } } } },
                    { define: { x: wait({ event: 'invalid', target: { ref: 'form' } }) } },
                ]),
            );
            expectValid(waiting({ define: { x: wait({ event: 'scroll', target: { api: 'visualViewport' } }) } }));
            expectValid(waiting({ define: { x: wait({ event: 'navigate', target: { api: 'navigation' } }) } }));
            expectError('"navigate" is listened for on `navigation` only', waiting({ define: { x: wait({ event: 'navigate' }) } }));
            expectError(
                'a `target` gives one node or event target, and this gives a list',
                waiting({ define: { x: wait({ event: 'click', target: { element: { selector: 'form' } } }) } }),
            );
            expectError('config types it as number', waiting({ define: { x: wait({ event: 'click', target: 1 }) } }));
            expectError(
                '`target` goes with `event` only',
                waiting({ define: { x: wait({ entryType: 'event', target: { api: 'document' } }) } }),
            );
            expectError(
                '`keep` sets the window of an `observed` body only',
                waiting({ define: { x: wait({ event: 'click', keep: { count: 1 } }) } }),
            );
        });

        itAll('needs `timeoutMs`, a number from 0 to the cap', () => {
            expectError('`wait` needs `timeoutMs`', waiting({ define: { x: { wait: { event: 'click' } } } }));
            expectValid(waiting({ define: { x: wait({ event: 'click', timeoutMs: 0 }) } }));
            expectValid(waiting({ define: { x: wait({ event: 'click', timeoutMs: MAX_WAIT_TIMEOUT_MS }) } }));
            expectError('`timeoutMs` is at most', waiting({ define: { x: wait({ event: 'click', timeoutMs: MAX_WAIT_TIMEOUT_MS + 1 }) } }));
            expectError('`timeoutMs` is a number, at least 0', waiting({ define: { x: wait({ event: 'click', timeoutMs: -1 }) } }));
            expectError('`timeoutMs: null` waits with no limit', waiting({ define: { x: wait({ event: 'click', timeoutMs: null }) } }));
            expectError(
                '`timeoutMs` sets how long a `wait` lasts',
                waiting({ define: { x: { observed: { event: 'click', keep: { count: 1 }, timeoutMs: 1 } } } }),
            );
        });
    });

    describe('validateDetector, `mutation` (self-test)', () => {
        /**
         * @param {Record<string, unknown>} options
         * @param {Record<string, unknown>} [rest]
         */
        const waitsFor = (options, rest = {}) =>
            waiting({ define: { x: wait({ mutation: options, target: { api: 'document' }, ...rest }) } });

        itAll('takes options on the allowlist, with at least one that selects changes', () => {
            expectValid(
                waitsFor({
                    attributes: true,
                    attributeFilter: [
                        'hidden',
                        'aria-expanded',
                    ],
                }),
            );
            expectValid(waitsFor({ characterData: true, subtree: true }));
            expectError('`mutation` needs at least one of', waitsFor({ subtree: true }));
            expectError('`childList` is `true` or left out', waitsFor({ childList: false }));
            expectError('"attributeOldValue" is never observed', waitsFor({ attributes: true, attributeOldValue: true }));
            expectError('"characterDataOldValue" is never observed', waitsFor({ characterData: true, characterDataOldValue: true }));
            expectError(
                'attribute "id" is not on MUTATION_OPTION_ALLOWLIST.attributeFilter',
                waitsFor({
                    attributeFilter: [
                        'id',
                    ],
                }),
            );
            expectError('`attributeFilter` is a non-empty array', waitsFor({ attributeFilter: [] }));
            expectError('mutation option "foo" is not on MUTATION_OPTION_ALLOWLIST', waitsFor({ childList: true, foo: true }));
        });

        itAll('needs a `target`, and reads the mutation record fields', () => {
            expectError('so it needs `target`', waiting({ define: { x: wait({ mutation: { childList: true } }) } }));
            expectValid(waitsFor({ attributes: true }, { field: 'attributeName' }));
            expectValid(
                waitsFor({ childList: true }, { where: { 'removedNodes.length': { gt: 0 }, type: 'childList' }, field: 'timeStamp' }),
            );
            expectError('reads "oldValue" on mutation record items', waitsFor({ characterData: true }, { field: 'oldValue' }));
            expectError(
                '`durationThreshold` goes with `entryType`, not `mutation`',
                waitsFor({ childList: true }, { durationThreshold: 16 }),
            );
        });

        itAll('takes `mutation` in `wait` only', () => {
            expectError(
                '`mutation` is allowed in `wait` only',
                waiting({
                    define: { x: { observed: { mutation: { childList: true }, target: { api: 'document' }, keep: { count: 1 } } } },
                }),
            );
            expectError(
                '`mutation` is allowed in `wait` only',
                waiting(
                    { done: true },
                    {
                        observe: {
                            state: 'enabled',
                            on: [
                                { mutation: { childList: true }, target: { api: 'document' } },
                            ],
                        },
                    },
                ),
            );
        });
    });

    describe('validateDetector, `observe` with `wait` and `whenBusy` (self-test)', () => {
        /**
         * @param {unknown[]} on
         * @param {unknown} actions
         */
        const observing = (on, actions) => waiting(actions, { observe: { state: 'enabled', on } });

        itAll('counts a `wait` on the default target as reading the type an `on` body names', () => {
            expectValid(
                observing(
                    [
                        { event: 'click' },
                    ],
                    { define: { x: click } },
                ),
            );
            expectValid(
                observing(
                    [
                        { entryType: 'long-animation-frame' },
                    ],
                    { define: { x: wait({ entryType: 'long-animation-frame' }) } },
                ),
            );
            expectError(
                'which no `observed`, `trigger` or `wait` source in the detector reads',
                observing(
                    [
                        { event: 'click' },
                    ],
                    [
                        { define: { form: { only: { element: { selector: 'form' } } } } },
                        { define: { x: wait({ event: 'click', target: { ref: 'form' } }) } },
                    ],
                ),
            );
        });

        itAll('needs `"whenBusy": "interrupt"` on the page hiding', () => {
            expectValid(
                observing(
                    [
                        { event: 'pagehide', sync: true, whenBusy: 'interrupt' },
                    ],
                    { done: true },
                ),
            );
            expectError(
                'so it needs `"whenBusy": "interrupt"`',
                observing(
                    [
                        { event: 'pagehide', sync: true },
                    ],
                    { done: true },
                ),
            );
            expectError(
                'so it needs `"whenBusy": "interrupt"`',
                observing(
                    [
                        { event: 'visibilitychange', sync: true, whenBusy: 'skip' },
                    ],
                    { done: true },
                ),
            );
        });

        itAll('needs `"interrupt"` or `"skip"` on a `sync` body, and `"interrupt"` nowhere else', () => {
            const reads = { define: { x: { trigger: { event: 'click' } } } };
            expectValid(
                observing(
                    [
                        { event: 'click', sync: true, whenBusy: 'interrupt' },
                    ],
                    reads,
                ),
            );
            expectValid(
                observing(
                    [
                        { event: 'click', sync: true, whenBusy: 'skip' },
                    ],
                    reads,
                ),
            );
            expectError(
                'a `sync` body needs `"whenBusy": "interrupt"` or `"skip"`',
                observing(
                    [
                        { event: 'click', sync: true },
                    ],
                    reads,
                ),
            );
            expectError(
                'a `sync` body needs `"whenBusy": "interrupt"` or `"skip"`',
                observing(
                    [
                        { event: 'click', sync: true, whenBusy: 'queue' },
                    ],
                    reads,
                ),
            );
            expectValid(
                observing(
                    [
                        { event: 'click', whenBusy: 'skip' },
                    ],
                    reads,
                ),
            );
            expectValid(
                observing(
                    [
                        { event: 'click', whenBusy: 'queue' },
                    ],
                    reads,
                ),
            );
            expectError(
                'goes on `sync` bodies and the page hiding only',
                observing(
                    [
                        { event: 'click', whenBusy: 'interrupt' },
                    ],
                    reads,
                ),
            );
            expectError(
                '`whenBusy` is one of',
                observing(
                    [
                        { event: 'click', whenBusy: 'later' },
                    ],
                    reads,
                ),
            );
        });
    });
});
