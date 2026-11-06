import { expect } from 'chai';
import { analyzePatchesForApproval, generateChangeSummary, getScopedDomains, indexDomainPatches } from '../automation-utils.js';

describe('Auto-approval logic tests', () => {
    const testCases = [
        {
            name: 'Element hiding domains only - should approve',
            patches: [
                { op: 'add', path: '/features/elementHiding/settings/domains/0', value: { domain: 'test.com' } },
                { op: 'replace', path: '/features/elementHiding/settings/domains/1/domain', value: 'updated.com' },
            ],
            expected: true,
        },
        {
            name: 'Element hiding exceptions only - should approve',
            patches: [
                { op: 'add', path: '/features/elementHiding/exceptions/0', value: { domain: 'test.com', reason: 'testing' } },
                { op: 'remove', path: '/features/elementHiding/exceptions/1' },
            ],
            expected: true,
        },
        {
            name: 'Element hiding rules - should NOT approve',
            patches: [
                { op: 'add', path: '/features/elementHiding/settings/rules/0', value: { selector: '.ad', type: 'hide' } },
            ],
            expected: false,
        },
        {
            name: 'Mixed element hiding changes - should NOT approve',
            patches: [
                { op: 'add', path: '/features/elementHiding/settings/domains/0', value: { domain: 'test.com' } },
                { op: 'add', path: '/features/elementHiding/settings/rules/0', value: { selector: '.ad', type: 'hide' } },
            ],
            expected: false,
        },
        {
            name: 'Fingerprinting exceptions only - should approve',
            patches: [
                {
                    op: 'add',
                    path: '/features/fingerprintingTemporaryStorage/exceptions/0',
                    value: { domain: 'test.com', reason: 'testing' },
                },
                { op: 'remove', path: '/features/fingerprintingAudio/exceptions/1' },
            ],
            expected: true,
        },
        {
            name: 'Mixed fingerprinting and element hiding - should approve',
            patches: [
                { op: 'add', path: '/features/elementHiding/settings/domains/0', value: { domain: 'test.com' } },
                { op: 'add', path: '/features/fingerprintingCanvas/exceptions/0', value: { domain: 'test.com', reason: 'testing' } },
            ],
            expected: true,
        },
        {
            name: 'Other feature changes - should NOT approve',
            patches: [
                { op: 'add', path: '/features/trackingProtection/settings/domains/0', value: { domain: 'test.com' } },
            ],
            expected: false,
        },
        {
            name: 'No changes - should NOT approve',
            patches: [],
            expected: false,
        },
        {
            name: 'Path matching edge cases - should approve',
            patches: [
                // These should be approved - they are nested properties within allowed paths
                { op: 'add', path: '/features/elementHiding/settings/domains/0/domain', value: 'test.com' },
                { op: 'add', path: '/features/elementHiding/exceptions/0/reason', value: 'testing' },
                { op: 'add', path: '/features/fingerprintingAudio/exceptions/0/domain', value: 'test.com' },
            ],
            expected: true,
        },
        {
            name: 'Improved path matching - should NOT approve',
            patches: [
                // These should NOT be approved - they are outside allowed paths
                { op: 'add', path: '/features/elementHiding/settings/rules/0', value: { selector: '.ad' } },
                { op: 'add', path: '/features/elementHiding/settings/enabled', value: false },
                { op: 'add', path: '/features/fingerprintingAudio/settings/enabled', value: true },
            ],
            expected: false,
        },
    ];

    testCases.forEach((testCase) => {
        it(testCase.name, () => {
            const result = analyzePatchesForApproval(testCase.patches);
            const summary = generateChangeSummary(testCase.patches);

            expect(result.shouldApprove).to.equal(testCase.expected);
            expect(summary.total).to.equal(testCase.patches.length);

            if (testCase.patches.length > 0) {
                expect(summary.autoApprovableChanges + summary.otherChanges).to.equal(testCase.patches.length);
            }
        });
    });
});

describe('Auto-approvable features structure tests', () => {
    it('should approve real element hiding domain and exception changes', () => {
        const realElementHidingPatches = [
            { op: 'add', path: '/features/elementHiding/settings/domains/0', value: { domain: 'newsite.com', rules: [] } },
            {
                op: 'add',
                path: '/features/elementHiding/exceptions/0',
                value: { domain: 'exceptionsite.com', reason: 'https://github.com/duckduckgo/privacy-configuration/issues/1234' },
            },
        ];

        const result = analyzePatchesForApproval(realElementHidingPatches);
        const summary = generateChangeSummary(realElementHidingPatches);

        expect(result.shouldApprove).to.equal(true);
        expect(result.reason).to.include('Auto-approved');
        expect(summary.autoApprovableChanges).to.equal(2);
        expect(summary.otherChanges).to.equal(0);
    });

    it('should approve fingerprinting exception changes', () => {
        const fingerprintingPatches = [
            { op: 'add', path: '/features/fingerprintingHardware/exceptions/0', value: { domain: 'test.com', reason: 'testing' } },
        ];

        const result = analyzePatchesForApproval(fingerprintingPatches);
        const summary = generateChangeSummary(fingerprintingPatches);

        expect(result.shouldApprove).to.equal(true);
        expect(result.reason).to.include('Auto-approved');
        expect(summary.autoApprovableChanges).to.equal(1);
        expect(summary.otherChanges).to.equal(0);
    });

    it('should not approve element hiding rules changes', () => {
        const rulesPatches = [
            { op: 'add', path: '/features/elementHiding/settings/rules/0', value: { selector: '.ad', type: 'hide' } },
        ];

        const result = analyzePatchesForApproval(rulesPatches);

        expect(result.shouldApprove).to.equal(false);
        expect(result.reason).to.include('Manual review required');
        expect(result.reason).to.include('disallowed paths');
    });

    it('should not approve changes to other features', () => {
        const otherFeaturePatches = [
            { op: 'add', path: '/features/trackingProtection/settings/domains/0', value: { domain: 'test.com' } },
        ];

        const result = analyzePatchesForApproval(otherFeaturePatches);

        expect(result.shouldApprove).to.equal(false);
        expect(result.reason).to.include('Manual review required');
    });

    it('should generate correct change summaries', () => {
        const mixedPatches = [
            { op: 'add', path: '/features/elementHiding/settings/domains/0', value: { domain: 'test.com' } },
            { op: 'replace', path: '/features/trackingProtection/enabled', value: true },
            { op: 'remove', path: '/features/elementHiding/exceptions/0' },
        ];

        const summary = generateChangeSummary(mixedPatches);

        expect(summary.total).to.equal(3);
        expect(summary.autoApprovableChanges).to.equal(2);
        expect(summary.otherChanges).to.equal(1);
        expect(summary.byOperation.add).to.equal(1);
        expect(summary.byOperation.replace).to.equal(1);
        expect(summary.byOperation.remove).to.equal(1);
    });
});

describe('generateChangeSummary specific tests', () => {
    it('should correctly count auto-approvable changes within allowed paths', () => {
        const patches = [
            { op: 'add', path: '/features/elementHiding/settings/domains/0', value: { domain: 'test.com' } },
            { op: 'add', path: '/features/elementHiding/exceptions/0', value: { domain: 'test.com', reason: 'testing' } },
            { op: 'add', path: '/features/fingerprintingAudio/exceptions/0', value: { domain: 'test.com', reason: 'testing' } },
        ];

        const summary = generateChangeSummary(patches);

        expect(summary.total).to.equal(3);
        expect(summary.autoApprovableChanges).to.equal(3);
        expect(summary.otherChanges).to.equal(0);
    });

    it('should NOT count disallowed paths as auto-approvable even within auto-approvable features', () => {
        const patches = [
            { op: 'add', path: '/features/elementHiding/settings/domains/0', value: { domain: 'test.com' } },
            { op: 'add', path: '/features/elementHiding/settings/rules/0', value: { selector: '.ad', type: 'hide' } },
            { op: 'add', path: '/features/elementHiding/settings/enabled', value: false },
            { op: 'add', path: '/features/fingerprintingAudio/settings/enabled', value: true },
        ];

        const summary = generateChangeSummary(patches);

        expect(summary.total).to.equal(4);
        expect(summary.autoApprovableChanges).to.equal(1); // Only the domains change
        expect(summary.otherChanges).to.equal(3); // rules, enabled settings
    });

    it('should correctly count nested properties within allowed paths', () => {
        const patches = [
            { op: 'add', path: '/features/elementHiding/settings/domains/0/domain', value: 'test.com' },
            { op: 'add', path: '/features/elementHiding/settings/domains/0/rules/0', value: { selector: '.ad' } },
            { op: 'add', path: '/features/elementHiding/exceptions/0/reason', value: 'testing' },
        ];

        const summary = generateChangeSummary(patches);

        expect(summary.total).to.equal(3);
        expect(summary.autoApprovableChanges).to.equal(3); // All are within allowed paths
        expect(summary.otherChanges).to.equal(0);
    });

    it('should correctly count mixed auto-approvable and non-auto-approvable features', () => {
        const patches = [
            { op: 'add', path: '/features/elementHiding/settings/domains/0', value: { domain: 'test.com' } },
            { op: 'add', path: '/features/trackingProtection/settings/domains/0', value: { domain: 'test.com' } },
            { op: 'add', path: '/features/fingerprintingCanvas/exceptions/0', value: { domain: 'test.com', reason: 'testing' } },
            { op: 'add', path: '/features/cookie/settings/enabled', value: false },
        ];

        const summary = generateChangeSummary(patches);

        expect(summary.total).to.equal(4);
        expect(summary.autoApprovableChanges).to.equal(2); // elementHiding domains + fingerprintingCanvas exceptions
        expect(summary.otherChanges).to.equal(2); // trackingProtection + cookie
    });

    it('should correctly count by operation type', () => {
        const patches = [
            { op: 'add', path: '/features/elementHiding/settings/domains/0', value: { domain: 'test.com' } },
            { op: 'replace', path: '/features/elementHiding/exceptions/0/domain', value: 'updated.com' },
            { op: 'remove', path: '/features/fingerprintingAudio/exceptions/1' },
            { op: 'add', path: '/features/trackingProtection/enabled', value: true },
        ];

        const summary = generateChangeSummary(patches);

        expect(summary.total).to.equal(4);
        expect(summary.autoApprovableChanges).to.equal(3);
        expect(summary.otherChanges).to.equal(1);
        expect(summary.byOperation.add).to.equal(2);
        expect(summary.byOperation.replace).to.equal(1);
        expect(summary.byOperation.remove).to.equal(1);
    });

    it('should correctly count by path grouping', () => {
        const patches = [
            { op: 'add', path: '/features/elementHiding/settings/domains/0', value: { domain: 'test.com' } },
            { op: 'add', path: '/features/elementHiding/exceptions/0', value: { domain: 'test.com' } },
            { op: 'add', path: '/features/fingerprintingAudio/exceptions/0', value: { domain: 'test.com' } },
            { op: 'add', path: '/features/trackingProtection/settings/domains/0', value: { domain: 'test.com' } },
        ];

        const summary = generateChangeSummary(patches);

        expect(summary.total).to.equal(4);
        expect(summary.autoApprovableChanges).to.equal(3);
        expect(summary.otherChanges).to.equal(1);
        expect(summary.byPath['/features/elementHiding']).to.equal(2);
        expect(summary.byPath['/features/fingerprintingAudio']).to.equal(1);
        expect(summary.byPath['/features/trackingProtection']).to.equal(1);
    });

    it('should handle empty patches array', () => {
        const patches = [];

        const summary = generateChangeSummary(patches);

        expect(summary.total).to.equal(0);
        expect(summary.autoApprovableChanges).to.equal(0);
        expect(summary.otherChanges).to.equal(0);
        expect(Object.keys(summary.byOperation)).to.have.length(0);
        expect(Object.keys(summary.byPath)).to.have.length(0);
    });
});

describe('Per-site patch indexing', () => {
    const featurePath = '/features/autofill/features/siteSpecificFixes';

    function configWith(settings) {
        return {
            features: {
                autofill: {
                    state: 'enabled',
                    features: {
                        siteSpecificFixes: {
                            state: 'enabled',
                            settings: { formBoundarySelector: 'form', formTypeSettings: [], ...settings },
                        },
                    },
                },
            },
        };
    }

    const ringFix = {
        domain: [
            'ring.com',
        ],
        patchSettings: [
            { op: 'add', path: '/formTypeSettings/-', value: { selector: 'form', type: 'signup' } },
        ],
    };

    function analyze(baseSettings, updatedSettings, rootPatches) {
        const patches = indexDomainPatches(rootPatches, configWith(baseSettings), configWith(updatedSettings));
        return { patches, result: analyzePatchesForApproval(patches) };
    }

    it('reports a domain-scoped fix at the absolute path it writes', () => {
        const { patches, result } = analyze(
            { domains: [] },
            {
                domains: [
                    ringFix,
                ],
            },
            [
                { op: 'add', path: `${featurePath}/settings/domains/0`, value: ringFix },
            ],
        );
        expect(patches).to.deep.equal([
            { op: 'add', path: `${featurePath}/settings/formTypeSettings/-`, domain: 'ring.com' },
        ]);
        expect(result.shouldApprove).to.equal(true);
    });

    it('approves a domain-scoped conditionalChanges fix', () => {
        const entry = {
            condition: { domain: 'icloud.com' },
            patchSettings: [
                { op: 'replace', path: '/formBoundarySelector', value: 'main' },
            ],
        };
        const { result } = analyze(
            {},
            {
                conditionalChanges: [
                    entry,
                ],
            },
            [
                {
                    op: 'add',
                    path: `${featurePath}/settings/conditionalChanges`,
                    value: [
                        entry,
                    ],
                },
            ],
        );
        expect(result.shouldApprove).to.equal(true);
    });

    it('approves removing a domain-scoped fix', () => {
        const { patches, result } = analyze(
            {
                domains: [
                    ringFix,
                ],
            },
            { domains: [] },
            [
                { op: 'remove', path: `${featurePath}/settings/domains/0` },
            ],
        );
        expect(patches[0]).to.include({ op: 'remove', path: `${featurePath}/settings/formTypeSettings/-` });
        expect(result.shouldApprove).to.equal(true);
    });

    it('ignores entries that are unchanged or reordered', () => {
        const coolors = {
            domain: 'coolors.co',
            patchSettings: [
                { op: 'add', path: '/failsafeSettings/maxInputsPerPage', value: 110 },
            ],
        };
        const { patches } = analyze(
            {
                domains: [
                    ringFix,
                    coolors,
                ],
            },
            {
                domains: [
                    coolors,
                    ringFix,
                ],
            },
            [
                { op: 'replace', path: `${featurePath}/settings/domains/0/domain`, value: 'coolors.co' },
            ],
        );
        expect(patches).to.deep.equal([]);
    });

    it('does NOT approve a fix that writes outside the site-fix settings', () => {
        const entry = {
            domain: 'ring.com',
            patchSettings: [
                { op: 'replace', path: '/domains', value: [] },
            ],
        };
        const { result } = analyze(
            {},
            {
                domains: [
                    entry,
                ],
            },
            [],
        );
        expect(result.shouldApprove).to.equal(false);
        expect(result.disallowedPatches[0]).to.include({ path: `${featurePath}/settings/domains`, domain: 'ring.com' });
    });

    it('does NOT approve changing the same settings for every site', () => {
        const { result } = analyze({}, {}, [
            { op: 'replace', path: `${featurePath}/settings/formBoundarySelector`, value: 'main' },
        ]);
        expect(result.shouldApprove).to.equal(false);
    });

    const riskyEntries = [
        [
            'a public suffix domain',
            'domains',
            { domain: 'co.uk', patchSettings: ringFix.patchSettings },
        ],
        [
            'an empty domain list',
            'domains',
            { domain: [], patchSettings: ringFix.patchSettings },
        ],
        [
            'a non-domain condition',
            'conditionalChanges',
            { condition: { internal: true }, patchSettings: ringFix.patchSettings },
        ],
        [
            'a mixed condition',
            'conditionalChanges',
            { condition: { domain: 'ring.com', urlPattern: '*' }, patchSettings: ringFix.patchSettings },
        ],
        [
            'a move operation',
            'domains',
            {
                domain: 'ring.com',
                patchSettings: [
                    { op: 'move', from: '/domains', path: '/formTypeSettings' },
                ],
            },
        ],
        [
            'a whole-settings operation',
            'domains',
            {
                domain: 'ring.com',
                patchSettings: [
                    { op: 'replace', path: '', value: {} },
                ],
            },
        ],
        [
            'no operations',
            'domains',
            { domain: 'ring.com', patchSettings: [] },
        ],
        [
            'an unknown key',
            'domains',
            { domain: 'ring.com', patchSettings: ringFix.patchSettings, condition: { internal: true } },
        ],
    ];

    riskyEntries.forEach(
        ([
            name,
            entryKey,
            entry,
        ]) => {
            it(`reports an entry with ${name} by index and does NOT approve`, () => {
                const { patches, result } = analyze(
                    {},
                    {
                        [entryKey]: [
                            entry,
                        ],
                    },
                    [],
                );
                expect(patches).to.deep.equal([
                    { op: 'add', path: `${featurePath}/settings/${entryKey}/0`, value: entry },
                ]);
                expect(result.shouldApprove).to.equal(false);
            });
        },
    );

    it('leaves non-array entries to the root diff', () => {
        const rootPatch = { op: 'replace', path: `${featurePath}/settings/domains`, value: {} };
        const { patches, result } = analyze({ domains: [] }, { domains: {} }, [
            rootPatch,
        ]);
        expect(patches).to.deep.equal([
            rootPatch,
        ]);
        expect(result.shouldApprove).to.equal(false);
    });

    it('still checks other features against the root allowlist', () => {
        const { result } = analyze(
            { domains: [] },
            {
                domains: [
                    ringFix,
                ],
            },
            [
                { op: 'add', path: '/features/autofill/exceptions/0', value: { domain: 'ring.com' } },
            ],
        );
        expect(result.shouldApprove).to.equal(false);
    });

    it('does not let a domain tag approve paths in features that are not indexed', () => {
        const result = analyzePatchesForApproval([
            { op: 'add', path: '/features/elementHiding/settings/rules/0', domain: 'ring.com' },
        ]);
        expect(result.shouldApprove).to.equal(false);
    });

    it('matches feature paths on whole segments', () => {
        const result = analyzePatchesForApproval([
            { op: 'add', path: '/features/gpcExtra/exceptions/0', value: {} },
        ]);
        expect(result.shouldApprove).to.equal(false);
    });

    it('reads multiple domains and condition blocks', () => {
        expect(
            getScopedDomains(
                {
                    domain: [
                        'a.com',
                        'b.co.uk',
                    ],
                    patchSettings: [],
                },
                'domains',
            ),
        ).to.deep.equal([
            'a.com',
            'b.co.uk',
        ]);
        expect(
            getScopedDomains(
                {
                    condition: [
                        { domain: 'a.com' },
                        { domain: 'localhost' },
                    ],
                    patchSettings: [],
                },
                'conditionalChanges',
            ),
        ).to.deep.equal([
            'a.com',
            'localhost',
        ]);
        expect(
            getScopedDomains(
                {
                    condition: {
                        domain: [
                            'a.com',
                        ],
                    },
                    patchSettings: [],
                },
                'conditionalChanges',
            ),
        ).to.equal(null);
    });
});
