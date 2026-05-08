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

const platformOutput = platforms.map((p) => p.replace('browsers/', 'extension-'));

const generatedConfigs = platformOutput
    .map((plat) => {
        const filePath = `./generated/v5/${plat}-config.json`;
        if (!fs.existsSync(filePath)) return null;
        return {
            name: `v5/${plat}-config.json`,
            body: JSON.parse(fs.readFileSync(filePath, 'utf-8')),
        };
    })
    .filter((c) => c !== null);

describe('webDetection match tree validation', () => {
    for (const config of generatedConfigs) {
        const wd = config.body.features?.webDetection;
        if (!wd?.settings?.detectors) continue;

        describe(config.name, () => {
            for (const [
                groupName,
                group,
            ] of Object.entries(wd.settings.detectors)) {
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
    }

    it('exercises every generated config (sanity)', () => {
        expect(generatedConfigs.length).to.be.greaterThan(0);
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
