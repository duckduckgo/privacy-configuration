import { expect } from 'chai';
import fs from 'fs';
import platforms from '../platforms.js';

const OPERATOR_KEYS = [
    'any',
    'all',
    'none',
];

// `comment` is a documentation-only modifier — counts toward the leaf-vs-modifier
// distinction but is not a condition tree itself, so we don't recurse into it.
const MODIFIER_KEYS = [
    ...OPERATOR_KEYS,
    'comment',
];

const MATCH_LEVEL_KEYS = [
    'text',
    'element',
];

/**
 * Recursively walk a condition node, asserting it contains either only modifier
 * keys (operators + comment) or only level-appropriate leaf keys (never both).
 *
 * Operator children stay at the same level (operators are level-preserving);
 * descending into a `text`/`element` key transitions the walk into a per-type
 * subtree where leaf fields like `pattern`/`selector` live (and don't need
 * further structural validation here).
 *
 * @param {unknown} node
 * @param {string} path - JSON path used in error messages
 */
function assertConditionNode(node, path) {
    if (Array.isArray(node)) {
        node.forEach((n, i) => assertConditionNode(n, `${path}[${i}]`));
        return;
    }
    if (node === null || typeof node !== 'object') return;

    const keys = Object.keys(node);
    const modKeys = keys.filter((k) => MODIFIER_KEYS.includes(k));
    const otherKeys = keys.filter((k) => !MODIFIER_KEYS.includes(k));

    expect(
        modKeys.length === 0 || otherKeys.length === 0,
        `${path}: condition node mixes modifier keys [${modKeys.join(', ')}] with non-modifier keys [${otherKeys.join(', ')}]`,
    ).to.equal(true);

    if (modKeys.length > 0) {
        for (const op of modKeys.filter((k) => OPERATOR_KEYS.includes(k))) {
            assertConditionNode(node[op], `${path}.${op}`);
        }
        return;
    }

    for (const childKey of MATCH_LEVEL_KEYS) {
        if (childKey in node) {
            assertConditionNode(node[childKey], `${path}.${childKey}`);
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

/**
 * Iterate every generated config that has a webDetection feature with detectors.
 *
 * @param {(ctx: {
 *   configName: string,
 *   webDetection: import('../schema/features/web-detection').WebDetectionFeature<number>,
 *   detectors: NonNullable<import('../schema/features/web-detection').WebDetectionSettings['detectors']>,
 * }) => void} cb
 */
function forEachWebDetectionConfig(cb) {
    for (const config of latestConfigs) {
        const webDetection = /** @type {import('../schema/features/web-detection').WebDetectionFeature<number> | undefined} */ (
            config.body.features?.webDetection
        );
        if (!webDetection?.settings?.detectors) continue;
        cb({ configName: config.name, webDetection, detectors: webDetection.settings.detectors });
    }
}

describe('webDetection config tests', () => {
    describe('match tree validation', () => {
        forEachWebDetectionConfig(({ configName, detectors }) => {
            describe(configName, () => {
                for (const [
                    groupName,
                    group,
                ] of Object.entries(detectors)) {
                    for (const [
                        detectorId,
                        detector,
                    ] of Object.entries(group)) {
                        it(`${groupName}.${detectorId} match tree has no mixed operator/leaf keys`, () => {
                            assertConditionNode(detector.match, `detectors.${groupName}.${detectorId}.match`);
                        });
                    }
                }
            });
        });

        it('exercises every generated config (sanity)', () => {
            expect(latestConfigs.length).to.be.greaterThan(0);
        });
    });

    describe('naming validation', () => {
        forEachWebDetectionConfig(({ configName, detectors }) => {
            describe(configName, () => {
                it('detector and group names should be named correctly', () => {
                    const detectorNameRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;
                    for (const [
                        groupName,
                        groupDetectors,
                    ] of Object.entries(detectors)) {
                        expect(groupName).to.match(detectorNameRegex);
                        for (const detectorName of Object.keys(groupDetectors)) {
                            expect(detectorName).to.match(detectorNameRegex);
                        }
                    }
                });
            });
        });
    });

    describe('eventHub cross-reference', () => {
        forEachWebDetectionConfig(({ configName, detectors }) => {
            describe(configName, () => {
                it('fireEvent.type values should have a corresponding eventHub parameter source', () => {
                    const config = latestConfigs.find((c) => c.name === configName);
                    const eventHubTelemetry = /** @type {import('../schema/features/event-hub').EventHubFeature<number> | undefined} */ (
                        config?.body.features?.eventHub
                    )?.settings.telemetry;
                    const knownSources = new Set();
                    for (const entry of Object.values(eventHubTelemetry ?? {})) {
                        for (const param of Object.values(entry.parameters)) {
                            if (param.source) knownSources.add(param.source);
                        }
                    }

                    for (const [
                        groupName,
                        groupDetectors,
                    ] of Object.entries(detectors)) {
                        for (const [
                            detectorName,
                            detector,
                        ] of Object.entries(groupDetectors)) {
                            const type = detector.actions?.fireEvent?.type;
                            if (type === undefined) continue;
                            expect(knownSources.has(type)).to.equal(
                                true,
                                `Detector '${groupName}.${detectorName}' fires event type '${type}' but no eventHub parameter has source '${type}' (known sources: ${[
                                    ...knownSources,
                                ].join(', ')})`,
                            );
                        }
                    }
                });
            });
        });
    });

    describe('assertConditionNode (self-test)', () => {
        it('passes a pure leaf node', () => {
            expect(() => assertConditionNode({ text: { pattern: 'foo' } }, '$')).to.not.throw();
        });

        it('passes a pure operator node', () => {
            expect(() =>
                assertConditionNode(
                    {
                        text: {
                            all: [
                                { pattern: 'foo' },
                                { pattern: 'bar' },
                            ],
                        },
                    },
                    '$',
                ),
            ).to.not.throw();
        });

        it('passes nested operators', () => {
            expect(() =>
                assertConditionNode(
                    {
                        text: {
                            all: [
                                {
                                    any: [
                                        { pattern: 'a' },
                                        { pattern: 'b' },
                                    ],
                                },
                                {
                                    none: [
                                        { pattern: 'c' },
                                    ],
                                },
                            ],
                        },
                    },
                    '$',
                ),
            ).to.not.throw();
        });

        it('rejects mixing operator and leaf keys at the per-type level', () => {
            expect(() =>
                assertConditionNode(
                    {
                        text: {
                            all: [
                                { pattern: 'foo' },
                            ],
                            pattern: 'bar',
                        },
                    },
                    '$',
                ),
            ).to.throw();
        });

        it('rejects mixing operator and leaf keys at the match level', () => {
            expect(() =>
                assertConditionNode(
                    {
                        all: [
                            { text: { pattern: 'foo' } },
                        ],
                        text: { pattern: 'bar' },
                    },
                    '$',
                ),
            ).to.throw();
        });

        it('rejects mixing nested in an array', () => {
            expect(() =>
                assertConditionNode(
                    {
                        text: [
                            { pattern: 'ok' },
                            {
                                all: [
                                    { pattern: 'foo' },
                                ],
                                pattern: 'bar',
                            },
                        ],
                    },
                    '$',
                ),
            ).to.throw();
        });

        it('allows comment alongside operator keys', () => {
            expect(() =>
                assertConditionNode(
                    {
                        text: {
                            comment: 'requires both foo and bar in the body',
                            all: [
                                { pattern: 'foo' },
                                { pattern: 'bar' },
                            ],
                        },
                    },
                    '$',
                ),
            ).to.not.throw();
        });

        it('allows comment as array of strings', () => {
            expect(() =>
                assertConditionNode(
                    {
                        text: {
                            comment: [
                                'line 1',
                                'line 2',
                            ],
                            any: [{ pattern: 'foo' }],
                        },
                    },
                    '$',
                ),
            ).to.not.throw();
        });

        it('allows comment as the only modifier (no-op block)', () => {
            expect(() => assertConditionNode({ text: { comment: 'documentation only' } }, '$')).to.not.throw();
        });

        it('rejects mixing comment with leaf fields', () => {
            expect(() =>
                assertConditionNode(
                    {
                        text: {
                            comment: 'docs',
                            pattern: 'foo',
                        },
                    },
                    '$',
                ),
            ).to.throw();
        });
    });
});
