import { expect } from 'chai';
import fs from 'fs';
import platforms from '../platforms.js';

/**
 * Validation for experiment metrics declared in the `settings.metrics` of experiment
 * subfeatures (see schema/features/experiment-metrics.ts).
 *
 * Metrics are scoped to the experiment that declares them, so nothing here constrains
 * one experiment's declarations against another's — the same metric name may bind
 * different events in different experiments. The checks below are per declaration:
 * the shape, the name, and that the event can actually be produced.
 */

// The only features whose subfeatures may carry experiment metrics. Scoping the
// capability to the experiment types with a use case is deliberate; extending it is a
// design decision, not a config edit.
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
 * Assert a single metric declaration is well-formed.
 *
 * @param {string} metricName
 * @param {any} metric
 * @param {string} path - used in error messages
 */
function assertMetricShape(metricName, metric, path) {
    expect(metricName, `${path}: metric name must match ${METRIC_NAME_FORMAT}`).to.match(METRIC_NAME_FORMAT);
    expect(RESERVED_METRIC_NAMES.has(metricName), `${path}: '${metricName}' collides with a framework built-in metric`).to.equal(false);

    expect(typeof metric?.event === 'string' && metric.event.length > 0, `${path}: 'event' must be a non-empty string`).to.equal(true);

    expect(
        Array.isArray(metric?.conversions) && metric.conversions.length > 0,
        `${path}: 'conversions' must be a non-empty array`,
    ).to.equal(true);

    for (const [
        index,
        conversion,
    ] of (metric?.conversions ?? []).entries()) {
        const conversionPath = `${path}.conversions[${index}]`;

        expect(
            Array.isArray(conversion?.windows) && conversion.windows.length > 0,
            `${conversionPath}: 'windows' must be a non-empty array`,
        ).to.equal(true);
        for (const [
            windowIndex,
            window,
        ] of (conversion?.windows ?? []).entries()) {
            const ok =
                Array.isArray(window) &&
                window.length === 2 &&
                Number.isInteger(window[0]) &&
                Number.isInteger(window[1]) &&
                window[0] >= 0 &&
                window[0] <= window[1];
            expect(
                ok,
                `${conversionPath}.windows[${windowIndex}]: expected [low, high] integers with 0 <= low <= high, got ${JSON.stringify(window)}`,
            ).to.equal(true);
        }

        if (conversion?.thresholds === undefined) continue;
        expect(
            Array.isArray(conversion.thresholds) && conversion.thresholds.length > 0,
            `${conversionPath}: 'thresholds' must be a non-empty array when present`,
        ).to.equal(true);
        for (const [
            thresholdIndex,
            threshold,
        ] of (conversion?.thresholds ?? []).entries()) {
            expect(
                Number.isInteger(threshold) && threshold >= 1,
                `${conversionPath}.thresholds[${thresholdIndex}]: expected an integer >= 1, got ${JSON.stringify(threshold)}`,
            ).to.equal(true);
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

        it('passes when thresholds are omitted', () => {
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
            ).to.not.throw();
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
