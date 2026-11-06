import { expect } from 'chai';
import { parseJsonc } from '../scripts/set-jsonc-path.mjs';
import { applyConditionalChanges, compareVersions, matchCondition, sameVersionFamily } from '../scripts/config-conditions.mjs';
import { Workspace } from '../scripts/config-files.mjs';
import {
    ANDROID_SLOTS,
    appendRolloutStep,
    createExperiment,
    experimentChangeIndices,
    experimentStatus,
    featureLoads,
    locateSettings,
    locateSubfeature,
    mergedFeature,
    pickSlot,
    platformClients,
    removeExperiment,
    setSubfeatureState,
    slotsInUse,
} from '../scripts/experiment.mjs';

/**
 * webDetection is on for Android and macOS and off for iOS and Windows; Windows overrides its settings.
 * subTest defines baseSub in its base file; macOS replaces its subfeatures.
 */
const FILES = {
    'features/web-detection.json': `{
    // Base web detection
    "state": "disabled",
    "exceptions": [],
    "settings": {
        "detectors": {}
    }
}
`,
    'features/content-scope-experiments.json': `{
    "state": "disabled",
    "exceptions": []
}
`,
    'features/sub-test.json': `{
    "state": "enabled",
    "exceptions": [],
    "features": {
        "baseSub": {
            "state": "enabled",
            "rollout": { "steps": [{ "percent": 10 }] }
        }
    }
}
`,
    'overrides/android-override.json': `{
    "features": {
        // Android web detection
        "webDetection": { "state": "enabled", "minSupportedVersion": 52700000 },
        "subTest": { "state": "enabled" },
        "contentScopeExperiments": {
            "state": "enabled",
            "exceptions": [],
            "features": {
                "contentScopeExperiment5": { "state": "enabled", "cohorts": [{ "name": "control", "weight": 1 }] }
            }
        }
    }
}
`,
    'overrides/ios-override.json': `{
    "features": {
        "webDetection": { "state": "disabled", "minSupportedVersion": "7.214.0" }
    }
}
`,
    'overrides/macos-override.json': `{
    "features": {
        "webDetection": { "state": "enabled", "minSupportedVersion": "1.184.0" },
        "subTest": { "state": "enabled", "features": {} },
        "contentScopeExperiments": {
            "state": "enabled",
            "exceptions": [],
            "features": { "contentScopeExperiment6": { "state": "disabled", "cohorts": [{ "name": "control", "weight": 1 }] } }
        }
    }
}
`,
    'overrides/windows-override.json': `{
    "features": {
        "webDetection": {
            "state": "disabled",
            "minSupportedVersion": "0.147.0",
            "settings": { "detectors": {} }
        }
    }
}
`,
    'overrides/extension-override.json': `{
    "features": {}
}
`,
};

const FEATURE_FILES = {
    webDetection: 'features/web-detection.json',
    contentScopeExperiments: 'features/content-scope-experiments.json',
    subTest: 'features/sub-test.json',
};

function workspace() {
    return new Workspace((file) => {
        const text = /** @type {Record<string, string>} */ (FILES)[file];
        if (text === undefined) throw new Error(`No fixture for ${file}`);
        return text;
    }, FEATURE_FILES);
}

/** @type {import('../scripts/experiment.mjs').CreateOptions} */
const CREATE = {
    slot: 'contentScopeExperiment12',
    parent: 'contentScopeExperiments',
    platforms: [
        'android',
        'ios',
        'macos',
        'windows',
    ],
    cohorts: [
        { name: 'control', weight: 1 },
        { name: 'treatment', weight: 1 },
    ],
    rollout: 10,
    minVersions: {},
    description: undefined,
    enableFeatures: [
        'webDetection',
    ],
    control: 'production',
    patches: [],
};

/**
 * @param {Workspace} ws
 * @param {import('../scripts/config-conditions.mjs').Platform} platform
 * @param {string | undefined} cohort
 */
function webDetectionLoads(ws, platform, cohort) {
    const version = { android: 52700000, ios: '7.214.0', macos: '1.184.0', windows: '0.178.0', extension: undefined }[platform];
    const feature = /** @type {import('../scripts/experiment.mjs').MergedFeature} */ (mergedFeature(ws, 'webDetection', platform));
    return platformClients(platform, version, cohort === undefined ? {} : { contentScopeExperiment12: cohort }).some((client) =>
        featureLoads(feature, client),
    );
}

describe('experiment', () => {
    describe('conditions', () => {
        const client = { injectName: 'apple-isolated', version: '1.210.0', cohorts: { exp: 'treatment01' } };

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

        it('reports patches that fail and keeps applying the rest', () => {
            const failing = {
                condition: { injectName: 'android' },
                patchSettings: [
                    { op: /** @type {const} */ ('add'), path: '/missing/value', value: 1 },
                ],
            };
            const passing = {
                condition: { injectName: 'android' },
                patchSettings: [
                    { op: /** @type {const} */ ('add'), path: '/value', value: 2 },
                ],
            };
            const { settings, failed } = applyConditionalChanges(
                {
                    conditionalChanges: [
                        failing,
                        passing,
                    ],
                },
                { injectName: 'android', version: 1, cohorts: {} },
            );
            expect(failed).to.deep.equal([
                failing,
            ]);
            expect(/** @type {any} */ (settings).value).to.equal(2);
        });
    });

    describe('locating', () => {
        it('finds a subfeature in each override', () => {
            const locations = locateSubfeature(workspace(), 'contentScopeExperiments', 'contentScopeExperiment5');
            expect(locations).to.deep.equal([
                {
                    file: 'overrides/android-override.json',
                    path: [
                        'features',
                        'contentScopeExperiments',
                        'features',
                        'contentScopeExperiment5',
                    ],
                    platforms: [
                        'android',
                    ],
                },
            ]);
        });

        it('finds a base subfeature on every platform whose override keeps the base subfeatures', () => {
            const [
                location,
            ] = locateSubfeature(workspace(), 'subTest', 'baseSub');
            expect(location.file).to.equal('features/sub-test.json');
            expect(location.platforms).to.deep.equal([
                'android',
                'ios',
                'windows',
                'extension',
            ]);
        });

        it('finds settings in the override that declares them, else the base file', () => {
            const locations = locateSettings(workspace(), 'webDetection', [
                'android',
                'windows',
                'ios',
            ]);
            expect(
                locations.map((l) => [
                    l.file,
                    l.platforms,
                ]),
            ).to.deep.equal([
                [
                    'features/web-detection.json',
                    [
                        'android',
                        'ios',
                    ],
                ],
                [
                    'overrides/windows-override.json',
                    [
                        'windows',
                    ],
                ],
            ]);
        });

        it('refuses settings the build merges', () => {
            expect(() =>
                locateSettings(workspace(), 'eventHub', [
                    'android',
                ]),
            ).to.throw('merged by the build');
        });
    });

    describe('slots', () => {
        it('lists the slots in use', () => {
            expect([
                ...slotsInUse(workspace()),
            ]).to.deep.equal([
                'contentScopeExperiment5',
                'contentScopeExperiment6',
            ]);
        });

        it('skips slots in use or used before', () => {
            const slot = pickSlot(new Set(ANDROID_SLOTS.slice(0, 10)), (name) => name === 'contentScopeExperiment10');
            expect(slot).to.equal('contentScopeExperiment11');
        });
    });

    describe('createExperiment', () => {
        it('adds the slot to each override, creating contentScopeExperiments where missing', () => {
            const ws = workspace();
            createExperiment(ws, { ...CREATE, enableFeatures: [] });
            const windows = ws.parse('overrides/windows-override.json').features.contentScopeExperiments;
            expect(windows).to.deep.equal({
                state: 'enabled',
                exceptions: [],
                features: {
                    contentScopeExperiment12: {
                        state: 'enabled',
                        description: 'Cohorts control 1, treatment 1',
                        minSupportedVersion: '0.178.0',
                        rollout: {
                            steps: [
                                { percent: 10 },
                            ],
                        },
                        cohorts: CREATE.cohorts,
                    },
                },
            });
            expect(ws.read('overrides/android-override.json')).to.contain('// Android web detection');
        });

        it('refuses an existing slot, an undeclared Android slot, and hiding base subfeatures', () => {
            expect(() => createExperiment(workspace(), { ...CREATE, slot: 'contentScopeExperiment5' })).to.throw('already exists');
            expect(() => createExperiment(workspace(), { ...CREATE, slot: 'myExperiment' })).to.throw('Android ignores');
            expect(() =>
                createExperiment(workspace(), {
                    ...CREATE,
                    parent: 'subTest',
                    slot: 'newSub',
                    platforms: [
                        'android',
                    ],
                    enableFeatures: [],
                }),
            ).to.throw('would hide');
            expect(() =>
                createExperiment(workspace(), {
                    ...CREATE,
                    parent: 'missing',
                    slot: 'newSub',
                    platforms: [
                        'ios',
                    ],
                    enableFeatures: [],
                }),
            ).to.throw('is not in overrides/ios-override.json');
        });

        it('control production: treatment on, everyone else as production', () => {
            const ws = workspace();
            const { warnings } = createExperiment(ws, CREATE);
            expect(ws.parse('overrides/ios-override.json').features.webDetection.state).to.equal('enabled');
            expect(ws.parse('overrides/windows-override.json').features.webDetection.state).to.equal('enabled');
            for (const [
                platform,
                production,
            ] of /** @type {const} */ ([
                [
                    'android',
                    true,
                ],
                [
                    'ios',
                    false,
                ],
                [
                    'macos',
                    true,
                ],
                [
                    'windows',
                    false,
                ],
            ])) {
                expect(webDetectionLoads(ws, platform, undefined), `${platform} not enrolled`).to.equal(production);
                expect(webDetectionLoads(ws, platform, 'control'), `${platform} control`).to.equal(production);
                expect(webDetectionLoads(ws, platform, 'treatment'), `${platform} treatment`).to.equal(true);
            }
            expect(warnings).to.include('webDetection is already on for android, so the experiment changes nothing there');
        });

        it('scopes the off block to iOS without catching macOS', () => {
            const ws = workspace();
            createExperiment(ws, CREATE);
            const [
                off,
                on,
            ] = ws.parse('features/web-detection.json').settings.conditionalChanges;
            expect(off.condition).to.deep.equal([
                { injectName: 'apple', minSupportedVersion: '7.0.0' },
                { injectName: 'apple-isolated', minSupportedVersion: '7.0.0' },
            ]);
            expect(on.condition).to.deep.equal([
                { experiment: { experimentName: 'contentScopeExperiment12', cohort: 'treatment' } },
            ]);
            const windows = ws.parse('overrides/windows-override.json').features.webDetection.settings.conditionalChanges;
            expect(windows[0].condition).to.deep.equal([
                { injectName: 'windows' },
            ]);
        });

        it('control disabled: control off everywhere', () => {
            const ws = workspace();
            createExperiment(ws, { ...CREATE, control: 'disabled' });
            for (const platform of /** @type {const} */ ([
                'android',
                'ios',
                'macos',
                'windows',
            ])) {
                expect(webDetectionLoads(ws, platform, 'control'), platform).to.equal(false);
                expect(webDetectionLoads(ws, platform, 'treatment'), platform).to.equal(true);
            }
            expect(webDetectionLoads(ws, 'android', undefined)).to.equal(true);
        });

        it('control enabled: control on everywhere', () => {
            const ws = workspace();
            createExperiment(ws, { ...CREATE, control: 'enabled' });
            for (const platform of /** @type {const} */ ([
                'android',
                'ios',
                'macos',
                'windows',
            ])) {
                expect(webDetectionLoads(ws, platform, 'control'), platform).to.equal(true);
            }
            expect(webDetectionLoads(ws, 'ios', undefined)).to.equal(false);
        });

        it('applies a patch for one cohort, and refuses one that fails to apply', () => {
            const ws = workspace();
            const patchSettings = [
                { op: /** @type {const} */ ('add'), path: '/detectors/extra', value: {} },
            ];
            createExperiment(ws, {
                ...CREATE,
                enableFeatures: [],
                patches: [
                    { cohort: 'treatment', feature: 'webDetection', patchSettings },
                ],
            });
            const [
                change,
            ] = ws.parse('features/web-detection.json').settings.conditionalChanges;
            expect(change).to.deep.equal({
                condition: { experiment: { experimentName: 'contentScopeExperiment12', cohort: 'treatment' } },
                patchSettings,
            });

            const failing = [
                { op: /** @type {const} */ ('add'), path: '/missing/value', value: 1 },
            ];
            expect(() =>
                createExperiment(workspace(), {
                    ...CREATE,
                    enableFeatures: [],
                    patches: [
                        { cohort: 'treatment', feature: 'webDetection', patchSettings: failing },
                    ],
                }),
            ).to.throw('fails to apply');
        });

        it('warns about a patch that changes nothing', () => {
            const noOp = [
                { op: /** @type {const} */ ('replace'), path: '/missing', value: 1 },
            ];
            const { warnings } = createExperiment(workspace(), {
                ...CREATE,
                platforms: [
                    'android',
                ],
                enableFeatures: [],
                patches: [
                    { cohort: 'treatment', feature: 'webDetection', patchSettings: noOp },
                ],
            });
            expect(warnings).to.include('The webDetection patch for treatment changes nothing on android (android)');
        });
    });

    describe('rollout and disable', () => {
        it('appends a rollout step and refuses the same or a lower percent', () => {
            const ws = workspace();
            createExperiment(ws, CREATE);
            const options = { parent: 'contentScopeExperiments', slot: 'contentScopeExperiment12', allowDecrease: false };
            appendRolloutStep(ws, { ...options, percent: 25 });
            expect(
                ws.parse('overrides/ios-override.json').features.contentScopeExperiments.features.contentScopeExperiment12.rollout.steps,
            ).to.deep.equal([
                { percent: 10 },
                { percent: 25 },
            ]);
            expect(() => appendRolloutStep(ws, { ...options, percent: 25 })).to.throw('already at 25%');
            expect(() => appendRolloutStep(ws, { ...options, percent: 10 })).to.throw('--allow-decrease');
            expect(appendRolloutStep(ws, { ...options, percent: 10, allowDecrease: true })[0]).to.contain('only Android un-enrols');
            expect(() => appendRolloutStep(ws, { ...options, percent: 101 })).to.throw('at most 100');
        });

        it('refuses a slot without a rollout', () => {
            const ws = workspace();
            createExperiment(ws, { ...CREATE, rollout: undefined });
            expect(() =>
                appendRolloutStep(ws, {
                    parent: 'contentScopeExperiments',
                    slot: 'contentScopeExperiment12',
                    percent: 50,
                    allowDecrease: false,
                }),
            ).to.throw('already reaches every user');
        });

        it('refuses to edit a base location for only some of its platforms', () => {
            expect(() =>
                appendRolloutStep(workspace(), {
                    parent: 'subTest',
                    slot: 'baseSub',
                    percent: 50,
                    allowDecrease: false,
                    platforms: [
                        'android',
                    ],
                }),
            ).to.throw('include all of them');
            const ws = workspace();
            appendRolloutStep(ws, { parent: 'subTest', slot: 'baseSub', percent: 50, allowDecrease: false });
            expect(ws.parse('features/sub-test.json').features.baseSub.rollout.steps).to.deep.equal([
                { percent: 10 },
                { percent: 50 },
            ]);
        });

        it('disables the slot everywhere', () => {
            const ws = workspace();
            createExperiment(ws, CREATE);
            setSubfeatureState(ws, { parent: 'contentScopeExperiments', slot: 'contentScopeExperiment12', state: 'disabled' });
            for (const platform of [
                'android',
                'ios',
                'macos',
                'windows',
            ]) {
                expect(
                    ws.parse(`overrides/${platform}-override.json`).features.contentScopeExperiments.features.contentScopeExperiment12
                        .state,
                ).to.equal('disabled');
            }
        });
    });

    describe('status and remove', () => {
        it('reports each location and the conditional changes', () => {
            const ws = workspace();
            createExperiment(ws, CREATE);
            const status = experimentStatus(ws, 'contentScopeExperiments', 'contentScopeExperiment12');
            expect(status).to.contain('| ios | overrides/ios-override.json | enabled | 10% | control 50%, treatment 50% | 7.214.0 |');
            expect(status).to.contain('- webDetection in features/web-detection.json: 2');
        });

        it('finds the off block with the blocks that name the slot', () => {
            const off = {
                condition: [
                    { injectName: 'windows' },
                ],
                patchSettings: [
                    { op: 'add', path: '/additionalCheck', value: 'disabled' },
                ],
            };
            const named = { condition: { experiment: { experimentName: 'exp', cohort: 'treatment' } }, patchSettings: [] };
            const other = { condition: { injectName: 'android' }, patchSettings: [] };
            expect(
                experimentChangeIndices(
                    /** @type {any} */ ([
                        other,
                        off,
                        named,
                        named,
                    ]),
                    'exp',
                ),
            ).to.deep.equal([
                1,
                2,
                3,
            ]);
            expect(
                experimentChangeIndices(
                    /** @type {any} */ ([
                        off,
                        other,
                        named,
                    ]),
                    'exp',
                ),
            ).to.deep.equal([
                2,
            ]);
        });

        it('restores every file except the feature states it turned on', () => {
            const ws = workspace();
            createExperiment(ws, {
                ...CREATE,
                control: 'disabled',
                patches: [
                    { cohort: 'treatment', feature: 'webDetection', patchSettings: [] },
                ],
            });
            const lines = removeExperiment(ws, 'contentScopeExperiments', 'contentScopeExperiment12');
            expect(lines).to.include(
                'webDetection state: android enabled, ios enabled, macos enabled, windows enabled, extension disabled',
            );
            for (const [
                file,
                original,
            ] of Object.entries(FILES)) {
                const expected = /** @type {any} */ (parseJsonc(original, file));
                if (expected.features?.webDetection?.state === 'disabled') expected.features.webDetection.state = 'enabled';
                expect(ws.parse(file), file).to.deep.equal(expected);
            }
            expect(ws.read('features/web-detection.json')).to.contain('// Base web detection');
        });
    });
});
