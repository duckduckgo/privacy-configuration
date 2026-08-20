import { expect } from 'chai';
import fs from 'fs';
import platforms from '../platforms.js';
import { createValidator, formatErrors } from './schema-validation.js';

/**
 * Validation for experiment metrics declared in the `settings.metrics` of experiment
 * subfeatures (see schema/features/experiment-metrics.ts).
 *
 * Checks are per declaration: the shape, the name, and that the event can be produced.
 * Metric names are scoped to the experiment that declares them, so two experiments may
 * bind the same name to different events.
 */

/**
 * The only features whose subfeatures may carry experiment metrics.
 *
 * The TDS experiment parent is `blockList` on Android and `contentBlocking` on every other
 * platform; content scope experiments use one name everywhere.
 */
const PARTICIPATING_PARENTS = [
    'contentScopeExperiments',
    'blockList',
    'contentBlocking',
];

// Names the NA experiment framework already fires as built-in retention metrics; a
// config-declared metric with one of these names would be indistinguishable in the data.
const RESERVED_METRIC_NAMES = new Set([
    'search',
    'app_use',
]);

// Native (non-web) event types clients fire into the hub. None exist yet; a metric
// converting on an event nothing produces is silent, so unknown events fail the build.
const KNOWN_NATIVE_EVENTS = new Set();

// Also excludes '.', which PixelKit forbids in pixel parameter values.
const METRIC_NAME_FORMAT = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/**
 * Every event type a webDetection detector can fire in this config. Detector triggers
 * may be introduced by conditional or per-domain patches, so this walks the whole
 * feature rather than reading a fixed path.
 *
 * @param {object} config - a generated platform config
 * @returns {Set<string>} event type names
 */
function collectFiredEventTypes(config) {
    const types = new Set();
    const visit = (node) => {
        if (Array.isArray(node)) {
            node.forEach(visit);
            return;
        }
        if (!node || typeof node !== 'object') {
            return;
        }
        if (typeof node.fireEvent?.type === 'string') {
            types.add(node.fireEvent.type);
        }
        Object.values(node).forEach(visit);
    };
    visit(config?.features?.webDetection);
    return types;
}

/**
 * Invoke `cb` for every metric declared by a subfeature of a participating parent.
 *
 * @param {object} config - a generated platform config
 * @param {(ctx: { parent: string, subFeatureName: string, metricName: string, metric: any, path: string }) => void} cb
 */
function forEachDeclaredMetric(config, cb) {
    for (const parent of PARTICIPATING_PARENTS) {
        const subFeatures = config?.features?.[parent]?.features ?? {};
        for (const [
            subFeatureName,
            subFeature,
        ] of Object.entries(subFeatures)) {
            for (const [
                metricName,
                metric,
            ] of Object.entries(subFeature?.settings?.metrics ?? {})) {
                cb({
                    parent,
                    subFeatureName,
                    metricName,
                    metric,
                    path: `${parent}.${subFeatureName}.settings.metrics.${metricName}`,
                });
            }
        }
    }
}

/**
 * Every place a `metrics` settings key appears outside the participating parents'
 * subfeatures. Anything reported here is either a misplaced experiment metric or an
 * unrelated reuse of the reserved key, both of which should fail the build.
 *
 * @param {object} config - a generated platform config
 * @returns {string[]} paths of misplaced declarations
 */
function findMisplacedMetrics(config) {
    const misplaced = [];
    for (const [
        featureName,
        feature,
    ] of Object.entries(config?.features ?? {})) {
        const parentParticipates = PARTICIPATING_PARENTS.includes(featureName);
        if (feature?.settings && 'metrics' in feature.settings) {
            // Feature-level settings never carry metrics, participating or not.
            misplaced.push(`${featureName}.settings.metrics`);
        }
        for (const [
            subFeatureName,
            subFeature,
        ] of Object.entries(feature?.features ?? {})) {
            if (!parentParticipates && subFeature?.settings && 'metrics' in subFeature.settings) {
                misplaced.push(`${featureName}.${subFeatureName}.settings.metrics`);
            }
        }
    }
    return misplaced;
}

/**
 * Fail with `message` and nothing else.
 *
 * `expect(condition, message).to.equal(true)` attaches an actual/expected pair, and mocha
 * then reduces the reported message to whatever precedes its first colon and prints a
 * `false`/`true` diff in place of the rest.
 *
 * @param {boolean} condition
 * @param {string} message
 */
function check(condition, message) {
    if (!condition) {
        expect.fail(message);
    }
}

/**
 * Assert a single metric declaration is well-formed.
 *
 * @param {string} metricName
 * @param {any} metric
 * @param {string} path - used in error messages
 */
function assertMetricShape(metricName, metric, path) {
    check(METRIC_NAME_FORMAT.test(metricName), `${path} metric name '${metricName}' must match ${METRIC_NAME_FORMAT}`);
    check(!RESERVED_METRIC_NAMES.has(metricName), `${path} metric name '${metricName}' collides with a framework built-in metric`);

    check(
        typeof metric?.event === 'string' && metric.event.length > 0,
        `${path}.event must be a non-empty string, got ${JSON.stringify(metric?.event)}`,
    );

    check(
        Array.isArray(metric?.conversions) && metric.conversions.length > 0,
        `${path}.conversions must be a non-empty array, got ${JSON.stringify(metric?.conversions)}`,
    );

    for (const [
        index,
        conversion,
    ] of (metric?.conversions ?? []).entries()) {
        const conversionPath = `${path}.conversions[${index}]`;
        const windows = conversion?.windows;

        check(
            Array.isArray(windows) && windows.length > 0,
            `${conversionPath}.windows must be a non-empty array, got ${JSON.stringify(windows)}`,
        );
        check(
            !windows.every((entry) => typeof entry === 'number'),
            `${conversionPath}.windows is a list of [low, high] pairs, so a single window nests: ` +
                `write [${JSON.stringify(windows)}] rather than ${JSON.stringify(windows)}`,
        );

        for (const [
            windowIndex,
            window,
        ] of windows.entries()) {
            const windowPath = `${conversionPath}.windows[${windowIndex}]`;
            check(Array.isArray(window) && window.length === 2, `${windowPath} must be a [low, high] pair, got ${JSON.stringify(window)}`);
            const [
                low,
                high,
            ] = window;
            check(Number.isInteger(low) && Number.isInteger(high), `${windowPath} bounds must be integers, got ${JSON.stringify(window)}`);
            check(low >= 0, `${windowPath} low bound counts days from enrollment and must be >= 0, got ${low}`);
            check(low <= high, `${windowPath} must run low to high, got ${JSON.stringify(window)}`);
        }

        const thresholds = conversion?.thresholds;
        check(
            Array.isArray(thresholds) && thresholds.length > 0,
            `${conversionPath}.thresholds must be a non-empty array, got ${JSON.stringify(thresholds)}`,
        );
        for (const [
            thresholdIndex,
            threshold,
        ] of thresholds.entries()) {
            check(
                Number.isInteger(threshold) && threshold >= 1,
                `${conversionPath}.thresholds[${thresholdIndex}] must be an integer >= 1, got ${JSON.stringify(threshold)}`,
            );
        }
    }

    assertNoDuplicateRequests(metric, path);
}

/**
 * Assert no `(window, threshold)` pair is reached twice across a metric's conversion groups.
 *
 * A metric's request set is the union of each group's `windows x thresholds` product. Windows
 * may overlap, but a pair reached twice is one conversion request authored twice, and the
 * framework converts it once, so the second is inert.
 *
 * @param {any} metric - a metric whose conversion groups are already known well-formed
 * @param {string} path - used in error messages
 */
function assertNoDuplicateRequests(metric, path) {
    /** @type {Map<string, string>} */
    const origins = new Map();

    for (const [
        index,
        conversion,
    ] of metric.conversions.entries()) {
        const origin = `conversions[${index}]`;
        for (const [
            low,
            high,
        ] of conversion.windows) {
            for (const threshold of conversion.thresholds) {
                const request = `window [${low}, ${high}] at threshold ${threshold}`;
                const previous = origins.get(`${low}-${high}@${threshold}`);
                check(
                    previous === undefined,
                    previous === origin
                        ? `${path}.${origin} requests ${request} more than once`
                        : `${path} requests ${request} in both ${previous} and ${origin}`,
                );
                origins.set(`${low}-${high}@${threshold}`, origin);
            }
        }
    }
}

const platformOutput = platforms.map((item) => item.replace('browsers/', 'extension-'));

const latestConfigs = platformOutput.map((plat) => {
    return {
        name: `v5/${plat}-config.json`,
        body: JSON.parse(fs.readFileSync(`./generated/v5/${plat}-config.json`)),
    };
});

describe('experiment metrics config tests', () => {
    describe('placement', () => {
        for (const config of latestConfigs) {
            it(`${config.name} declares metrics only in participating experiment subfeatures`, () => {
                const misplaced = findMisplacedMetrics(config.body);
                expect(misplaced, `'metrics' settings key found outside experiment subfeatures: ${misplaced.join(', ')}`).to.have.length(0);
            });
        }
    });

    describe('declaration shape', () => {
        for (const config of latestConfigs) {
            it(`${config.name} metric declarations are well-formed`, () => {
                forEachDeclaredMetric(config.body, ({ metricName, metric, path }) => {
                    assertMetricShape(metricName, metric, path);
                });
            });
        }
    });

    describe('event production', () => {
        for (const config of latestConfigs) {
            it(`${config.name} metric events are produced by a detector or a known native event`, () => {
                const firedTypes = collectFiredEventTypes(config.body);
                forEachDeclaredMetric(config.body, ({ metric, path }) => {
                    const event = metric?.event;
                    if (typeof event !== 'string') return; // shape test reports this
                    expect(
                        firedTypes.has(event) || KNOWN_NATIVE_EVENTS.has(event),
                        `${path}: event '${event}' is not fired by any webDetection detector or known native event (fired types: ${[
                            ...firedTypes,
                        ].join(', ')})`,
                    ).to.equal(true);
                });
            });
        }
    });

    describe('assertMetricShape (self-test)', () => {
        const validMetric = {
            event: 'adwallDetected',
            conversions: [
                {
                    windows: [
                        [
                            0,
                            7,
                        ],
                    ],
                    thresholds: [
                        1,
                        3,
                    ],
                },
            ],
        };

        it('passes a well-formed metric', () => {
            expect(() => assertMetricShape('adwallSeen', validMetric, '$')).to.not.throw();
        });

        it('rejects omitted thresholds', () => {
            expect(() =>
                assertMetricShape(
                    'adwallSeen',
                    {
                        event: 'adwallDetected',
                        conversions: [
                            {
                                windows: [
                                    [
                                        0,
                                        0,
                                    ],
                                ],
                            },
                        ],
                    },
                    '$',
                ),
            ).to.throw();
        });

        it('rejects a reserved name', () => {
            expect(() => assertMetricShape('search', validMetric, '$')).to.throw();
        });

        it('rejects a name containing a dot', () => {
            expect(() => assertMetricShape('adwall.seen', validMetric, '$')).to.throw();
        });

        it('rejects a missing event', () => {
            expect(() => assertMetricShape('adwallSeen', { conversions: validMetric.conversions }, '$')).to.throw();
        });

        it('rejects empty conversions', () => {
            expect(() => assertMetricShape('adwallSeen', { event: 'adwallDetected', conversions: [] }, '$')).to.throw();
        });

        it('names the nesting when a single window is written un-nested', () => {
            expect(() =>
                assertMetricShape(
                    'adwallSeen',
                    {
                        event: 'adwallDetected',
                        conversions: [
                            {
                                windows: [
                                    1,
                                    2,
                                ],
                                thresholds: [
                                    1,
                                ],
                            },
                        ],
                    },
                    '$',
                ),
            ).to.throw('write [[1,2]] rather than [1,2]');
        });

        it('rejects a non-integer window bound', () => {
            expect(() =>
                assertMetricShape(
                    'adwallSeen',
                    {
                        event: 'adwallDetected',
                        conversions: [
                            {
                                windows: [
                                    [
                                        0,
                                        '7',
                                    ],
                                ],
                                thresholds: [
                                    1,
                                ],
                            },
                        ],
                    },
                    '$',
                ),
            ).to.throw('bounds must be integers');
        });

        it('rejects a negative window bound', () => {
            expect(() =>
                assertMetricShape(
                    'adwallSeen',
                    {
                        event: 'adwallDetected',
                        conversions: [
                            {
                                windows: [
                                    [
                                        -1,
                                        4,
                                    ],
                                ],
                                thresholds: [
                                    1,
                                ],
                            },
                        ],
                    },
                    '$',
                ),
            ).to.throw('must be >= 0');
        });

        it('rejects an inverted window', () => {
            expect(() =>
                assertMetricShape(
                    'adwallSeen',
                    {
                        event: 'adwallDetected',
                        conversions: [
                            {
                                windows: [
                                    [
                                        3,
                                        1,
                                    ],
                                ],
                            },
                        ],
                    },
                    '$',
                ),
            ).to.throw();
        });

        it('rejects a threshold repeated within one group', () => {
            expect(() =>
                assertMetricShape(
                    'adwallSeen',
                    {
                        event: 'adwallDetected',
                        conversions: [
                            {
                                windows: [
                                    [
                                        0,
                                        7,
                                    ],
                                ],
                                thresholds: [
                                    1,
                                    1,
                                ],
                            },
                        ],
                    },
                    '$',
                ),
            ).to.throw('$.conversions[0] requests window [0, 7] at threshold 1 more than once');
        });

        it('rejects a window repeated within one group', () => {
            expect(() =>
                assertMetricShape(
                    'adwallSeen',
                    {
                        event: 'adwallDetected',
                        conversions: [
                            {
                                windows: [
                                    [
                                        0,
                                        7,
                                    ],
                                    [
                                        0,
                                        7,
                                    ],
                                ],
                                thresholds: [
                                    2,
                                ],
                            },
                        ],
                    },
                    '$',
                ),
            ).to.throw('$.conversions[0] requests window [0, 7] at threshold 2 more than once');
        });

        it('rejects the same window and threshold reached by two groups', () => {
            expect(() =>
                assertMetricShape(
                    'adwallSeen',
                    {
                        event: 'adwallDetected',
                        conversions: [
                            {
                                windows: [
                                    [
                                        0,
                                        7,
                                    ],
                                ],
                                thresholds: [
                                    1,
                                    3,
                                ],
                            },
                            {
                                windows: [
                                    [
                                        0,
                                        7,
                                    ],
                                ],
                                thresholds: [
                                    3,
                                ],
                            },
                        ],
                    },
                    '$',
                ),
            ).to.throw('$ requests window [0, 7] at threshold 3 in both conversions[0] and conversions[1]');
        });

        it('accepts overlapping windows that differ in bounds', () => {
            expect(() =>
                assertMetricShape(
                    'adwallSeen',
                    {
                        event: 'adwallDetected',
                        conversions: [
                            {
                                windows: [
                                    [
                                        0,
                                        0,
                                    ],
                                    [
                                        0,
                                        7,
                                    ],
                                ],
                                thresholds: [
                                    1,
                                ],
                            },
                        ],
                    },
                    '$',
                ),
            ).to.not.throw();
        });

        it('accepts the same window at different thresholds', () => {
            expect(() => assertMetricShape('adwallSeen', validMetric, '$')).to.not.throw();
        });

        it('rejects a zero threshold', () => {
            expect(() =>
                assertMetricShape(
                    'adwallSeen',
                    {
                        event: 'adwallDetected',
                        conversions: [
                            {
                                windows: [
                                    [
                                        0,
                                        7,
                                    ],
                                ],
                                thresholds: [
                                    0,
                                ],
                            },
                        ],
                    },
                    '$',
                ),
            ).to.throw();
        });
    });

    describe('schema', () => {
        const validate = createValidator('ExperimentMetricsSettings');

        const settingsWithConversion = (conversion) => ({
            metrics: {
                adwallSeen: {
                    event: 'adwallDetected',
                    conversions: [
                        conversion,
                    ],
                },
            },
        });

        const window = [
            [
                0,
                7,
            ],
        ];

        it('accepts explicit thresholds', () => {
            const settings = settingsWithConversion({
                windows: window,
                thresholds: [
                    1,
                ],
            });
            expect(validate(settings)).to.equal(true, formatErrors(validate.errors));
        });

        it('rejects a conversion group without thresholds', () => {
            expect(validate(settingsWithConversion({ windows: window }))).to.equal(false);
        });
    });

    describe('findMisplacedMetrics (self-test)', () => {
        it('accepts metrics under a participating parent subfeature', () => {
            const config = {
                features: {
                    contentScopeExperiments: {
                        features: {
                            experiment1: { settings: { metrics: {} } },
                        },
                    },
                },
            };
            expect(findMisplacedMetrics(config)).to.have.length(0);
        });

        it('reports metrics under a non-participating feature subfeature', () => {
            const config = {
                features: {
                    someFeature: {
                        features: {
                            someSubFeature: { settings: { metrics: {} } },
                        },
                    },
                },
            };
            expect(findMisplacedMetrics(config)).to.deep.equal([
                'someFeature.someSubFeature.settings.metrics',
            ]);
        });

        it('reports metrics in feature-level settings, even on a participating parent', () => {
            const config = {
                features: {
                    blockList: {
                        settings: { metrics: {} },
                        features: {},
                    },
                },
            };
            expect(findMisplacedMetrics(config)).to.deep.equal([
                'blockList.settings.metrics',
            ]);
        });
    });
});
