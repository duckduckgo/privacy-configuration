import { expect } from 'chai';
import fs from 'fs';
import xpath from 'xpath';
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
 * Assert an XPath expression parses under the XPath 1.0 grammar.
 *
 * Only the grammar is checked. An expression that parses may still select nothing on
 * a real page, and browser engines may disagree at the edges of the spec.
 *
 * @param {unknown} expression
 * @param {string} path - used in error messages
 */
function assertValidXPath(expression, path) {
    expect(typeof expression, `${path}: expected a string, got ${JSON.stringify(expression)}`).to.equal('string');
    try {
        xpath.parse(/** @type {string} */ (expression));
    } catch (error) {
        expect.fail(`${path}: ${JSON.stringify(expression)} is not a valid XPath expression - ${error.message}`);
    }
}

/**
 * Compile a pattern source, throwing on a syntax error.
 *
 * @param {string} source
 * @returns {RegExp}
 */
function compilePattern(source) {
    return new RegExp(source, 'i');
}

/**
 * Assert every entry of a `pattern` value is a regular expression in its own right.
 *
 * Syntax is all that is checked, and only against this Node version.
 *
 * @param {unknown} pattern - a single pattern or an array of them
 * @param {string} path - used in error messages
 */
function assertValidPattern(pattern, path) {
    const patterns = Array.isArray(pattern)
        ? pattern
        : [
              pattern,
          ];
    for (const [
        index,
        entry,
    ] of patterns.entries()) {
        expect(typeof entry, `${path}[${index}]: expected a string, got ${JSON.stringify(entry)}`).to.equal('string');
        try {
            compilePattern(entry);
        } catch (error) {
            expect.fail(`${path}[${index}]: ${JSON.stringify(entry)} is not a valid regular expression - ${error.message}`);
        }
    }
}

/**
 * Assert the expressions of a single `text` leaf condition.
 *
 * @param {Record<string, any>} condition
 * @param {string} path - used in error messages
 */
function assertTextConditionExpressions(condition, path) {
    if (condition.pattern !== undefined) {
        assertValidPattern(condition.pattern, `${path}/pattern`);
    }
    const expressions = Array.isArray(condition.xpath)
        ? condition.xpath
        : [
              condition.xpath,
          ];
    for (const [
        index,
        expression,
    ] of expressions.entries()) {
        if (expression === undefined) continue;
        assertValidXPath(expression, `${path}/xpath[${index}]`);
    }
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

/** Patch paths that land on an `xpath` value, or on one entry of an `xpath` array. */
const XPATH_PATCH_PATH = /\/xpath(?:\/\d+)?$/;

/** Patch paths that land on a `pattern` value, or on one entry of a `pattern` array. */
const PATTERN_PATCH_PATH = /\/pattern(?:\/\d+)?$/;

/**
 * Validate a patch operation targeting an `xpath` or `pattern` value.
 *
 * Patches are applied client-side, so a value set only by a patch never appears as a
 * literal in the generated config and would otherwise go unchecked.
 *
 * @param {Record<string, any>} operation
 * @param {string} path - used in error messages
 */
function assertExpressionPatch(operation, path) {
    const operationPath = operation.path ?? '';
    if (operation.op === 'remove') return;

    if (XPATH_PATCH_PATH.test(operationPath)) {
        const values = Array.isArray(operation.value)
            ? operation.value
            : [
                  operation.value,
              ];
        for (const [
            index,
            expression,
        ] of values.entries()) {
            assertValidXPath(expression, `${path} ${operationPath}[${index}]`);
        }
    }

    if (PATTERN_PATCH_PATH.test(operationPath)) {
        assertValidPattern(operation.value, `${path} ${operationPath}`);
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
 * Invoke `cb` for every patch operation the feature can apply, from either the
 * per-domain or the conditional lists.
 *
 * @param {import('../schema/features/web-detection').WebDetectionFeature<number>} webDetection
 * @param {(operation: Record<string, any>, path: string) => void} cb
 */
function forEachPatchOperation(webDetection, cb) {
    const settings = /** @type {Record<string, any>} */ (webDetection.settings);
    for (const [
        index,
        entry,
    ] of (settings.domains ?? []).entries()) {
        for (const operation of entry.patchSettings ?? []) {
            cb(operation, `domains[${index}] (${entry.domain})`);
        }
    }
    for (const [
        index,
        entry,
    ] of (settings.conditionalChanges ?? []).entries()) {
        for (const operation of entry.patchSettings ?? []) {
            cb(operation, `conditionalChanges[${index}]`);
        }
    }
}

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
        // Features whose subfeatures may declare experiment metrics that consume events
        // (see tests/experiment-metrics-tests.js).
        const METRIC_PARENTS = [
            'contentScopeExperiments',
            'blockList',
            'contentBlocking',
        ];

        forEachWebDetectionConfig(({ configName, detectors }) => {
            describe(configName, () => {
                it('fireEvent.type values should have a corresponding eventHub parameter source or metric event', () => {
                    const config = latestConfigs.find((c) => c.name === configName);
                    const eventHubTelemetry = /** @type {import('../schema/features/event-hub').EventHubFeature<number> | undefined} */ (
                        config?.body.features?.eventHub
                    )?.settings.telemetry;
                    const knownConsumers = new Set();
                    for (const entry of Object.values(eventHubTelemetry ?? {})) {
                        for (const param of Object.values(entry.parameters)) {
                            if (param.source) knownConsumers.add(param.source);
                        }
                    }
                    for (const parent of METRIC_PARENTS) {
                        for (const subFeature of Object.values(config?.body.features?.[parent]?.features ?? {})) {
                            for (const metric of Object.values(subFeature?.settings?.metrics ?? {})) {
                                if (typeof metric?.event === 'string') knownConsumers.add(metric.event);
                            }
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
                            expect(knownConsumers.has(type)).to.equal(
                                true,
                                `Detector '${groupName}.${detectorName}' fires event type '${type}' but no eventHub parameter source or experiment metric event consumes '${type}' (known consumers: ${[
                                    ...knownConsumers,
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
                            forEachTextCondition(
                                detector.match,
                                `detectors.${groupName}.${detectorId}.match`,
                                assertTextConditionExpressions,
                            );
                        });
                    }
                }

                it('xpath and pattern patch operations are well formed', () => {
                    forEachPatchOperation(webDetection, assertExpressionPatch);
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

    describe('expression validation (self-test)', () => {
        /** @param {unknown} expression */
        const checkXPath = (expression) => () => assertValidXPath(expression, '$');

        /** @param {unknown} pattern */
        const checkPattern = (pattern) => () => assertValidPattern(pattern, '$');

        it('accepts XPath expressions of the shape detectors use', () => {
            expect(checkXPath('//div//text()')).to.not.throw();
            expect(checkXPath('//*[@class="banner"]//text()')).to.not.throw();
            expect(checkXPath('//div[contains(@id, "consent")]')).to.not.throw();
        });

        it('rejects malformed XPath expressions', () => {
            expect(checkXPath('//div[')).to.throw();
            expect(checkXPath('//div[@class="a"')).to.throw();
            expect(checkXPath('')).to.throw();
        });

        it('rejects a non-string XPath expression', () => {
            expect(checkXPath(42)).to.throw();
            expect(checkXPath(null)).to.throw();
        });

        it('accepts a single pattern and an array of them', () => {
            expect(checkPattern('foo')).to.not.throw();
            expect(
                checkPattern([
                    'foo',
                    'bar(baz)?',
                ]),
            ).to.not.throw();
        });

        it('rejects a malformed pattern', () => {
            expect(checkPattern('foo(')).to.throw();
            expect(checkPattern('[a-')).to.throw();
        });

        it('rejects entries that are only valid as a pair', () => {
            expect(
                checkPattern([
                    'a(',
                    'b)',
                ]),
            ).to.throw();
        });

        it('rejects a non-string pattern entry', () => {
            expect(
                checkPattern([
                    'foo',
                    7,
                ]),
            ).to.throw();
        });

        it('checks both keys of a text leaf', () => {
            expect(() => assertTextConditionExpressions({ pattern: 'foo', xpath: '//div//text()' }, '$')).to.not.throw();
            expect(() => assertTextConditionExpressions({ pattern: 'foo(', xpath: '//div//text()' }, '$')).to.throw();
            expect(() => assertTextConditionExpressions({ pattern: 'foo', xpath: '//div[' }, '$')).to.throw();
            expect(() => assertTextConditionExpressions({ pattern: 'foo' }, '$')).to.not.throw();
        });

        it('checks every entry of an xpath array', () => {
            expect(() =>
                assertTextConditionExpressions(
                    {
                        pattern: 'foo',
                        xpath: [
                            '//div//text()',
                            '//span[',
                        ],
                    },
                    '$',
                ),
            ).to.throw();
        });
    });

    describe('expression patch validation (self-test)', () => {
        /** @param {Record<string, any>} operation */
        const check = (operation) => () => assertExpressionPatch(operation, '$');

        it('checks a patched xpath value', () => {
            expect(check({ op: 'replace', path: '/detectors/g/d/match/text/xpath', value: '//div//text()' })).to.not.throw();
            expect(check({ op: 'replace', path: '/detectors/g/d/match/text/xpath', value: '//div[' })).to.throw();
        });

        it('checks every entry of a patched xpath array', () => {
            expect(
                check({
                    op: 'replace',
                    path: '/detectors/g/d/match/text/xpath',
                    value: [
                        '//div//text()',
                        '//span[',
                    ],
                }),
            ).to.throw();
        });

        it('checks a patched single xpath array entry', () => {
            expect(check({ op: 'replace', path: '/detectors/g/d/match/text/xpath/1', value: '//div[' })).to.throw();
        });

        it('checks a patched pattern value', () => {
            expect(check({ op: 'add', path: '/detectors/g/d/match/text/pattern', value: 'foo' })).to.not.throw();
            expect(check({ op: 'add', path: '/detectors/g/d/match/text/pattern', value: 'foo(' })).to.throw();
        });

        it('ignores removals and unrelated paths', () => {
            expect(check({ op: 'remove', path: '/detectors/g/d/match/text/xpath' })).to.not.throw();
            expect(check({ op: 'replace', path: '/detectors/g/d/state', value: 'disabled' })).to.not.throw();
        });

        it('does not mistake xpathConfig for an xpath value', () => {
            expect(check({ op: 'replace', path: '/detectors/g/d/match/text/xpathConfig', value: { chunkSize: 8192 } })).to.not.throw();
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
