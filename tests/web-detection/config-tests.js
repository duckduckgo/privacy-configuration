import { expect } from 'chai';
import { immutableJSONPatch } from 'immutable-json-patch';
import { ORDER_FREE_ACTION_KEYS, isPlainObject, sequenceWebDetectionActions } from '../../util.js';
import { TEMP_EVENT_TYPE_PREFIX, breakageDataErrors, clientViews, eventHubConsumers, fireEventTypes } from './clients.js';
import { detectorNameErrors, detectorViews, forEachWebDetectionConfig, latestConfigs, viewErrors } from './configs.js';
import { ACTION_KEYS, BRANCH_KEYS } from './validator/grammar.js';
import { validateDetector } from './validator/validate.js';
import { itemWalkWarnings, repeatedEventWarnings } from './validator/warnings.js';

/**
 * Print a warning that fails no test. In GitHub Actions it's a workflow annotation, which shows on the
 * PR's checks; GitHub reads annotations from stdout, with `%`, CR and LF escaped.
 *
 * @param {string} message
 */
function warn(message) {
    if (process.env.GITHUB_ACTIONS) {
        console.log(`::warning title=webDetection::${message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
    } else {
        console.warn(`warning: ${message}`);
    }
}

describe('webDetection config tests', () => {
    describe('detectors in every view a client can see', () => {
        /** @type {Array<{ name: string, check: (detector: Record<string, any>, path: string) => string[] }>} */
        const DETECTOR_CHECKS = [
            { name: 'is well formed', check: validateDetector },
            { name: 'a breakage report runs writes breakage data', check: breakageDataErrors },
        ];

        for (const config of latestConfigs) {
            const views = detectorViews(config);
            if (!views.length) continue;
            describe(config.name, () => {
                for (const { name, check } of DETECTOR_CHECKS) {
                    it(`every detector ${name}`, () => {
                        const errors = viewErrors(views, check);
                        expect(errors, errors.join('\n')).to.deep.equal([]);
                    });
                }

                it('applies every conditionalChanges entry a client matches', () => {
                    const failed = views.flatMap(({ label, failed }) =>
                        (failed ?? []).map((entry) => `${label}: ${JSON.stringify(entry)}`),
                    );
                    expect(failed, failed.join('\n')).to.deep.equal([]);
                });

                it('warns on events sent on every run', () => {
                    for (const warning of viewErrors(views, repeatedEventWarnings)) warn(`${config.name} ${warning}`);
                });

                it('warns on walks from each item that no `if` guards', () => {
                    for (const warning of viewErrors(views, itemWalkWarnings)) warn(`${config.name} ${warning}`);
                });
            });
        }

        it('checks detectors that domain patches and version-gated entries add (self-test)', () => {
            /** @param {string} type */
            const sending = (type) => ({ match: true, actions: { fireEvent: { type } } });
            const config = {
                name: 'v6/android-config.json',
                body: {
                    features: {
                        webDetection: {
                            settings: {
                                detectors: { g: { base: { match: true, actions: { breakageReportData: {} } } } },
                                domains: [
                                    {
                                        domain: 'example.com',
                                        patchSettings: [
                                            { op: 'add', path: '/detectors/g/onDomain', value: sending('a') },
                                        ],
                                    },
                                ],
                                conditionalChanges: [
                                    {
                                        condition: { injectName: 'android', minSupportedVersion: 1, maxSupportedVersion: 2 },
                                        patchSettings: [
                                            { op: 'add', path: '/detectors/g/gated', value: sending('b') },
                                        ],
                                    },
                                ],
                            },
                        },
                    },
                },
            };
            const errors = viewErrors(detectorViews(config), breakageDataErrors);
            expect(errors.map((error) => error.split(':').slice(0, 2).join(':'))).to.deep.equal([
                'domains[0] (example.com): detectors.g.onDomain',
                'conditionalChanges[0]: detectors.g.gated',
            ]);
        });

        it('exercises every generated config (sanity)', () => {
            expect(latestConfigs.filter((config) => detectorViews(config).length).length).to.be.greaterThan(0);
        });
    });

    describe('Apple action sequences', () => {
        /**
         * Every object in a body position holding several action keys, other than just `fireEvent` and
         * `breakageReportData`, or a `define` of several names.
         *
         * @param {unknown} body
         * @param {string} path
         * @returns {string[]}
         */
        const unsequenced = (body, path) => {
            /** @type {string[]} */
            const found = [];
            /**
             * @param {unknown} node
             * @param {string} nodePath
             * @param {boolean} inBody
             */
            const visit = (node, nodePath, inBody) => {
                if (Array.isArray(node)) {
                    node.forEach((entry, index) => visit(entry, `${nodePath}[${index}]`, inBody));
                    return;
                }
                if (!isPlainObject(node)) return;
                const actionKeys = Object.keys(node).filter((key) => ACTION_KEYS.includes(key));
                const orderFree = Object.keys(node).every((key) => ORDER_FREE_ACTION_KEYS.includes(key));
                if (
                    inBody &&
                    ((actionKeys.length > 1 && !orderFree) || (isPlainObject(node.define) && Object.keys(node.define).length > 1))
                )
                    found.push(nodePath);
                for (const [
                    key,
                    value,
                ] of Object.entries(node)) {
                    visit(value, `${nodePath}.${key}`, BRANCH_KEYS.includes(key));
                }
            };
            visit(body, path, true);
            return found;
        };

        for (const config of latestConfigs.filter(({ name }) => /^v\d+\/(ios|macos)-config\.json$/.test(name))) {
            it(`${config.name} holds every action of this release's detectors in its own sequence element`, () => {
                const detectors = config.body.features?.webDetection?.settings?.detectors ?? {};
                const found = Object.entries(detectors).flatMap(
                    ([
                        group,
                        entries,
                    ]) =>
                        Object.entries(/** @type {Record<string, any>} */ (entries)).flatMap(
                            ([
                                id,
                                detector,
                            ]) => unsequenced(detector.actions, `detectors.${group}.${id}.actions`),
                        ),
                );
                expect(found, found.join('\n')).to.deep.equal([]);
            });
        }

        it('rewrites several action keys and a define of several names into a sequence, and a patched sequence element into an `if` (self-test)', () => {
            const config = {
                features: {
                    webDetection: {
                        settings: {
                            detectors: {
                                g: {
                                    once: { match: true, actions: { fireEvent: { type: 'a' }, define: { b: 1 } } },
                                    list: {
                                        actions: [
                                            { define: { x: 1, y: { ref: 'x' } } },
                                            {
                                                if: true,
                                                then: { fireEvent: { type: 'b' }, define: { 'this.sent': true } },
                                                else: { breakageReportData: {} },
                                            },
                                        ],
                                    },
                                },
                            },
                            conditionalChanges: [
                                {
                                    condition: { injectName: 'apple' },
                                    patchSettings: [
                                        { op: 'add', path: '/detectors/g/added', value: { actions: { define: { a: 1, b: 2 } } } },
                                        {
                                            op: 'replace',
                                            path: '/detectors/g/list/actions',
                                            value: { breakageReportData: {}, fireEvent: { type: 'd' }, define: { c: 1 } },
                                        },
                                        {
                                            op: 'add',
                                            path: '/detectors/g/list/actions/1',
                                            value: { fireEvent: { type: 'e' }, define: { 'this.sent': true } },
                                        },
                                        { op: 'replace', path: '/detectors/g/list/actions/1/then/0', value: { define: { a: 1, b: 2 } } },
                                        { op: 'add', path: '/detectors/g/list/actions/-', value: { fireEvent: { type: 'f' } } },
                                    ],
                                },
                            ],
                        },
                    },
                },
            };
            sequenceWebDetectionActions(config);
            const settings = config.features.webDetection.settings;
            expect(settings.detectors.g.once.actions).to.deep.equal([
                { fireEvent: { type: 'a' } },
                { define: { b: 1 } },
            ]);
            expect(settings.detectors.g.list.actions).to.deep.equal([
                {
                    if: true,
                    then: [
                        { define: { x: 1 } },
                        { define: { y: { ref: 'x' } } },
                    ],
                },
                {
                    if: true,
                    then: [
                        { fireEvent: { type: 'b' } },
                        { define: { 'this.sent': true } },
                    ],
                    else: { breakageReportData: {} },
                },
            ]);
            expect(settings.conditionalChanges[0].patchSettings[0].value).to.deep.equal({
                actions: [
                    { define: { a: 1 } },
                    { define: { b: 2 } },
                ],
            });
            expect(settings.conditionalChanges[0].patchSettings[1].value).to.deep.equal([
                { breakageReportData: {} },
                { fireEvent: { type: 'd' } },
                { define: { c: 1 } },
            ]);
            // A sequence element holds no nested sequence, so several actions take an always-taken `if`
            expect(settings.conditionalChanges[0].patchSettings[2].value).to.deep.equal({
                if: true,
                then: [
                    { fireEvent: { type: 'e' } },
                    { define: { 'this.sent': true } },
                ],
            });
            expect(settings.conditionalChanges[0].patchSettings[3].value).to.deep.equal({
                if: true,
                then: [
                    { define: { a: 1 } },
                    { define: { b: 2 } },
                ],
            });
            expect(settings.conditionalChanges[0].patchSettings[4].value).to.deep.equal({ fireEvent: { type: 'f' } });
        });

        it('keeps each authored sequence element one element, so patch indices address the same action (self-test)', () => {
            const detector = {
                actions: [
                    { define: { a: 1, b: 2 } },
                    { fireEvent: { type: 'x' } },
                ],
            };
            const defines = {
                if: true,
                then: [
                    { define: { a: 1 } },
                    { define: { b: 2 } },
                ],
            };
            const cases = [
                {
                    operation: { op: 'replace', path: '/detectors/g/d/actions/1', value: { fireEvent: { type: 'y' } } },
                    actions: [
                        defines,
                        { fireEvent: { type: 'y' } },
                    ],
                },
                {
                    operation: { op: 'remove', path: '/detectors/g/d/actions/1' },
                    actions: [
                        defines,
                    ],
                },
                {
                    operation: { op: 'replace', path: '/detectors/g/d/actions/1/fireEvent/type', value: 'z' },
                    actions: [
                        defines,
                        { fireEvent: { type: 'z' } },
                    ],
                },
            ];
            for (const { operation, actions } of cases) {
                const config = {
                    features: {
                        webDetection: {
                            settings: {
                                detectors: { g: { d: structuredClone(detector) } },
                                conditionalChanges: [
                                    {
                                        condition: { injectName: 'apple-isolated' },
                                        patchSettings: [
                                            operation,
                                        ],
                                    },
                                ],
                            },
                        },
                    },
                };
                sequenceWebDetectionActions(config);
                const settings = config.features.webDetection.settings;
                const patched = /** @type {Record<string, any>} */ (
                    immutableJSONPatch(settings, settings.conditionalChanges[0].patchSettings)
                );
                expect(patched.detectors.g.d.actions, operation.op).to.deep.equal(actions);
            }
        });

        it('leaves an object of only fireEvent and breakageReportData as one object (self-test)', () => {
            const config = {
                features: {
                    webDetection: {
                        settings: {
                            detectors: {
                                g: {
                                    both: { match: true, actions: { fireEvent: { type: 'a' }, breakageReportData: {} } },
                                    branch: {
                                        actions: {
                                            if: true,
                                            then: { breakageReportData: {}, fireEvent: { type: 'b' } },
                                            else: false,
                                        },
                                    },
                                },
                            },
                            conditionalChanges: [
                                {
                                    condition: { injectName: 'apple-isolated' },
                                    patchSettings: [
                                        {
                                            op: 'replace',
                                            path: '/detectors/g/both/actions',
                                            value: { breakageReportData: {}, fireEvent: { type: 'c' } },
                                        },
                                        {
                                            op: 'add',
                                            path: '/detectors/g/both/actions/-',
                                            value: { fireEvent: { type: 'd' }, breakageReportData: {} },
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                },
            };
            sequenceWebDetectionActions(config);
            const settings = config.features.webDetection.settings;
            expect(settings.detectors.g.both.actions).to.deep.equal({ fireEvent: { type: 'a' }, breakageReportData: {} });
            expect(settings.detectors.g.branch.actions.then).to.deep.equal({ breakageReportData: {}, fireEvent: { type: 'b' } });
            expect(settings.conditionalChanges[0].patchSettings[0].value).to.deep.equal({
                breakageReportData: {},
                fireEvent: { type: 'c' },
            });
            expect(settings.conditionalChanges[0].patchSettings[1].value).to.deep.equal({
                fireEvent: { type: 'd' },
                breakageReportData: {},
            });
        });

        // The last iOS and macOS releases carrying C-S-S before 19.0.0, which read `fireEvent` and
        // `breakageReportData` from an `actions` object only. iOS 7.246.0 and macOS 1.216.0 carry 20.5.0.
        //
        // Remove once Apple's webDetection minSupportedVersion is above these.
        const PRE_EXPRESSION_APPLE_VERSIONS = {
            ios: '7.245.0',
            macos: '1.215.0',
        };

        for (const config of latestConfigs.filter(({ name }) => /^v\d+\/(ios|macos)-config\.json$/.test(name))) {
            const platform = config.name.includes('ios') ? 'ios' : 'macos';
            const version = PRE_EXPRESSION_APPLE_VERSIONS[platform];
            it(`${config.name} gives apple-isolated ${version} every enabled detector's actions as an object`, () => {
                const detectors = [
                    false,
                    true,
                ]
                    .flatMap((assumeUndecided) => clientViews(config.body, platform, version, assumeUndecided))
                    .filter(({ injectName }) => injectName === 'apple-isolated')
                    .flatMap((view) => Object.entries(view.detectors));
                /** @type {string[]} */
                const wrong = [];
                for (const [
                    groupName,
                    group,
                ] of detectors) {
                    for (const [
                        detectorId,
                        detector,
                    ] of Object.entries(group)) {
                        if (detector.state === 'disabled' || detector.actions === undefined) continue;
                        if (
                            !isPlainObject(detector.actions) ||
                            Object.keys(detector.actions).some((key) => !ORDER_FREE_ACTION_KEYS.includes(key))
                        )
                            wrong.push(`detectors.${groupName}.${detectorId}`);
                    }
                }
                expect(wrong, wrong.join('\n')).to.deep.equal([]);
            });
        }
    });

    describe('naming validation', () => {
        forEachWebDetectionConfig(({ configName, webDetection }) => {
            describe(configName, () => {
                it('detector and group names should be named correctly, including those patches add', () => {
                    const errors = detectorNameErrors(webDetection);
                    expect(errors, errors.join('\n')).to.deep.equal([]);
                });
            });
        });

        it('checks the names of detectors and groups that patches add (self-test)', () => {
            const webDetection = /** @type {any} */ ({
                state: 'enabled',
                exceptions: [],
                settings: {
                    detectors: { good: { ok: { match: true } } },
                    domains: [
                        {
                            domain: 'example.com',
                            patchSettings: [
                                { op: 'add', path: '/detectors/bad-group', value: { ok: { match: true } } },
                            ],
                        },
                    ],
                    conditionalChanges: [
                        {
                            condition: { injectName: 'android' },
                            patchSettings: [
                                { op: 'add', path: '/detectors/good/bad-name', value: { match: true } },
                            ],
                        },
                    ],
                },
            });
            expect(detectorNameErrors(webDetection)).to.deep.equal([
                'domains[0] (example.com) detectors.bad-group.ok: group name "bad-group" does not match /^[a-zA-Z][a-zA-Z0-9_]*$/',
                'conditionalChanges[0] detectors.good.bad-name: detector name "good.bad-name" does not match /^[a-zA-Z][a-zA-Z0-9_]*$/',
            ]);
        });
    });

    describe('eventHub cross-reference', () => {
        forEachWebDetectionConfig(({ configName, detectors }) => {
            describe(configName, () => {
                it('custom fireEvent.type values do not use the reserved detectorPerf prefix', () => {
                    for (const [
                        groupName,
                        groupDetectors,
                    ] of Object.entries(detectors)) {
                        for (const [
                            detectorName,
                            detector,
                        ] of Object.entries(groupDetectors)) {
                            for (const type of fireEventTypes(detector)) {
                                expect(type.startsWith('detectorPerf_')).to.equal(
                                    false,
                                    `Detector '${groupName}.${detectorName}' uses reserved event type '${type}'; ` +
                                        `the detectorPerf_ namespace is generated by C-S-S detector performance monitoring`,
                                );
                            }
                        }
                    }
                });

                it('fireEvent.type values should have a corresponding eventHub consumer or metric event', () => {
                    const knownConsumers = eventHubConsumers(latestConfigs.find((c) => c.name === configName)?.body);
                    /**
                     * @param {Record<string, any>} detector
                     * @param {string} detectorPath
                     */
                    const check = (detector, detectorPath) => {
                        for (const type of fireEventTypes(detector)) {
                            if (type.startsWith(TEMP_EVENT_TYPE_PREFIX)) continue;
                            expect(knownConsumers.has(type)).to.equal(
                                true,
                                `Detector '${detectorPath}' fires event type '${type}' but no eventHub parameter source, immediate trigger source or experiment metric event consumes '${type}' (known consumers: ${[
                                    ...knownConsumers,
                                ].join(', ')})`,
                            );
                        }
                    };
                    for (const [
                        groupName,
                        groupDetectors,
                    ] of Object.entries(detectors)) {
                        for (const [
                            detectorName,
                            detector,
                        ] of Object.entries(groupDetectors)) {
                            check(detector, `${groupName}.${detectorName}`);
                        }
                    }
                });
            });
        });

        it('counts the trigger source of an immediate_v2 entry as a consumer (self-test)', () => {
            const consumers = eventHubConsumers({
                features: {
                    eventHub: {
                        settings: {
                            telemetry: {
                                webTelemetry_example_immediate: {
                                    state: 'disabled',
                                    trigger: { type: 'immediate_v2', source: 'exampleEvent' },
                                    parameters: { value: { template: 'data', dataKey: 'value' } },
                                },
                                webTelemetry_counted_day: {
                                    state: 'enabled',
                                    trigger: { period: { seconds: 86400 } },
                                    parameters: { count: { template: 'counter', source: 'countedEvent', buckets: { '0+': { gte: 0 } } } },
                                },
                            },
                        },
                    },
                },
            });
            expect(
                [
                    ...consumers,
                ].sort(),
            ).to.deep.equal([
                'countedEvent',
                'exampleEvent',
            ]);
        });
    });
});
