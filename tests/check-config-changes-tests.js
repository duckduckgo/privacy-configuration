import { expect } from 'chai';
import {
    changedRolloutSteps,
    detectorWarnings,
    experimentErrors,
    mergeFindings,
    reusedExperimentErrors,
} from '../scripts/check-config-changes.mjs';

/**
 * @param {Record<string, unknown[]>} subfeatures - rollout steps by subfeature name
 */
function config(subfeatures) {
    return {
        features: {
            history: {
                state: 'enabled',
                features: Object.fromEntries(
                    Object.entries(subfeatures).map(
                        ([
                            name,
                            steps,
                        ]) => [
                            name,
                            { state: 'enabled', rollout: { steps } },
                        ],
                    ),
                ),
            },
        },
    };
}

describe('check-config-changes: rollout steps', () => {
    const base = config({
        onByDefault: [
            { percent: 10 },
            { percent: 25 },
        ],
    });

    it('passes appended steps', () => {
        expect(
            changedRolloutSteps(
                base,
                config({
                    onByDefault: [
                        { percent: 10 },
                        { percent: 25 },
                        { percent: 100 },
                    ],
                }),
            ),
        ).to.deep.equal([]);
    });

    it('fails an edited step', () => {
        expect(
            changedRolloutSteps(
                base,
                config({
                    onByDefault: [
                        { percent: 10 },
                        { percent: 50 },
                    ],
                }),
            ),
        ).to.deep.equal([
            '/features/history/features/onByDefault/rollout: step 2 changed from {"percent":25} to {"percent":50}',
        ]);
    });

    it('fails a removed step', () => {
        expect(
            changedRolloutSteps(
                base,
                config({
                    onByDefault: [
                        { percent: 10 },
                    ],
                }),
            ),
        ).to.deep.equal([
            '/features/history/features/onByDefault/rollout: step 2 ({"percent":25}) removed',
        ]);
    });

    it('passes a removed subfeature and a new rollout', () => {
        expect(
            changedRolloutSteps(
                base,
                config({
                    other: [
                        { percent: 5 },
                    ],
                }),
            ),
        ).to.deep.equal([]);
    });
});

/**
 * A built config with one content scope experiment and a web detection detector firing `adwall`.
 *
 * @param {object} [options]
 * @param {string} [options.state] - the experiment's state
 * @param {unknown[]} [options.cohorts]
 * @param {Record<string, unknown>} [options.metrics]
 * @param {string} [options.event] - the event the detector fires
 * @param {unknown} [options.match] - the detector's match
 * @param {unknown[]} [options.conditionalChanges] - web detection conditional changes
 */
function built({
    state = 'enabled',
    cohorts = [
        { name: 'control', weight: 1 },
        { name: 'treatment', weight: 1 },
    ],
    metrics = {
        adwallSeen: {
            event: 'adwall',
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
                    ],
                },
            ],
        },
    },
    event = 'adwall',
    match = { text: { pattern: 'adblock' } },
    conditionalChanges = [],
} = {}) {
    return {
        features: {
            contentScopeExperiments: {
                state: 'enabled',
                features: {
                    contentScopeExperiment12: { state, cohorts, settings: { metrics } },
                },
            },
            webDetection: {
                state: 'enabled',
                settings: {
                    detectors: { adwalls: { generic: { match, actions: { fireEvent: { type: event } } } } },
                    conditionalChanges,
                },
            },
        },
    };
}

const SLOT = 'contentScopeExperiments.contentScopeExperiment12';
const METRIC = {
    event: 'adwall',
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
            ],
        },
    ],
};

describe('check-config-changes: live experiments', () => {
    it('passes an unchanged experiment', () => {
        expect(experimentErrors(built(), built())).to.deep.equal([]);
    });

    it('fails a metric added to an enabled experiment, and allows it when the experiment is not yet enabled', () => {
        const head = built({
            metrics: {
                adwallSeen: METRIC,
                adwallTwice: {
                    ...METRIC,
                    conversions: [
                        {
                            windows: [
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
            },
        });
        expect(experimentErrors(built(), head)).to.deep.equal([
            `${SLOT}: metric adwallTwice added to an enabled experiment; start a new experiment instead`,
        ]);
        expect(experimentErrors(built({ state: 'disabled' }), head)).to.deep.equal([]);
    });

    it('fails an edited metric', () => {
        const head = built({
            metrics: {
                adwallSeen: {
                    ...METRIC,
                    conversions: [
                        {
                            windows: [
                                [
                                    0,
                                    14,
                                ],
                            ],
                            thresholds: [
                                1,
                            ],
                        },
                    ],
                },
            },
        });
        expect(experimentErrors(built(), head)).to.have.length(1);
    });

    it('passes a metric whose event is renamed along with the detector that fires it', () => {
        const head = built({ metrics: { adwallSeen: { ...METRIC, event: 'adwall_seen' } }, event: 'adwall_seen' });
        expect(experimentErrors(built(), head)).to.deep.equal([]);
    });

    it('fails a metric whose event is renamed to one the detector does not fire', () => {
        const head = built({ metrics: { adwallSeen: { ...METRIC, event: 'captcha' } } });
        expect(experimentErrors(built(), head)).to.have.length(1);
    });

    it('passes a removed metric', () => {
        expect(experimentErrors(built(), built({ metrics: {} }))).to.deep.equal([]);
    });

    it('fails changed cohort weights', () => {
        const head = built({
            cohorts: [
                { name: 'control', weight: 2 },
                { name: 'treatment', weight: 1 },
            ],
        });
        expect(experimentErrors(built(), head)).to.deep.equal([
            `${SLOT}: cohorts changed on an enabled experiment; start a new experiment instead`,
        ]);
    });

    it('fails a new experiment whose name was used before', () => {
        const base = { features: {} };
        expect(reusedExperimentErrors(base, built(), () => true)).to.have.length(1);
        expect(reusedExperimentErrors(base, built(), () => false)).to.deep.equal([]);
        expect(reusedExperimentErrors(built(), built(), () => true)).to.deep.equal([]);
    });

    it('warns when a detector firing a live metric event changes', () => {
        expect(detectorWarnings(built(), built({ match: { text: { pattern: 'disable your adblocker' } } }))).to.have.length(1);
        const patch = {
            condition: { injectName: 'android' },
            patchSettings: [
                { op: 'add', path: '/detectors/adwalls/generic/match', value: { text: { pattern: 'x' } } },
            ],
        };
        expect(
            detectorWarnings(
                built(),
                built({
                    conditionalChanges: [
                        patch,
                    ],
                }),
            ),
        ).to.have.length(1);
    });

    it('does not warn for an unchanged detector, a renamed event or a patch scoped to experiment cohorts', () => {
        expect(detectorWarnings(built(), built())).to.deep.equal([]);
        expect(
            detectorWarnings(built(), built({ metrics: { adwallSeen: { ...METRIC, event: 'adwall_seen' } }, event: 'adwall_seen' })),
        ).to.deep.equal([]);
        const patch = {
            condition: { experiment: { experimentName: 'contentScopeExperiment12', cohort: 'treatment' } },
            patchSettings: [
                { op: 'add', path: '/detectors/adwalls/generic/match', value: { text: { pattern: 'x' } } },
            ],
        };
        expect(
            detectorWarnings(
                built(),
                built({
                    conditionalChanges: [
                        patch,
                    ],
                }),
            ),
        ).to.deep.equal([]);
    });

    it('lists the platforms a finding applies to', () => {
        expect(
            mergeFindings([
                { platform: 'android', message: 'a' },
                { platform: 'ios', message: 'a' },
                { platform: 'ios', message: 'b' },
            ]),
        ).to.deep.equal([
            'a (android, ios)',
            'b (ios)',
        ]);
    });
});
