import { expect } from 'chai';
import {
    expectDetectorError as expectError,
    expectDetectorValid as expectValid,
    expectDetectorsError,
    expectDetectorsValid,
    itAll,
} from './fixtures.js';
import { OBSERVED_KEEP_CAPS_BY_KIND } from '../../web-detection-util.js';
import { sequenceWebDetectionActions } from '../../util.js';

const noReport = { breakageReport: { state: 'disabled' } };
const headings = { element: { selector: 'h1' }, using: 'length' };

/**
 * A detector that emits on an `auto` timer.
 *
 * @param {Record<string, unknown>} emit - the `emit` body
 */
const emitter = (emit) => ({
    triggers: {
        ...noReport,
        auto: {
            state: 'enabled',
            when: {
                intervalMs: [
                    250,
                ],
            },
        },
    },
    actions: { emit },
});

/**
 * A detector the `observe` trigger runs on the names, which reads them with `actions`.
 *
 * @param {string[]} names
 * @param {unknown} actions
 */
const observer = (names, actions) => ({
    triggers: { ...noReport, observe: { state: 'enabled', on: names.map((detectorEvent) => ({ detectorEvent })) } },
    actions,
});

/**
 * An `observed` of a detector event, with a `keep`.
 *
 * @param {string} name
 * @param {Record<string, unknown>} [rest]
 */
const observed = (name, rest = {}) => ({ observed: { detectorEvent: name, keep: { count: 1 }, ...rest } });

const counted = emitter({ name: 'counted', data: { object: { n: headings, kind: 'h1' } } });

describe('webDetection config tests', () => {
    describe('validateDetector, `emit` (self-test)', () => {
        itAll('takes a name and an optional `data`, where `fireEvent` goes', () => {
            expectValid(emitter({ name: 'ping' }));
            expectValid(emitter({ name: 'counted', data: headings }));
            expectError('a detector event name matches', emitter({ name: 'not-a-name' }));
            expectError('"to" is not a key of `emit`', emitter({ name: 'a', to: 'b' }));
            expectError('`emit` is an object', { triggers: noReport, actions: { emit: 'a' } });
            expectError('holds no action', { match: { expr: { emit: { name: 'a' } } }, actions: { breakageReportData: {} } });
            expectError('`emit` inside a `where` or `field` runs once per item', {
                triggers: noReport,
                actions: { define: { n: { element: { selector: 'p', where: { expr: { emit: { name: 'a' } } } } } } },
            });
        });

        itAll('keeps `wait` out of `data`', () => {
            expectError(
                'so it goes only where a run can suspend',
                emitter({ name: 'a', data: { wait: { event: 'click', timeoutMs: 100 } } }),
            );
        });

        it('splits `emit` beside another action into a sequence on Apple', () => {
            const config = {
                features: { webDetection: { settings: { detectors: { g: { d: { actions: { emit: { name: 'a' }, done: true } } } } } } },
            };
            sequenceWebDetectionActions(config);
            expect(config.features.webDetection.settings.detectors.g.d.actions).to.deep.equal([
                { emit: { name: 'a' } },
                { done: true },
            ]);
        });
    });

    describe('validateDetector, `object` (self-test)', () => {
        itAll('builds an object whose fields `using` reads', () => {
            expectValid({
                triggers: noReport,
                actions: [
                    { define: { o: { object: { n: headings, label: 'a', nested: { object: { m: 1 } } } } } },
                    { define: { n: { ref: 'o', using: 'n', is: { gt: 0 } } } },
                    { define: { m: { ref: 'o', using: 'nested.m' } } },
                    { breakageReportData: { data: { o: { value: { ref: 'o' } } } } },
                ],
            });
            expectError('reads "count" on an `object` that builds "n"', {
                triggers: noReport,
                actions: [
                    { define: { o: { object: { n: 1 } } } },
                    { define: { x: { ref: 'o', using: 'count' } } },
                ],
            });
        });

        itAll('rejects a field name holding ".", and `object` outside value position', () => {
            expectError('field name "a.b" holds "."', { triggers: noReport, actions: { define: { o: { object: { 'a.b': 1 } } } } });
            expectError('`object` fills value position', {
                triggers: noReport,
                actions: { if: { object: { a: true } }, then: { done: true } },
            });
            expectError('`object` fills value position', {
                triggers: noReport,
                actions: {
                    define: {
                        n: {
                            sum: [
                                { object: { a: 1 } },
                            ],
                        },
                    },
                },
            });
        });

        itAll('keeps `wait` out of `object`', () => {
            expectError('so it goes only where a run can suspend', {
                triggers: noReport,
                actions: { define: { o: { object: { next: { wait: { event: 'click', timeoutMs: 100 } } } } } },
            });
        });
    });

    describe('validateDetector, `detectorEvent` bodies (self-test)', () => {
        itAll('reads a name an `emit` in the config records, in every kind of body', () => {
            expectDetectorsValid({
                g: {
                    counter: counted,
                    reader: observer(
                        [
                            'counted',
                        ],
                        [
                            {
                                define: {
                                    last: {
                                        trigger: { detectorEvent: 'counted', field: 'data.n' },
                                        using: {
                                            path: 'at',
                                            args: [
                                                0,
                                            ],
                                        },
                                    },
                                },
                            },
                            { define: { recent: { ...observed('counted', { where: { 'data.kind': 'h1' } }), using: 'length' } } },
                            {
                                define: {
                                    from: {
                                        ...observed('counted', { field: 'detector' }),
                                        using: {
                                            path: 'at',
                                            args: [
                                                -1,
                                            ],
                                        },
                                    },
                                },
                            },
                            { define: { next: { wait: { detectorEvent: 'counted', field: 'data.n', timeoutMs: 1000 } } } },
                        ],
                    ),
                },
            });
            expectDetectorsError('no `emit` in the config records "missing"', {
                g: { counter: counted, reader: { triggers: noReport, actions: { define: { n: observed('missing') } } } },
            });
            expectDetectorsError('no `emit` in the config records "missing"', {
                g: {
                    reader: observer(
                        [
                            'missing',
                        ],
                        { done: true },
                    ),
                },
            });
            expectDetectorsError('a detector event name matches', {
                g: { counter: counted, reader: { triggers: noReport, actions: { define: { n: observed('a-b') } } } },
            });
        });

        itAll('takes no `target` or `durationThreshold`', () => {
            expectDetectorsError('`target` goes with `entryType` or `event`, not `detectorEvent`', {
                g: {
                    counter: counted,
                    reader: { triggers: noReport, actions: { define: { n: observed('counted', { target: { api: 'window' } }) } } },
                },
            });
            expectDetectorsError('`durationThreshold` goes with `entryType` or `event`, not `detectorEvent`', {
                g: {
                    counter: counted,
                    reader: { triggers: noReport, actions: { define: { n: observed('counted', { durationThreshold: 16 }) } } },
                },
            });
        });

        itAll('caps `keep` for detector events', () => {
            const cap = /** @type {number} */ (OBSERVED_KEEP_CAPS_BY_KIND.detectorEvent.count);
            /** @param {number} count */
            const reading = (count) => ({
                g: {
                    counter: counted,
                    reader: { triggers: noReport, actions: { define: { n: { observed: { detectorEvent: 'counted', keep: { count } } } } } },
                },
            });
            expectDetectorsValid(reading(cap));
            expectDetectorsError(`\`count\` is at most ${cap} for \`counted\` detector events`, reading(cap + 1));
        });

        itAll('matches `trigger` to an `on` body, and counts a `wait` as reading its name', () => {
            expectDetectorsError("no body of the `observe` trigger's `on` names them", {
                g: {
                    counter: counted,
                    reader: observer(
                        [
                            'counted',
                        ],
                        { define: { n: { trigger: { detectorEvent: 'other' } } } },
                    ),
                    other: emitter({ name: 'other' }),
                },
            });
            expectDetectorsValid({
                g: {
                    counter: counted,
                    reader: observer(
                        [
                            'counted',
                        ],
                        { define: { n: { wait: { detectorEvent: 'counted', timeoutMs: 100 } } } },
                    ),
                },
            });
            expectDetectorsError('which no `observed`, `trigger` or `wait` source in the detector reads', {
                g: {
                    counter: counted,
                    reader: observer(
                        [
                            'counted',
                        ],
                        { done: true },
                    ),
                },
            });
        });

        itAll('reads `name`, `timeStamp`, `detector` and the `data` fields every `emit` builds', () => {
            /**
             * @param {Record<string, unknown>[]} emits
             * @param {unknown} field
             */
            const reading = (emits, field) => ({
                g: {
                    ...Object.fromEntries(
                        emits.map((emit, index) => [
                            `e${index}`,
                            emitter(emit),
                        ]),
                    ),
                    reader: { triggers: noReport, actions: { define: { v: observed('a', { field }) } } },
                },
            });
            expectDetectorsValid(
                reading(
                    [
                        { name: 'a' },
                    ],
                    'timeStamp',
                ),
            );
            expectDetectorsValid(
                reading(
                    [
                        { name: 'a' },
                    ],
                    'name',
                ),
            );
            expectDetectorsValid(
                reading(
                    [
                        { name: 'a', data: { object: { x: 1 } } },
                        { name: 'a', data: { object: { x: 2, y: 3 } } },
                    ],
                    'data.x',
                ),
            );
            expectDetectorsError(
                'not every `emit` of "a" gives `data` as an `object` with "y"',
                reading(
                    [
                        { name: 'a', data: { object: { x: 1 } } },
                        { name: 'a', data: { object: { x: 2, y: 3 } } },
                    ],
                    'data.y',
                ),
            );
            expectDetectorsError(
                'not every `emit` of "a" gives `data` as an `object` with "x"',
                reading(
                    [
                        { name: 'a' },
                    ],
                    'data.x',
                ),
            );
            expectDetectorsValid(
                reading(
                    [
                        { name: 'a', data: { object: { x: 1 } } },
                        { name: 'a', data: headings },
                    ],
                    'data.anything.at.all',
                ),
            );
            expectDetectorsError(
                'reads "group" on `a` detector event items',
                reading(
                    [
                        { name: 'a' },
                    ],
                    'group',
                ),
            );
        });

        itAll('takes a literal `where` on `data` fields in an `on` body', () => {
            expectDetectorsValid({
                g: {
                    counter: counted,
                    reader: {
                        triggers: {
                            ...noReport,
                            observe: {
                                state: 'enabled',
                                on: [
                                    { detectorEvent: 'counted', where: { 'data.kind': 'h1' } },
                                ],
                            },
                        },
                        actions: { define: { n: { trigger: { detectorEvent: 'counted' } } } },
                    },
                },
            });
        });
    });

    describe('validateDetector, detector event cycles (self-test)', () => {
        itAll('rejects a chain of `observe` triggers back to the emitting detector', () => {
            const ping = observer(
                [
                    'pong',
                ],
                [
                    { define: { n: { trigger: { detectorEvent: 'pong' } } } },
                    { emit: { name: 'ping' } },
                ],
            );
            const pong = observer(
                [
                    'ping',
                ],
                [
                    { define: { n: { trigger: { detectorEvent: 'ping' } } } },
                    { emit: { name: 'pong' } },
                ],
            );
            expectDetectorsError('detectors.g.ping: a chain of detector events runs from this detector back to itself', {
                g: { ping, pong },
            });
            expectDetectorsError('g.pong -> "pong" -> g.ping -> "ping" -> g.pong', { g: { ping, pong } });
            expectError('a chain of detector events runs from this detector back to itself', {
                triggers: {
                    ...noReport,
                    observe: {
                        state: 'enabled',
                        on: [
                            { detectorEvent: 'tick', delayMs: 1000 },
                        ],
                    },
                },
                actions: [
                    { define: { n: { trigger: { detectorEvent: 'tick' } } } },
                    { emit: { name: 'tick' } },
                ],
            });
        });

        itAll('takes a request observed by one detector and a reply another waits for', () => {
            expectDetectorsValid({
                g: {
                    callee: observer(
                        [
                            'request',
                        ],
                        [
                            {
                                define: {
                                    r: {
                                        trigger: { detectorEvent: 'request' },
                                        using: {
                                            path: 'at',
                                            args: [
                                                0,
                                            ],
                                        },
                                    },
                                },
                            },
                            { emit: { name: 'reply', data: { object: { to: { ref: 'r', using: 'detector' }, n: headings } } } },
                        ],
                    ),
                    caller: {
                        triggers: {
                            ...noReport,
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
                            { emit: { name: 'request' } },
                            {
                                define: {
                                    n: {
                                        wait: { detectorEvent: 'reply', where: { 'data.to': 'g.caller' }, field: 'data.n', timeoutMs: 500 },
                                    },
                                },
                            },
                        ],
                    },
                },
            });
        });
    });

    describe('validateDetector, the design’s detector event examples (self-test)', () => {
        itAll('passes polling for a change', () => {
            expectDetectorsValid({
                demo: {
                    poll_text: {
                        triggers: {
                            ...noReport,
                            auto: {
                                state: 'enabled',
                                when: {
                                    intervalMs: [
                                        250,
                                        500,
                                        750,
                                        1000,
                                        1250,
                                        1500,
                                    ],
                                },
                            },
                        },
                        actions: [
                            {
                                define: {
                                    text: {
                                        element: { selector: '#status', field: 'textContent' },
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
                                        { ref: 'text', is: { eq: { ref: 'this.lastText' } } },
                                    ],
                                },
                                then: [
                                    { define: { 'this.lastText': { ref: 'text' } } },
                                    { emit: { name: 'textChanged', data: { ref: 'text' } } },
                                ],
                            },
                        ],
                    },
                    on_text: {
                        triggers: {
                            ...noReport,
                            observe: {
                                state: 'enabled',
                                on: [
                                    { detectorEvent: 'textChanged' },
                                ],
                            },
                        },
                        actions: {
                            define: {
                                text: {
                                    ...observed('textChanged', { field: 'data' }),
                                    using: {
                                        path: 'at',
                                        args: [
                                            -1,
                                        ],
                                    },
                                },
                            },
                        },
                    },
                },
            });
        });

        itAll('passes a request with arguments and a reply for the caller that sent it', () => {
            expectDetectorsValid({
                demo: {
                    slow_resources: {
                        triggers: {
                            ...noReport,
                            observe: {
                                state: 'enabled',
                                on: [
                                    { detectorEvent: 'slowResourcesRequest' },
                                ],
                            },
                        },
                        actions: [
                            {
                                define: {
                                    request: {
                                        trigger: { detectorEvent: 'slowResourcesRequest' },
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
                                emit: {
                                    name: 'slowResources',
                                    data: {
                                        object: {
                                            to: { ref: 'request', using: 'detector' },
                                            count: {
                                                api: {
                                                    path: 'performance.getEntriesByType',
                                                    args: [
                                                        'resource',
                                                    ],
                                                    where: { duration: { gt: { ref: 'request', using: 'data.minMs' } } },
                                                },
                                                using: 'length',
                                            },
                                        },
                                    },
                                },
                            },
                        ],
                    },
                    slow_after_click: {
                        triggers: {
                            ...noReport,
                            observe: {
                                state: 'enabled',
                                on: [
                                    { event: 'click' },
                                ],
                            },
                        },
                        actions: [
                            { define: { click: { trigger: { event: 'click' } } } },
                            { emit: { name: 'slowResourcesRequest', data: { object: { minMs: 1000 } } } },
                            {
                                define: {
                                    slow: {
                                        wait: {
                                            detectorEvent: 'slowResources',
                                            where: { 'data.to': 'demo.slow_after_click' },
                                            field: 'data.count',
                                            timeoutMs: 500,
                                        },
                                    },
                                },
                            },
                        ],
                    },
                },
            });
        });
    });
});
