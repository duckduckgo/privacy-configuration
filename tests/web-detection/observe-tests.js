import { expect } from 'chai';
import { expectDetectorError as expectError, expectDetectorValid as expectValid, itAll, observeDetector } from './fixtures.js';
import { validateDetector } from './validator/validate.js';
import { OBSERVED_KEEP_CAPS } from '../../web-detection-util.js';

/**
 * A detector the `observe` trigger runs on the `on` bodies, with breakage reports off.
 *
 * @param {unknown[]} on
 * @param {unknown} actions
 */
const observing = (on, actions) => ({
    triggers: { breakageReport: { state: 'disabled' }, observe: { state: 'enabled', on } },
    actions,
});

/**
 * A detector reading the `observed` body.
 *
 * @param {Record<string, unknown>} body
 * @param {Record<string, unknown>} [modifiers] - beside `observed`
 */
const readsObserved = (body, modifiers = { using: 'length' }) => ({ actions: { define: { n: { observed: body, ...modifiers } } } });

const clicks = { event: 'click', keep: { count: 10 } };

describe('webDetection config tests', () => {
    describe('validateDetector, recorded types (self-test)', () => {
        itAll('passes a detector on the `observe` trigger reading `observed` and `trigger`', () => {
            expectValid(observeDetector);
        });

        itAll('takes the entry types, event types and fields on the allowlists', () => {
            expectValid(
                readsObserved(
                    { entryType: 'long-animation-frame', where: { blockingDuration: { gte: 200 } }, field: 'duration', keep: { count: 5 } },
                    {},
                ),
            );
            expectValid(readsObserved({ entryType: 'event', durationThreshold: 16, field: 'interactionId', keep: { count: 5 } }, {}));
            expectValid(readsObserved({ event: 'pointerdown', where: { ctrlKey: false, clientX: { gt: 0 } }, keep: { withinMs: 500 } }));
            expectValid(readsObserved({ event: 'touchend', field: 'changedTouches.0.clientX', keep: { count: 4 } }, {}));
            expectValid(readsObserved({ event: 'touchstart', where: { 'touches.length': { gte: 2 } }, keep: { count: 4 } }));
            expectValid(readsObserved({ event: 'pagehide', where: { persisted: true }, keep: null }));
            expectValid(
                readsObserved(
                    { event: 'click', keep: { count: 1 } },
                    {
                        using: {
                            path: 'at',
                            args: [
                                -1,
                            ],
                        },
                        is: { type: 'object' },
                    },
                ),
            );
            expectValid({
                actions: [
                    {
                        define: {
                            last: {
                                observed: clicks,
                                using: {
                                    path: 'at',
                                    args: [
                                        -1,
                                    ],
                                },
                            },
                        },
                    },
                    { define: { x: { ref: 'last', using: 'clientX' } } },
                ],
            });
        });

        itAll('rejects types off the allowlists, and the types that are never listened for', () => {
            expectError(
                'entry type "longtask" is not on ENTRY_TYPE_ALLOWLIST',
                readsObserved({ entryType: 'longtask', keep: { count: 1 } }),
            );
            expectError('event type "input" is not on EVENT_TYPE_ALLOWLIST', readsObserved({ event: 'input', keep: { count: 1 } }));
            expectError('"unload" is never listened for', readsObserved({ event: 'unload', keep: { count: 1 } }));
            expectError('"beforeunload" is never listened for', readsObserved({ event: 'beforeunload', keep: { count: 1 } }));
        });

        itAll('rejects fields off the type’s field allowlist, user input among them', () => {
            expectError('reads "key" on `keydown` event items', readsObserved({ event: 'keydown', field: 'key', keep: { count: 1 } }, {}));
            expectError('reads "data" on `click` event items', readsObserved({ ...clicks, where: { data: 'a' } }));
            expectError('reads "currentTarget" on `click` event items', readsObserved({ ...clicks, field: 'currentTarget' }, {}));
            expectError(
                'reads "changedTouches.1" on `touchend` event items',
                readsObserved({ event: 'touchend', field: 'changedTouches.1.clientX', keep: { count: 1 } }, {}),
            );
            expectError(
                'reads "name" on `long-animation-frame` entry items',
                readsObserved({ entryType: 'long-animation-frame', field: 'name', keep: { count: 1 } }, {}),
            );
            expectError(
                'whose field allowlist lists no method',
                readsObserved({ ...clicks, field: { path: 'composedPath', args: [] } }, {}),
            );
            expectError('reads "x" on `click` event items', {
                actions: [
                    {
                        define: {
                            last: {
                                observed: clicks,
                                using: {
                                    path: 'at',
                                    args: [
                                        -1,
                                    ],
                                },
                            },
                        },
                    },
                    { define: { x: { ref: 'last', using: 'x' } } },
                ],
            });
        });

        itAll('reads `target` as an element, by the element allowlist', () => {
            expectValid(readsObserved({ ...clicks, where: { 'target.hidden': false } }));
            expectError('reads "closest" on', readsObserved({ ...clicks, field: 'target.closest' }, {}));
        });

        itAll('checks `durationThreshold`, on the `event` entry type only, at least 16', () => {
            expectError(
                '`durationThreshold` goes with an entry type whose observer takes it',
                readsObserved({ entryType: 'long-animation-frame', durationThreshold: 50, keep: { count: 1 } }),
            );
            expectError(
                '`durationThreshold` goes with an entry type whose observer takes it',
                readsObserved({ event: 'click', durationThreshold: 50, keep: { count: 1 } }),
            );
            expectError('is a number, at least 16', readsObserved({ entryType: 'event', durationThreshold: 8, keep: { count: 1 } }));
        });

        itAll('takes exactly one type, and only the keys of the body’s place', () => {
            expectError(
                'takes exactly one of `entryType`, `event`',
                readsObserved({ event: 'click', entryType: 'event', keep: { count: 1 } }),
            );
            expectError('takes exactly one of `entryType`, `event`', readsObserved({ keep: { count: 1 } }));
            expectError('`mutation` is allowed in `wait` only', readsObserved({ mutation: { childList: true }, keep: { count: 1 } }));
            expectError('"listen" is not a key of an `observed` body', readsObserved({ event: 'click', listen: true, keep: { count: 1 } }));
        });

        itAll('takes a `target` from the target allowlist, as an `api` path, on event bodies', () => {
            expectValid(readsObserved({ event: 'scroll', target: { api: 'visualViewport' }, keep: { count: 1 } }));
            expectValid(readsObserved({ event: 'click', target: { api: { path: 'document' } }, keep: { count: 1 } }));
            expectValid(readsObserved({ event: 'navigatesuccess', target: { api: 'navigation' }, keep: { count: 1 } }));
            expectError(
                'with a path on EVENT_TARGET_ALLOWLIST',
                readsObserved({ event: 'click', target: { api: 'document.body' }, keep: { count: 1 } }),
            );
            expectError(
                'with a path on EVENT_TARGET_ALLOWLIST',
                readsObserved({ event: 'click', target: { only: { element: { selector: 'form' } } }, keep: { count: 1 } }),
            );
            expectError(
                '`target` goes with `event` only',
                readsObserved({ entryType: 'event', target: { api: 'window' }, keep: { count: 1 } }),
            );
            expectError(
                '"navigate" is listened for on `navigation` only, and `target` is `window` when absent',
                readsObserved({ event: 'navigate', keep: { count: 1 } }),
            );
            expectError(
                '"click" is listened for on `window`',
                readsObserved({ event: 'click', target: { api: 'navigation' }, keep: { count: 1 } }),
            );
        });

        itAll('takes `observed` with `field` as a list, and without as a condition that holds on an item', () => {
            expectValid({ actions: { if: { observed: clicks }, then: { breakageReportData: {} } } });
            expectError('`observed` with `field`', {
                actions: { if: { observed: { ...clicks, field: 'clientX' } }, then: { breakageReportData: {} } },
            });
            expectValid({
                actions: {
                    define: {
                        max: {
                            api: {
                                path: 'Math.max.apply',
                                args: [
                                    null,
                                    { observed: { ...clicks, field: 'clientX' } },
                                ],
                            },
                        },
                    },
                },
            });
            expectError('`sum` takes numbers, and config types the values as object', {
                actions: {
                    define: {
                        n: {
                            sum: [
                                { observed: clicks },
                                1,
                            ],
                        },
                    },
                },
            });
        });
    });

    describe('validateDetector, `keep` (self-test)', () => {
        itAll('needs `keep` on `observed`, as the config build writes it', () => {
            expectError('`observed` needs `keep`', readsObserved({ event: 'click' }));
        });

        itAll('takes `count`, `withinMs` or both, each a positive integer within its cap', () => {
            expectValid(
                readsObserved({ event: 'click', keep: { count: OBSERVED_KEEP_CAPS.count, withinMs: OBSERVED_KEEP_CAPS.withinMs } }),
            );
            expectError('`keep` is an object with `count`, `withinMs` or both', readsObserved({ event: 'click', keep: {} }));
            expectError('`count` is at most', readsObserved({ event: 'click', keep: { count: OBSERVED_KEEP_CAPS.count + 1 } }));
            expectError('`withinMs` is at most', readsObserved({ event: 'click', keep: { withinMs: OBSERVED_KEEP_CAPS.withinMs + 1 } }));
            expectError('`count` is a positive integer', readsObserved({ event: 'click', keep: { count: 0 } }));
            expectError('`withinMs` is a positive integer', readsObserved({ event: 'click', keep: { withinMs: 1.5 } }));
            expectError('"maxAgeMs" is not a key of `keep`', readsObserved({ event: 'click', keep: { maxAgeMs: 1 } }));
        });

        itAll('caps `scroll` more tightly', () => {
            expectValid(readsObserved({ event: 'scroll', keep: { withinMs: 5000 } }));
            expectError('`withinMs` is at most 5000 for `scroll` events', readsObserved({ event: 'scroll', keep: { withinMs: 5001 } }));
        });

        itAll('takes `keep: null` on the types read unbounded only', () => {
            expectValid(readsObserved({ event: 'visibilitychange', keep: null }));
            expectValid(readsObserved({ event: 'pagehide', keep: null }));
            expectError('`keep: null` reads every item recorded', readsObserved({ event: 'click', keep: null }));
        });

        itAll('takes `keep` on `observed` only', () => {
            expectError(
                '`keep` sets the window of an `observed` body only',
                observing(
                    [
                        { event: 'click' },
                    ],
                    { define: { n: { trigger: { event: 'click', keep: { count: 1 } } } } },
                ),
            );
            expectError(
                '`keep` sets the window of an `observed` body only',
                observing(
                    [
                        { event: 'click', keep: { count: 1 } },
                    ],
                    { define: { n: { trigger: { event: 'click' } } } },
                ),
            );
        });
    });

    describe('validateDetector, `trigger` (self-test)', () => {
        itAll('reads a type an `on` body names, on the same target', () => {
            expectValid(
                observing(
                    [
                        { event: 'scroll', target: { api: 'visualViewport' }, delayMs: 250, whenPending: 'skip' },
                    ],
                    { define: { n: { trigger: { event: 'scroll', target: { api: 'visualViewport' } }, using: 'length' } } },
                ),
            );
            expectError(
                "no body of the `observe` trigger's `on` names them",
                observing(
                    [
                        { event: 'pointerdown' },
                    ],
                    { define: { n: { trigger: { event: 'click' } } } },
                ),
            );
            expectError(
                '`trigger` reads `scroll` events on `window`',
                observing(
                    [
                        { event: 'scroll', target: { api: 'visualViewport' }, delayMs: 250, whenPending: 'skip' },
                    ],
                    { define: { n: { trigger: { event: 'scroll' } } } },
                ),
            );
        });

        itAll('reads `auto` and `breakageReport` when the detector enables the trigger', () => {
            expectValid({
                triggers: {
                    auto: {
                        state: 'enabled',
                        when: {
                            intervalMs: [
                                1000,
                            ],
                        },
                    },
                },
                actions: [
                    {
                        define: {
                            start: {
                                trigger: { auto: {}, field: 'timeStamp' },
                                using: {
                                    path: 'at',
                                    args: [
                                        0,
                                    ],
                                },
                            },
                        },
                    },
                    {
                        if: {
                            none: [
                                { trigger: { breakageReport: {} } },
                            ],
                        },
                        then: { fireEvent: { type: 'a' } },
                        else: { breakageReportData: {} },
                    },
                ],
            });
            expectError("the `auto` trigger started, and the detector doesn't enable it", {
                actions: { if: { trigger: { auto: {} } }, then: { breakageReportData: {} } },
            });
            expectError("the `breakageReport` trigger started, and the detector doesn't enable it", {
                triggers: { breakageReport: { state: 'disabled' } },
                actions: { if: { trigger: { breakageReport: {} } }, then: { breakageReportData: {} } },
            });
            expectError('`auto` takes `{}`', {
                triggers: {
                    auto: {
                        state: 'enabled',
                        when: {
                            intervalMs: [
                                1000,
                            ],
                        },
                    },
                },
                actions: { if: { trigger: { auto: { intervalMs: 1000 } } }, then: { breakageReportData: {} } },
            });
            expectError('takes exactly one of', {
                triggers: {
                    auto: {
                        state: 'enabled',
                        when: {
                            intervalMs: [
                                1000,
                            ],
                        },
                    },
                },
                actions: { if: { trigger: { auto: {}, breakageReport: {} } }, then: { breakageReportData: {} } },
            });
            expectError('`target` goes with `entryType` or `event`, not `auto`', {
                triggers: {
                    auto: {
                        state: 'enabled',
                        when: {
                            intervalMs: [
                                1000,
                            ],
                        },
                    },
                },
                actions: { if: { trigger: { auto: {}, target: { api: 'window' } } }, then: { breakageReportData: {} } },
            });
        });

        itAll('keeps `trigger` out of `match`', () => {
            expectError('holds no `trigger`', { match: { trigger: { breakageReport: {} } }, actions: { breakageReportData: {} } });
        });
    });

    describe('validateDetector, `done` (self-test)', () => {
        itAll('takes a condition in `actions` of a detector with no `match`', () => {
            expectValid({
                actions: [
                    { breakageReportData: {} },
                    { done: true },
                ],
            });
            expectValid({
                actions: [
                    { define: { 'this.sent': true } },
                    { done: { ref: 'this.sent' } },
                ],
            });
            expectValid({
                actions: {
                    done: {
                        none: [
                            {
                                api: {
                                    path: 'PerformanceObserver.supportedEntryTypes.includes',
                                    args: [
                                        'long-animation-frame',
                                    ],
                                },
                            },
                        ],
                    },
                },
            });
        });

        itAll('rejects `done` in a detector with `match`, in `match`, per item, and on a value that is not a boolean', () => {
            expectError('a detector with `match` is done once `match` holds', {
                match: true,
                actions: [
                    { breakageReportData: {} },
                    { done: true },
                ],
            });
            expectError('holds no action', { match: { expr: { done: true } }, actions: { breakageReportData: {} } });
            expectError('`done` inside a `where` or `field` runs once per item', {
                actions: { define: { n: { observed: { ...clicks, where: { expr: { done: true } } } } } },
            });
            expectError('fills value, number position, not boolean position', { actions: { done: 1 } });
        });
    });

    describe('validateDetector, the `observe` trigger (self-test)', () => {
        itAll('needs a body in `on`, and takes only `state`, `runConditions` and `on`', () => {
            expectError('`on` lists at least one body', observing([], { done: true }));
            expectError('`on` lists at least one body', { triggers: { observe: { state: 'enabled' } }, actions: { done: true } });
            expectError('"when" is not a key of `observe`', {
                triggers: {
                    observe: {
                        state: 'enabled',
                        when: {},
                        on: [
                            { event: 'pagehide', sync: true, whenBusy: 'interrupt' },
                        ],
                    },
                },
                actions: { done: true },
            });
            expectValid({
                triggers: {
                    observe: {
                        state: 'enabled',
                        runConditions: { context: { top: true } },
                        on: [
                            { event: 'pagehide', sync: true, whenBusy: 'interrupt' },
                        ],
                    },
                },
                actions: [
                    { breakageReportData: {} },
                    { done: true },
                ],
            });
        });

        itAll('names a type a source in the detector reads, apart from the page hiding', () => {
            expectError(
                'runs the detector on `click` events on `window`, which no `observed`, `trigger` or `wait` source in the detector reads',
                observing(
                    [
                        { event: 'click' },
                    ],
                    { done: true },
                ),
            );
            expectValid(
                observing(
                    [
                        { event: 'click' },
                    ],
                    { define: { n: { observed: clicks, using: 'length' } } },
                ),
            );
            expectValid(
                observing(
                    [
                        { event: 'visibilitychange', sync: true, whenBusy: 'interrupt' },
                        { event: 'pagehide', sync: true, whenBusy: 'interrupt' },
                    ],
                    { done: true },
                ),
            );
        });

        itAll('takes a `where` over allowlisted fields and literal values, and no `field` or `keep`', () => {
            const reads = { define: { n: { trigger: { event: 'click' }, using: 'length' } } };
            expectValid(
                observing(
                    [
                        { event: 'click', where: { ctrlKey: false, clientY: { gte: 0 } } },
                    ],
                    reads,
                ),
            );
            expectError(
                'compares fields with literal values only',
                observing(
                    [
                        { event: 'click', where: { clientY: { gte: { ref: 'this.y' } } } },
                    ],
                    [
                        { define: { 'this.y': 1 } },
                        reads,
                    ],
                ),
            );
            expectError(
                'compares fields with literal values only',
                observing(
                    [
                        {
                            event: 'click',
                            where: {
                                api: {
                                    path: 'Number.isFinite',
                                    args: [
                                        { self: 'clientX' },
                                    ],
                                },
                            },
                        },
                    ],
                    reads,
                ),
            );
            expectError(
                'reads "key" on `click` event items',
                observing(
                    [
                        { event: 'click', where: { key: 'a' } },
                    ],
                    reads,
                ),
            );
            expectError(
                'an `on` body selects the arrivals that run the detector, and gives no value',
                observing(
                    [
                        { event: 'click', field: 'clientX' },
                    ],
                    reads,
                ),
            );
        });

        itAll('needs `sync` on the page hiding, allows it on `click`, and rejects it elsewhere and beside `delayMs`', () => {
            const readsClicks = { define: { n: { trigger: { event: 'click' }, using: 'length' } } };
            expectError(
                '`visibilitychange` runs the detector as the page hides',
                observing(
                    [
                        { event: 'visibilitychange' },
                    ],
                    { done: true },
                ),
            );
            expectError(
                '`pagehide` runs the detector as the page hides',
                observing(
                    [
                        { event: 'pagehide', sync: false },
                    ],
                    { done: true },
                ),
            );
            expectValid(
                observing(
                    [
                        { event: 'click', sync: true, whenBusy: 'skip' },
                    ],
                    readsClicks,
                ),
            );
            expectError(
                '`sync` runs the detector during dispatch, on `click`, `visibilitychange` and `pagehide` bodies only',
                observing(
                    [
                        { event: 'pointerdown', sync: true },
                    ],
                    { define: { n: { trigger: { event: 'pointerdown' }, using: 'length' } } },
                ),
            );
            expectError(
                'so it takes no `delayMs`',
                observing(
                    [
                        { event: 'click', sync: true, whenBusy: 'skip', delayMs: 100 },
                    ],
                    readsClicks,
                ),
            );
            expectError(
                '`delayMs` is a non-negative integer',
                observing(
                    [
                        { event: 'click', delayMs: -1 },
                    ],
                    readsClicks,
                ),
            );
        });

        itAll('takes `whenPending` on a body with no `sync`', () => {
            const readsClicks = { define: { n: { trigger: { event: 'click' }, using: 'length' } } };
            expectValid(
                observing(
                    [
                        { event: 'click', delayMs: 100, whenPending: 'replace' },
                    ],
                    readsClicks,
                ),
            );
            expectError(
                'so no run is pending and it takes no `whenPending`',
                observing(
                    [
                        { event: 'click', sync: true, whenPending: 'skip' },
                    ],
                    readsClicks,
                ),
            );
        });

        itAll('runs on `scroll` at most once per `delayMs`, from 250, and batches no longer than its log', () => {
            const readsScrolls = { define: { n: { trigger: { event: 'scroll' }, using: 'length' } } };
            expectValid(
                observing(
                    [
                        { event: 'scroll', delayMs: 250, whenPending: 'skip' },
                    ],
                    readsScrolls,
                ),
            );
            expectValid(
                observing(
                    [
                        { event: 'scroll', delayMs: 5000, whenPending: 'batch' },
                    ],
                    readsScrolls,
                ),
            );
            for (const whenPending of [
                undefined,
                'run',
                'replace',
            ]) {
                expectError(
                    '`scroll` arrives every frame, so its body has `whenPending` "skip" or "batch"',
                    observing(
                        [
                            { event: 'scroll', delayMs: 250, ...(whenPending && { whenPending }) },
                        ],
                        readsScrolls,
                    ),
                );
            }
            expectError(
                '`scroll` arrives every frame, so `delayMs` is at least 250',
                observing(
                    [
                        { event: 'scroll', whenPending: 'skip' },
                    ],
                    readsScrolls,
                ),
            );
            expectError(
                'a batched run keeps each `scroll` until it runs, so `delayMs` is at most 5000',
                observing(
                    [
                        { event: 'scroll', delayMs: 5001, whenPending: 'batch' },
                    ],
                    readsScrolls,
                ),
            );
            expectValid(
                observing(
                    [
                        { event: 'scroll', delayMs: 6000, whenPending: 'skip' },
                    ],
                    readsScrolls,
                ),
            );
        });

        itAll('sends on the page hiding from inside a once guard, or a sequence with `{"done": true}`', () => {
            const hiding = [
                { event: 'visibilitychange', sync: true, whenBusy: 'interrupt' },
                { event: 'pagehide', sync: true, whenBusy: 'interrupt' },
            ];
            expectError('the detector runs each time the page hides', observing(hiding, { fireEvent: { type: 'a' } }));
            expectError(
                'the detector runs each time the page hides',
                observing(hiding, [
                    { fireEvent: { type: 'a' } },
                    { done: { api: 'document.hidden' } },
                ]),
            );
            expectValid(
                observing(hiding, [
                    { fireEvent: { type: 'a' } },
                    { done: true },
                ]),
            );
            expectValid(
                observing(hiding, {
                    if: {
                        none: [
                            { ref: 'this.sent', is: true },
                        ],
                    },
                    then: [
                        { fireEvent: { type: 'a' } },
                        { define: { 'this.sent': true } },
                    ],
                }),
            );
            expect(
                validateDetector(
                    {
                        match: true,
                        triggers: { breakageReport: { state: 'disabled' }, observe: { state: 'enabled', on: hiding } },
                        actions: { fireEvent: { type: 'a' } },
                    },
                    '$',
                ),
            ).to.deep.equal([]);
        });
    });
});
