import { expect } from 'chai';
import { analyzePatchesForApproval, generateChangeSummary } from '../automation-utils.js';

describe('Auto-approval logic tests', () => {
    const testCases = [
        {
            name: "Element hiding domains only - should approve",
            patches: [
                { op: 'add', path: '/features/elementHiding/settings/domains/0', value: { domain: 'test.com' } },
                { op: 'replace', path: '/features/elementHiding/settings/domains/1/domain', value: 'updated.com' }
            ],
            expected: true
        },
        {
            name: "Element hiding exceptions only - should approve",
            patches: [
                { op: 'add', path: '/features/elementHiding/exceptions/0', value: { domain: 'test.com', reason: 'testing' } },
                { op: 'remove', path: '/features/elementHiding/exceptions/1' }
            ],
            expected: true
        },
        {
            name: "Element hiding rules - should NOT approve",
            patches: [
                { op: 'add', path: '/features/elementHiding/settings/rules/0', value: { selector: '.ad', type: 'hide' } }
            ],
            expected: false
        },
        {
            name: "Mixed element hiding changes - should NOT approve",
            patches: [
                { op: 'add', path: '/features/elementHiding/settings/domains/0', value: { domain: 'test.com' } },
                { op: 'add', path: '/features/elementHiding/settings/rules/0', value: { selector: '.ad', type: 'hide' } }
            ],
            expected: false
        },
        {
            name: "Other feature changes - should NOT approve",
            patches: [
                { op: 'add', path: '/features/trackingProtection/settings/domains/0', value: { domain: 'test.com' } }
            ],
            expected: false
        },
        {
            name: "No changes - should NOT approve",
            patches: [],
            expected: false
        }
    ];

    testCases.forEach((testCase) => {
        it(testCase.name, () => {
            const result = analyzePatchesForApproval(testCase.patches);
            const summary = generateChangeSummary(testCase.patches);
            
            expect(result.shouldApprove).to.equal(testCase.expected);
            expect(summary.total).to.equal(testCase.patches.length);
            
            if (testCase.patches.length > 0) {
                expect(summary.elementHidingChanges + summary.otherChanges).to.equal(testCase.patches.length);
            }
        });
    });
});

describe('Element hiding structure tests', () => {
    it('should approve real element hiding domain and exception changes', () => {
        const realElementHidingPatches = [
            { op: 'add', path: '/features/elementHiding/settings/domains/0', value: { domain: 'newsite.com', rules: [] } },
            { op: 'add', path: '/features/elementHiding/exceptions/0', value: { domain: 'exceptionsite.com', reason: 'https://github.com/duckduckgo/privacy-configuration/issues/1234' } }
        ];

        const result = analyzePatchesForApproval(realElementHidingPatches);
        const summary = generateChangeSummary(realElementHidingPatches);

        expect(result.shouldApprove).to.be.true;
        expect(result.reason).to.include('Auto-approved');
        expect(summary.elementHidingChanges).to.equal(2);
        expect(summary.otherChanges).to.equal(0);
    });

    it('should not approve element hiding rules changes', () => {
        const rulesPatches = [
            { op: 'add', path: '/features/elementHiding/settings/rules/0', value: { selector: '.ad', type: 'hide' } }
        ];

        const result = analyzePatchesForApproval(rulesPatches);
        
        expect(result.shouldApprove).to.be.false;
        expect(result.reason).to.include('Manual review required');
        expect(result.reason).to.include('disallowed paths');
    });

    it('should not approve changes to other features', () => {
        const otherFeaturePatches = [
            { op: 'add', path: '/features/trackingProtection/settings/domains/0', value: { domain: 'test.com' } }
        ];

        const result = analyzePatchesForApproval(otherFeaturePatches);
        
        expect(result.shouldApprove).to.be.false;
        expect(result.reason).to.include('Manual review required');
    });

    it('should generate correct change summaries', () => {
        const mixedPatches = [
            { op: 'add', path: '/features/elementHiding/settings/domains/0', value: { domain: 'test.com' } },
            { op: 'replace', path: '/features/trackingProtection/enabled', value: true },
            { op: 'remove', path: '/features/elementHiding/exceptions/0' }
        ];

        const summary = generateChangeSummary(mixedPatches);
        
        expect(summary.total).to.equal(3);
        expect(summary.elementHidingChanges).to.equal(2);
        expect(summary.otherChanges).to.equal(1);
        expect(summary.byOperation.add).to.equal(1);
        expect(summary.byOperation.replace).to.equal(1);
        expect(summary.byOperation.remove).to.equal(1);
    });
}); 