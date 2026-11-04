import { expect } from 'chai';
import { buildTables } from '../../scripts/generate-element-property-tables.mjs';
import { sequenceWebDetectionActions } from '../../util.js';
import {
    CLIENT_RELEASES,
    TEMP_EVENT_TYPE_PREFIX,
    clientDetectors,
    eventHubConsumers,
    fireEventTypes,
    runsOnBreakageReport,
    writesBreakageData,
} from './clients.js';
import { forEachPatchOperation, forEachPatchedDetector, forEachWebDetectionConfig, latestConfigs } from './configs.js';
import { ACTION_KEYS, BRANCH_KEYS, EXPRESSION_KEYS, NAME_PATTERN, PROPERTY_TABLES } from './validator/grammar.js';
import { interfaceProperties, selectorInterfaces } from './validator/types.js';
import { assertValidDetector, validateDetector } from './validator/validate.js';
import { forEachDetectorTextCondition, isPlainObject } from './validator/walk.js';
import { itemWalkWarnings, repeatedEventWarnings } from './validator/warnings.js';
import { assertExpressionPatch, assertTextConditionExpressions, assertXPathConfig, assertXPathConfigPatch } from './validator/xpath.js';

describe('webDetection config tests', () => {
    describe('match tree validation', () => {
        forEachWebDetectionConfig(({ configName, webDetection, detectors }) => {
            describe(configName, () => {
                for (const [
                    groupName,
                    group,
                ] of Object.entries(detectors)) {
                    for (const [
                        detectorId,
                        detector,
                    ] of Object.entries(group)) {
                        it(`${groupName}.${detectorId} match tree and payloads are well formed`, () => {
                            assertValidDetector(detector, `detectors.${groupName}.${detectorId}`);
                        });
                    }
                }

                it('detectors as patch operations leave them are well formed', () => {
                    forEachPatchedDetector(webDetection, (detector, path) => {
                        assertValidDetector(detector, path);
                        forEachDetectorTextCondition(detector, path, assertTextConditionExpressions);
                        forEachDetectorTextCondition(detector, path, (condition, conditionPath) => {
                            if (condition.xpathConfig !== undefined)
                                assertXPathConfig(condition.xpathConfig, `${conditionPath}/xpathConfig`);
                        });
                    });
                });
            });
        });

        it('exercises every generated config (sanity)', () => {
            expect(latestConfigs.length).to.be.greaterThan(0);
        });
    });

    describe('client views', () => {
        for (const config of latestConfigs) {
            const settings = config.body.features?.webDetection?.settings;
            const clients = CLIENT_RELEASES.find((entry) => entry.configs.test(config.name));
            if (!settings?.detectors || !clients) continue;
            describe(config.name, () => {
                it(`at ${clients.version}, every detector parses once conditionalChanges apply`, () => {
                    /** @type {string[]} */
                    const errors = [];
                    for (const others of [
                        true,
                        false,
                    ]) {
                        const detectors = clientDetectors(settings, clients.injectNames, clients.version, others);
                        for (const [
                            groupName,
                            group,
                        ] of Object.entries(detectors)) {
                            for (const [
                                detectorId,
                                detector,
                            ] of Object.entries(group)) {
                                errors.push(...validateDetector(detector, `detectors.${groupName}.${detectorId}`));
                            }
                        }
                    }
                    const unique = [
                        ...new Set(errors),
                    ];
                    expect(unique, unique.join('\n')).to.deep.equal([]);
                });

                it(`at ${clients.version}, every detector a breakage report runs writes breakage data`, () => {
                    /** @type {string[]} */
                    const errors = [];
                    for (const others of [
                        true,
                        false,
                    ]) {
                        const detectors = clientDetectors(settings, clients.injectNames, clients.version, others);
                        for (const [
                            groupName,
                            group,
                        ] of Object.entries(detectors)) {
                            for (const [
                                detectorId,
                                detector,
                            ] of Object.entries(group)) {
                                if (!runsOnBreakageReport(detector) || writesBreakageData(detector)) continue;
                                errors.push(
                                    `detectors.${groupName}.${detectorId}: runs when a breakage report is made, since the \`breakageReport\` trigger is on unless set to "disabled" (on by default), but no \`breakageReportData\` action writes to its breakage entry; add one, or set \`triggers.breakageReport.state\` to "disabled"`,
                                );
                            }
                        }
                    }
                    const unique = [
                        ...new Set(errors),
                    ];
                    expect(unique, unique.join('\n')).to.deep.equal([]);
                });

                it('warns on events sent on every run', () => {
                    const detectors = clientDetectors(settings, clients.injectNames, clients.version, true);
                    for (const [
                        groupName,
                        group,
                    ] of Object.entries(detectors)) {
                        for (const [
                            detectorId,
                            detector,
                        ] of Object.entries(group)) {
                            for (const warning of repeatedEventWarnings(detector, `${config.name} detectors.${groupName}.${detectorId}`)) {
                                console.warn(`warning: ${warning}`);
                            }
                        }
                    }
                });

                it('warns on walks from each item that no `if` guards', () => {
                    const detectors = clientDetectors(settings, clients.injectNames, clients.version, true);
                    for (const [
                        groupName,
                        group,
                    ] of Object.entries(detectors)) {
                        for (const [
                            detectorId,
                            detector,
                        ] of Object.entries(group)) {
                            for (const warning of itemWalkWarnings(detector, `${config.name} detectors.${groupName}.${detectorId}`)) {
                                console.warn(`warning: ${warning}`);
                            }
                        }
                    }
                });
            });
        }
    });

    describe('Apple action sequences', () => {
        /**
         * Every object in a body position holding several action keys, or a `define` of several names.
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
                if (inBody && (actionKeys.length > 1 || (isPlainObject(node.define) && Object.keys(node.define).length > 1)))
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
                                            value: { breakageReportData: {}, fireEvent: { type: 'd' } },
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
                { define: { x: 1 } },
                { define: { y: { ref: 'x' } } },
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
    });

    describe('naming validation', () => {
        forEachWebDetectionConfig(({ configName, detectors }) => {
            describe(configName, () => {
                it('detector and group names should be named correctly', () => {
                    for (const [
                        groupName,
                        groupDetectors,
                    ] of Object.entries(detectors)) {
                        expect(groupName).to.match(NAME_PATTERN);
                        for (const detectorName of Object.keys(groupDetectors)) {
                            expect(detectorName).to.match(NAME_PATTERN);
                        }
                    }
                });
            });
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

    describe('xpathConfig validation', () => {
        forEachWebDetectionConfig(({ configName, webDetection, detectors }) => {
            describe(configName, () => {
                for (const [
                    groupName,
                    group,
                ] of Object.entries(detectors)) {
                    for (const [
                        detectorId,
                        detector,
                    ] of Object.entries(group)) {
                        it(`${groupName}.${detectorId} xpathConfig values are within sensible bounds`, () => {
                            forEachDetectorTextCondition(detector, `detectors.${groupName}.${detectorId}`, (condition, path) => {
                                if (condition.xpathConfig !== undefined) {
                                    assertXPathConfig(condition.xpathConfig, `${path}/xpathConfig`);
                                }
                            });
                        });
                    }
                }

                it('xpathConfig patch operations are within sensible bounds', () => {
                    forEachPatchOperation(webDetection, assertXPathConfigPatch);
                });
            });
        });
    });

    describe('expression validation', () => {
        forEachWebDetectionConfig(({ configName, webDetection, detectors }) => {
            describe(configName, () => {
                for (const [
                    groupName,
                    group,
                ] of Object.entries(detectors)) {
                    for (const [
                        detectorId,
                        detector,
                    ] of Object.entries(group)) {
                        it(`${groupName}.${detectorId} xpath and pattern values are well formed`, () => {
                            forEachDetectorTextCondition(detector, `detectors.${groupName}.${detectorId}`, assertTextConditionExpressions);
                        });
                    }
                }

                it('xpath and pattern patch operations are well formed', () => {
                    forEachPatchOperation(webDetection, assertExpressionPatch);
                });
            });
        });
    });

    describe('element property tables', () => {
        it('match what the generator builds from the installed @webref packages', async function () {
            this.timeout(60000);
            expect(await buildTables()).to.deep.equal(
                PROPERTY_TABLES,
                'tests/data/element-property-tables.json is stale: run npm run generate-element-property-tables',
            );
        });

        it('carry the types the load-state recipes read', () => {
            expect(interfaceProperties('HTMLImageElement').get('naturalWidth')).to.equal('unsigned long');
            expect(interfaceProperties('HTMLImageElement').get('currentSrc')).to.equal('USVString');
            expect(interfaceProperties('HTMLLinkElement').get('sheet')).to.equal('CSSStyleSheet?');
            // Inherited from Element and Node
            expect(interfaceProperties('HTMLImageElement').get('tagName')).to.equal('DOMString');
            expect(interfaceProperties('HTMLImageElement').get('isConnected')).to.equal('boolean');
            // `unrestricted` is kept
            expect(interfaceProperties('HTMLMediaElement').get('duration')).to.equal('unrestricted double');
        });

        it('map tags to their interfaces, in every namespace', () => {
            expect(selectorInterfaces('img')).to.deep.equal([
                'HTMLImageElement',
            ]);
            expect(selectorInterfaces('a').sort()).to.deep.equal([
                'HTMLAnchorElement',
                'MathMLElement',
                'SVGAElement',
            ]);
            expect(selectorInterfaces('svg')).to.deep.equal([
                'SVGSVGElement',
            ]);
        });

        it('list the properties named like a reserved key, which config reads through the long form', () => {
            for (const entry of PROPERTY_TABLES.reservedNameProperties) {
                const property = entry.split('.').pop();
                expect(EXPRESSION_KEYS.concat('field', 'is')).to.include(property);
            }
        });
    });
});
