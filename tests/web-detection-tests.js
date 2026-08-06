import { expect } from 'chai';
import fs from 'fs';
import platforms from '../platforms.js';

const OPERATOR_KEYS = [
    'any',
    'all',
    'none',
];

const MATCH_LEVEL_KEYS = [
    'text',
    'element',
];

/**
 * Recursively walk a condition node, asserting it contains either only operator
 * keys or only level-appropriate leaf keys (never both).
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
    const opKeys = keys.filter((k) => OPERATOR_KEYS.includes(k));
    const otherKeys = keys.filter((k) => !OPERATOR_KEYS.includes(k));

    expect(
        opKeys.length === 0 || otherKeys.length === 0,
        `${path}: condition node mixes operator keys [${opKeys.join(', ')}] with non-operator keys [${otherKeys.join(', ')}]`,
    ).to.equal(true);

    if (opKeys.length > 0) {
        for (const op of opKeys) {
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

/** Floor for a non-zero chunkSize. Smaller chunks multiply regex tests for little gain. */
const MIN_CHUNK_SIZE = 1024;

/**
 * Upper bound on chunkTail as a fraction of chunkSize. A tail is re-scanned by the
 * following test, so this caps the scanning overhead a config can impose at 1.25x.
 */
const MAX_TAIL_RATIO = 4;

/**
 * Assert an `xpathConfig` block holds sensible values.
 *
 * Clients use these values as configured, so this is the only place they are
 * checked - a bad value fails the build here naming the detector.
 *
 * The chunkSize/chunkTail ratio is only checked when both are present in the same
 * block. Judging a lone chunkTail would mean hardcoding the client's default
 * chunkSize here, which would silently go stale if that default ever changed.
 *
 * @param {Record<string, unknown>} xpathConfig
 * @param {string} path - used in error messages
 */
function assertXPathConfig(xpathConfig, path) {
    const { chunkSize, chunkTail } = xpathConfig;

    for (const [
        key,
        value,
    ] of Object.entries({ chunkSize, chunkTail })) {
        if (value === undefined) continue;
        expect(
            Number.isInteger(value) && Number(value) >= 0,
            `${path}/${key}: expected a non-negative integer, got ${JSON.stringify(value)}`,
        ).to.equal(true);
    }

    if (chunkSize !== undefined) {
        expect(
            chunkSize === 0 || Number(chunkSize) >= MIN_CHUNK_SIZE,
            `${path}/chunkSize: expected 0 (chunking disabled) or at least ${MIN_CHUNK_SIZE}, got ${chunkSize}`,
        ).to.equal(true);
    }

    // A chunkSize of 0 disables chunking, leaving the tail unused
    if (chunkTail === undefined || chunkSize === undefined || chunkSize === 0) return;
    const maxTail = Number(chunkSize) / MAX_TAIL_RATIO;
    expect(
        Number(chunkTail) <= maxTail,
        `${path}/chunkTail: expected at most chunkSize / ${MAX_TAIL_RATIO} (${maxTail}), got ${chunkTail}`,
    ).to.equal(true);
}

/**
 * Invoke `cb` for every leaf of a `text` condition branch, descending through
 * operator blocks and arrays.
 *
 * @param {unknown} node
 * @param {string} path
 * @param {(condition: Record<string, any>, path: string) => void} cb
 */
function forEachTextLeaf(node, path, cb) {
    if (Array.isArray(node)) {
        node.forEach((n, i) => forEachTextLeaf(n, `${path}[${i}]`, cb));
        return;
    }
    if (node === null || typeof node !== 'object') return;

    const opKeys = OPERATOR_KEYS.filter((k) => k in node);
    if (opKeys.length > 0) {
        for (const op of opKeys) {
            forEachTextLeaf(node[op], `${path}.${op}`, cb);
        }
        return;
    }
    cb(node, path);
}

/**
 * Invoke `cb` for every `text` leaf condition reachable from a match tree.
 *
 * @param {unknown} node
 * @param {string} path
 * @param {(condition: Record<string, any>, path: string) => void} cb
 */
function forEachTextCondition(node, path, cb) {
    if (Array.isArray(node)) {
        node.forEach((n, i) => forEachTextCondition(n, `${path}[${i}]`, cb));
        return;
    }
    if (node === null || typeof node !== 'object') return;

    for (const op of OPERATOR_KEYS) {
        if (op in node) forEachTextCondition(node[op], `${path}.${op}`, cb);
    }
    if ('text' in node) forEachTextLeaf(node.text, `${path}.text`, cb);
}

/** Patch paths that land on an `xpathConfig` block or one of its values. */
const XPATH_CONFIG_PATCH_PATH = /\/xpathConfig(?:\/(chunkSize|chunkTail))?$/;

/**
 * Validate a patch operation targeting `xpathConfig`.
 *
 * Patches are applied client-side, so a value set only by a patch never appears as a
 * literal in the generated config and would otherwise go unchecked.
 *
 * @param {Record<string, any>} operation
 * @param {string} path
 */
function assertXPathConfigPatch(operation, path) {
    const match = XPATH_CONFIG_PATCH_PATH.exec(operation.path ?? '');
    if (!match || operation.op === 'remove') return;

    const key = match[1];
    if (key === undefined) {
        expect(
            operation.value !== null && typeof operation.value === 'object' && !Array.isArray(operation.value),
            `${path}: patch of ${operation.path} expected an object value, got ${JSON.stringify(operation.value)}`,
        ).to.equal(true);
        assertXPathConfig(operation.value, `${path} ${operation.path}`);
        return;
    }

    // Only one value is being set, so it is checked in isolation
    assertXPathConfig({ [key]: operation.value }, `${path} ${operation.path}`);
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
                            forEachTextCondition(detector.match, `detectors.${groupName}.${detectorId}.match`, (condition, path) => {
                                if (condition.xpathConfig !== undefined) {
                                    assertXPathConfig(condition.xpathConfig, `${path}/xpathConfig`);
                                }
                            });
                        });
                    }
                }

                it('xpathConfig patch operations are within sensible bounds', () => {
                    const settings = /** @type {Record<string, any>} */ (webDetection.settings);
                    for (const [
                        index,
                        entry,
                    ] of (settings.domains ?? []).entries()) {
                        for (const operation of entry.patchSettings ?? []) {
                            assertXPathConfigPatch(operation, `domains[${index}] (${entry.domain})`);
                        }
                    }
                    for (const [
                        index,
                        entry,
                    ] of (settings.conditionalChanges ?? []).entries()) {
                        for (const operation of entry.patchSettings ?? []) {
                            assertXPathConfigPatch(operation, `conditionalChanges[${index}]`);
                        }
                    }
                });
            });
        });
    });

    describe('forEachTextCondition (self-test)', () => {
        /**
         * @param {unknown} match
         * @returns {string[]}
         */
        function collect(match) {
            /** @type {string[]} */
            const found = [];
            forEachTextCondition(match, '$', (condition) => found.push(String(condition.pattern)));
            return found;
        }

        it('reaches a plain text leaf', () => {
            expect(collect({ text: { pattern: 'a' } })).to.deep.equal([
                'a',
            ]);
        });

        it('reaches leaves through operator blocks at both levels', () => {
            const match = {
                all: [
                    {
                        text: {
                            any: [
                                { pattern: 'a' },
                                { pattern: 'b' },
                            ],
                        },
                    },
                    {
                        text: {
                            none: [
                                { pattern: 'c' },
                            ],
                        },
                    },
                ],
            };
            expect(collect(match)).to.deep.equal([
                'a',
                'b',
                'c',
            ]);
        });

        it('reaches leaves through arrays', () => {
            const match = [
                {
                    text: [
                        { pattern: 'a' },
                        { pattern: 'b' },
                    ],
                },
                { element: { selector: '.x' } },
            ];
            expect(collect(match)).to.deep.equal([
                'a',
                'b',
            ]);
        });

        it('ignores element conditions', () => {
            expect(collect({ element: { selector: '.x' } })).to.deep.equal([]);
        });

        it('finds the text conditions in the real configs (sanity)', () => {
            /** @type {string[]} */
            const found = [];
            forEachWebDetectionConfig(({ detectors }) => {
                for (const group of Object.values(detectors)) {
                    for (const detector of Object.values(group)) {
                        forEachTextCondition(detector.match, '$', (condition) => found.push(String(condition.pattern)));
                    }
                }
            });
            expect(found.length).to.be.greaterThan(0);
        });
    });

    describe('xpathConfig validation (self-test)', () => {
        /**
         * @param {Record<string, unknown>} xpathConfig
         */
        const check = (xpathConfig) => () => assertXPathConfig(xpathConfig, '$');

        it('accepts an in-bounds config', () => {
            expect(check({ chunkSize: 8192, chunkTail: 512 })).to.not.throw();
        });

        it('accepts chunkSize 0, which disables chunking', () => {
            expect(check({ chunkSize: 0 })).to.not.throw();
            // The tail is unused once chunking is off, so the ratio does not apply
            expect(check({ chunkSize: 0, chunkTail: 99999 })).to.not.throw();
        });

        it('accepts chunkTail 0', () => {
            expect(check({ chunkSize: 8192, chunkTail: 0 })).to.not.throw();
        });

        it('rejects non-integer and negative values', () => {
            expect(check({ chunkSize: 8192.5 })).to.throw();
            expect(check({ chunkSize: -1 })).to.throw();
            expect(check({ chunkTail: '512' })).to.throw();
        });

        it('rejects a non-zero chunkSize below the floor', () => {
            expect(check({ chunkSize: 32 })).to.throw();
        });

        it('rejects a chunkTail above a quarter of chunkSize', () => {
            expect(check({ chunkSize: 8192, chunkTail: 2049 })).to.throw();
            expect(check({ chunkSize: 8192, chunkTail: 2048 })).to.not.throw();
        });

        it('checks a lone chunkTail in isolation, since the ratio needs a chunkSize', () => {
            expect(check({ chunkTail: 99999 })).to.not.throw();
            expect(check({ chunkTail: -1 })).to.throw();
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
    });
});
