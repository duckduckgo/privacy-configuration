import { expect } from 'chai';
import { readFileSync } from 'fs';
import { parseJsonc } from '../scripts/set-jsonc-path.mjs';
import {
    ANDROID_SLOTS,
    addExperimentSlot,
    appendConditionalChanges,
    autoRunning,
    buildCohorts,
    resolveSizing,
    buildConditionalChanges,
    buildUnits,
    clientsFor,
    compareVersions,
    create,
    dealSlices,
    effectiveDetectors,
    latestGate,
    matchCondition,
    pickSlot,
    removeConditionalChanges,
    removeExperimentSlot,
    sameVersionFamily,
    verifyCohorts,
} from '../scripts/web-detection-experiment.mjs';

const auto = (state = 'enabled') => ({
    auto: {
        state,
        when: {
            intervalMs: [
                1000,
            ],
        },
    },
});

/** Detectors a and b auto-run everywhere; c runs on Android from 200; d is off with a trigger and fireEvent. */
function fixtureSettings() {
    return {
        detectors: {
            groupA: {
                a: { triggers: auto(), actions: { fireEvent: { type: 'a' } } },
                b: { triggers: auto(), actions: { fireEvent: { type: 'b' } } },
            },
            groupB: {
                c: { state: 'disabled', triggers: auto(), actions: { fireEvent: { type: 'c' } } },
                d: { triggers: auto('disabled'), actions: { fireEvent: { type: 'd' } } },
            },
        },
        conditionalChanges: [
            {
                condition: { injectName: 'android', minSupportedVersion: 200 },
                patchSettings: [
                    { op: 'replace', path: '/detectors/groupB/c/state', value: 'enabled' },
                ],
            },
        ],
    };
}

const FIXTURE_TEXT = `{
    // Leading comment
    "settings": {
        "detectors": {},
        "conditionalChanges": [
            // Existing block
            {
                "condition": { "injectName": "android" },
                "patchSettings": []
            }
        ]
    }
}
`;

const OVERRIDE_TEXT = `{
    "features": {
        // Web detection
        "webDetection": {
            "state": "enabled"
        }
    }
}
`;

describe('web-detection-experiment', () => {
    describe('versions', () => {
        it('compares numbers and dotted strings', () => {
            expect(compareVersions(5, 7)).to.be.below(0);
            expect(compareVersions('1.10.0', '1.9.0')).to.be.above(0);
            expect(compareVersions('7.234', '7.234.0')).to.equal(0);
        });

        it('groups versions by type and major part', () => {
            expect(sameVersionFamily('7.234.0', '7.1.0')).to.equal(true);
            expect(sameVersionFamily('1.204.0', '7.234.0')).to.equal(false);
            expect(sameVersionFamily(52700000, 53010000)).to.equal(true);
            expect(sameVersionFamily(52700000, '1.0.0')).to.equal(false);
        });
    });

    describe('matchCondition', () => {
        const client = { injectName: 'apple-isolated', version: '1.210.0', cohorts: { exp: 'treatment01' } };

        it('matches inject name and version range', () => {
            expect(
                matchCondition({ injectName: 'apple-isolated', minSupportedVersion: '1.204.0', maxSupportedVersion: '1.999.999' }, client),
            ).to.equal(true);
            expect(matchCondition({ injectName: 'apple-isolated', minSupportedVersion: '7.234.0' }, client)).to.equal(false);
            expect(matchCondition({ injectName: 'android' }, client)).to.equal(false);
        });

        it('matches any block in an array', () => {
            expect(
                matchCondition(
                    [
                        { injectName: 'android' },
                        { injectName: 'apple-isolated' },
                    ],
                    client,
                ),
            ).to.equal(true);
        });

        it('matches the assigned cohort only', () => {
            expect(matchCondition({ experiment: { experimentName: 'exp', cohort: 'treatment01' } }, client)).to.equal(true);
            expect(matchCondition({ experiment: { experimentName: 'exp', cohort: 'control' } }, client)).to.equal(false);
        });

        it('never matches page-scoped or build-scoped blocks', () => {
            for (const block of [
                { domain: 'example.com' },
                { urlPattern: 'https://*' },
                { internal: true },
                { context: { top: true } },
            ]) {
                expect(matchCondition(/** @type {any} */ (block), client)).to.equal(false);
            }
        });

        it('never matches a version condition without a client version', () => {
            expect(
                matchCondition(
                    { injectName: 'firefox', minSupportedVersion: '1.0.0' },
                    { injectName: 'firefox', version: undefined, cohorts: {} },
                ),
            ).to.equal(false);
        });
    });

    describe('production state', () => {
        it('applies matching blocks', () => {
            const settings = fixtureSettings();
            expect([
                ...autoRunning(settings, clientsFor('android', 200)),
            ]).to.have.members([
                'groupA/a',
                'groupA/b',
                'groupB/c',
            ]);
            expect([
                ...autoRunning(settings, clientsFor('android', 100)),
            ]).to.have.members([
                'groupA/a',
                'groupA/b',
            ]);
            expect([
                ...autoRunning(settings, clientsFor('windows', '0.180.0')),
            ]).to.have.members([
                'groupA/a',
                'groupA/b',
            ]);
        });

        it('skips a block whose patch fails', () => {
            const settings = fixtureSettings();
            settings.conditionalChanges.push({
                condition: { injectName: 'android' },
                patchSettings: [
                    { op: 'replace', path: '/detectors/groupA/a/state', value: 'disabled' },
                    { op: 'replace', path: '/detectors/missing/x/state', value: 'enabled' },
                ],
            });
            const detectors = effectiveDetectors(settings, { injectName: 'android', version: 200, cohorts: {} });
            expect(detectors.groupA.a.state).to.equal(undefined);
        });

        it('takes the latest gate in the platform version family', () => {
            const settings = {
                detectors: {},
                conditionalChanges: [
                    {
                        condition: [
                            { injectName: 'apple-isolated', minSupportedVersion: '7.234.0' },
                            { injectName: 'apple-isolated', minSupportedVersion: '1.204.0', maxSupportedVersion: '1.999.999' },
                            { injectName: 'apple', minSupportedVersion: '999.0.0' },
                            { injectName: 'windows', minSupportedVersion: '0.171.0' },
                        ],
                        patchSettings: [],
                    },
                ],
            };
            expect(latestGate('macos', settings, '1.184.0')).to.equal('1.204.0');
            expect(latestGate('ios', settings, '7.214.0')).to.equal('7.234.0');
            expect(latestGate('windows', settings, '0.147.0')).to.equal('0.178.0');
        });
    });

    describe('assignment', () => {
        const units = buildUnits(
            Array.from({ length: 11 }, (_, i) => `group${i % 3}/d${i}`),
            'detector',
        );

        it('is deterministic for a seed', () => {
            expect(dealSlices(units, 4, 'seed')).to.deep.equal(dealSlices(units, 4, 'seed'));
            expect(dealSlices(units, 4, 'seed')).to.not.deep.equal(dealSlices(units, 4, 'other'));
        });

        it('covers every unit once with balanced slices', () => {
            const slices = dealSlices(units, 4, 'seed');
            expect(slices.flat()).to.have.members(units.flat());
            expect(slices.map((slice) => slice.length)).to.have.members([
                3,
                3,
                3,
                2,
            ]);
        });

        it('keeps groups together', () => {
            const groups = buildUnits(
                [
                    'g1/a',
                    'g1/b',
                    'g2/c',
                ],
                'group',
            );
            expect(groups).to.deep.equal([
                [
                    'g1/a',
                    'g1/b',
                ],
                [
                    'g2/c',
                ],
            ]);
            for (const slice of dealSlices(groups, 2, 'seed')) {
                expect(new Set(slice.map((id) => id.split('/')[0])).size).to.equal(1);
            }
        });

        it('rejects more cohorts than units', () => {
            expect(() => dealSlices(units, 12, 'seed')).to.throw('11 units to split across 12 cohorts');
        });
    });

    describe('resolveSizing', () => {
        it('defaults to a full rollout with a square-root control', () => {
            expect(resolveSizing(10, {})).to.deep.equal({ rollout: 10000, control: 2410, cohort: 759 });
        });

        it('shares a given rollout with a square-root control', () => {
            expect(resolveSizing(10, { rollout: 50 })).to.deep.equal({ rollout: 5000, control: 1210, cohort: 379 });
        });

        it('shares a given rollout after a fixed control', () => {
            expect(resolveSizing(10, { rollout: 50, control: 10 })).to.deep.equal({ rollout: 5000, control: 1000, cohort: 400 });
        });

        it('derives the rollout from the cohort size, rounded up to a whole percent', () => {
            expect(resolveSizing(10, { cohortPercent: 5 })).to.deep.equal({ rollout: 6600, control: 1600, cohort: 500 });
            expect(resolveSizing(10, { cohortPercent: 5, control: 20 })).to.deep.equal({ rollout: 7000, control: 2000, cohort: 500 });
        });

        it('gives control the remainder of the rollout', () => {
            expect(resolveSizing(10, { cohortPercent: 5, control: 'remainder' })).to.deep.equal({
                rollout: 10000,
                control: 5000,
                cohort: 500,
            });
            expect(resolveSizing(10, { cohortPercent: 5, rollout: 80 })).to.deep.equal({ rollout: 8000, control: 3000, cohort: 500 });
        });

        it('rejects impossible sizes', () => {
            expect(() => resolveSizing(10, { rollout: 50, control: 10, cohortPercent: 4 })).to.throw('at most two');
            expect(() => resolveSizing(10, { control: 'remainder' })).to.throw('needs --cohort-percent');
            expect(() => resolveSizing(10, { cohortPercent: 10 })).to.throw('at most 100%');
            expect(() => resolveSizing(10, { cohortPercent: 10, control: 'remainder' })).to.throw('need a share of users');
            expect(() => resolveSizing(10, { rollout: 50, control: 60 })).to.throw('need a share of users');
        });
    });

    describe('buildCohorts', () => {
        it('weights cohorts in hundredths of a percent summing to the rollout', () => {
            const sizing = resolveSizing(10, { rollout: 50 });
            const cohorts = buildCohorts(10, sizing);
            expect(cohorts[0]).to.deep.equal({ name: 'control', weight: 1210 });
            expect(cohorts.slice(1).map((c) => c.name)).to.deep.equal(
                Array.from({ length: 10 }, (_, i) => `treatment${String(i + 1).padStart(2, '0')}`),
            );
            expect(cohorts.reduce((sum, c) => sum + c.weight, 0)).to.equal(sizing.rollout);
        });
    });

    describe('buildConditionalChanges', () => {
        const slices = [
            [
                'groupA/a',
            ],
            [
                'groupA/b',
            ],
        ];

        it('disables a slice for every other cohort in enable mode', () => {
            const [
                first,
            ] = buildConditionalChanges('enable', 'exp', slices);
            expect(first.condition).to.deep.equal([
                { experiment: { experimentName: 'exp', cohort: 'control' } },
                { experiment: { experimentName: 'exp', cohort: 'treatment02' } },
            ]);
            expect(first.patchSettings).to.deep.equal([
                { op: 'add', path: '/detectors/groupA/a/state', value: 'disabled' },
            ]);
        });

        it('disables a slice for its own cohort in disable mode', () => {
            const [
                first,
            ] = buildConditionalChanges('disable', 'exp', slices);
            expect(first.condition).to.deep.equal({ experiment: { experimentName: 'exp', cohort: 'treatment01' } });
        });

        it('enables state and auto trigger in trial mode', () => {
            const [
                first,
            ] = buildConditionalChanges('trial', 'exp', slices);
            expect(first.patchSettings.map((op) => op.path)).to.deep.equal([
                '/detectors/groupA/a/state',
                '/detectors/groupA/a/triggers/auto/state',
            ]);
        });
    });

    describe('verifyCohorts', () => {
        const plans = () => {
            const settings = fixtureSettings();
            return [
                {
                    platform: /** @type {const} */ ('android'),
                    clientVersion: 200,
                    minSupportedVersion: 200,
                    production: autoRunning(settings, clientsFor('android', 200)),
                },
                {
                    platform: /** @type {const} */ ('windows'),
                    clientVersion: '0.180.0',
                    minSupportedVersion: '0.178.0',
                    production: autoRunning(settings, clientsFor('windows', '0.180.0')),
                },
            ];
        };

        /**
         * @param {'enable' | 'disable' | 'trial'} mode
         * @param {string[][]} slices
         */
        const run = (mode, slices) => {
            const settings = fixtureSettings();
            const withExperiment = {
                ...settings,
                conditionalChanges: [
                    ...settings.conditionalChanges,
                    ...buildConditionalChanges(mode, 'exp', slices),
                ],
            };
            return Object.fromEntries(
                verifyCohorts(mode, 'exp', withExperiment, plans(), slices).map((r) => [
                    r.cohort,
                    [
                        ...r.running.values(),
                    ],
                ]),
            );
        };

        it('enable: each cohort runs only its slice', () => {
            expect(
                run('enable', [
                    [
                        'groupA/a',
                    ],
                    [
                        'groupA/b',
                        'groupB/c',
                    ],
                ]),
            ).to.deep.equal({
                control: [
                    0,
                    0,
                ],
                treatment01: [
                    1,
                    1,
                ],
                treatment02: [
                    2,
                    1,
                ],
            });
        });

        it('disable: each cohort stops its slice', () => {
            expect(
                run('disable', [
                    [
                        'groupA/a',
                    ],
                    [
                        'groupA/b',
                        'groupB/c',
                    ],
                ]),
            ).to.deep.equal({
                control: [
                    3,
                    2,
                ],
                treatment01: [
                    2,
                    1,
                ],
                treatment02: [
                    1,
                    1,
                ],
            });
        });

        it('trial: each cohort adds its slice', () => {
            expect(
                run('trial', [
                    [
                        'groupB/d',
                    ],
                    [
                        'groupB/c',
                    ],
                ]),
            ).to.deep.equal({
                control: [
                    3,
                    2,
                ],
                treatment01: [
                    4,
                    3,
                ],
                treatment02: [
                    3,
                    3,
                ],
            });
        });

        it('throws when the blocks do not produce the mode', () => {
            const settings = fixtureSettings();
            const slices = [
                [
                    'groupA/a',
                ],
                [
                    'groupA/b',
                ],
            ];
            const wrong = {
                ...settings,
                conditionalChanges: [
                    ...settings.conditionalChanges,
                    ...buildConditionalChanges('disable', 'exp', slices),
                ],
            };
            expect(() => verifyCohorts('enable', 'exp', wrong, plans(), slices)).to.throw('android control');
        });
    });

    describe('JSONC edits', () => {
        it('appends and removes conditional changes, keeping comments', () => {
            const changes = buildConditionalChanges('disable', 'exp', [
                [
                    'groupA/a',
                ],
                [
                    'groupA/b',
                ],
            ]);
            const added = appendConditionalChanges(FIXTURE_TEXT, changes);
            const parsed = /** @type {any} */ (parseJsonc(added, 'added'));
            expect(parsed.settings.conditionalChanges).to.have.length(3);
            expect(parsed.settings.conditionalChanges.slice(1)).to.deep.equal(changes);
            expect(added).to.contain('// Existing block');

            const { text, removed } = removeConditionalChanges(added, 'exp');
            expect(removed).to.equal(2);
            expect(parseJsonc(text, 'removed')).to.deep.equal(parseJsonc(FIXTURE_TEXT, 'fixture'));
            expect(text).to.contain('// Leading comment');
        });

        it('creates contentScopeExperiments when missing and removes it with its last slot', () => {
            const slot = {
                state: /** @type {const} */ ('enabled'),
                description: 'test',
                cohorts: buildCohorts(1, resolveSizing(1, { cohortPercent: 10, control: 'remainder' })),
            };
            const added = addExperimentSlot(OVERRIDE_TEXT, 'contentScopeExperiment10', slot);
            const parsed = /** @type {any} */ (parseJsonc(added, 'added'));
            expect(parsed.features.contentScopeExperiments).to.deep.equal({
                state: 'enabled',
                exceptions: [],
                features: { contentScopeExperiment10: slot },
            });
            expect(() => addExperimentSlot(added, 'contentScopeExperiment10', slot)).to.throw('already exists');

            const { text, removed } = removeExperimentSlot(added, 'contentScopeExperiment10');
            expect(removed).to.equal(true);
            expect(parseJsonc(text, 'removed')).to.deep.equal(parseJsonc(OVERRIDE_TEXT, 'fixture'));
            expect(text).to.contain('// Web detection');
        });

        it('keeps other slots when removing one', () => {
            const slot = {
                state: /** @type {const} */ ('enabled'),
                description: 'test',
                cohorts: buildCohorts(1, resolveSizing(1, { cohortPercent: 10, control: 'remainder' })),
            };
            const both = addExperimentSlot(
                addExperimentSlot(OVERRIDE_TEXT, 'contentScopeExperiment10', slot),
                'contentScopeExperiment11',
                slot,
            );
            const { text } = removeExperimentSlot(both, 'contentScopeExperiment10');
            expect(Object.keys(/** @type {any} */ (parseJsonc(text, 'removed')).features.contentScopeExperiments.features)).to.deep.equal([
                'contentScopeExperiment11',
            ]);
        });
    });

    describe('pickSlot', () => {
        it('skips slots in use or used before', () => {
            const slot = pickSlot(new Set(ANDROID_SLOTS.slice(0, 10)), (name) => name === 'contentScopeExperiment10');
            expect(slot).to.equal('contentScopeExperiment11');
        });
    });

    describe('create on the real config (dry run)', () => {
        const files = [
            'features/web-detection.json',
            'overrides/android-override.json',
            'overrides/windows-override.json',
        ];

        /**
         * @param {'enable' | 'disable'} mode
         */
        const dryRun = (mode) =>
            create({
                mode,
                cohorts: 4,
                cohortPercent: 10,
                control: undefined,
                by: 'detector',
                seed: 'test',
                experiment: 'contentScopeExperiment100',
                platforms: [
                    'android',
                    'ios',
                    'macos',
                    'windows',
                ],
                clientVersions: {},
                rollout: undefined,
                dryRun: true,
            });

        for (const mode of /** @type {const} */ ([
            'enable',
            'disable',
        ])) {
            it(`${mode}: verifies every cohort and writes nothing`, async () => {
                const before = files.map((file) => readFileSync(file, 'utf8'));
                const { report } = await dryRun(mode);
                expect(report).to.contain('| control | 20% |');
                expect(report).to.contain('| treatment04 | 10% |');
                expect(report).to.contain('| not enrolled | 40% | production | |');
                expect(files.map((file) => readFileSync(file, 'utf8'))).to.deep.equal(before);
            });
        }

        it('warns when users outside an enable rollout run production', async () => {
            const { warnings } = await dryRun('enable');
            expect(warnings).to.include('The 40% of users outside the rollout run every production detector');
            expect((await dryRun('disable')).warnings.join('\n')).to.not.contain('outside the rollout');
        });
    });
});
