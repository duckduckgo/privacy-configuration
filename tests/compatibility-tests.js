import { expect } from 'chai';
import { compatFunctions } from '../compatibility.js';

describe('Compatibility functions', () => {
    describe('v5 compatibility function', () => {
        it('should strip exceptions from sub-features', () => {
            const v6Config = {
                features: {
                    testFeature: {
                        state: 'enabled',
                        exceptions: [{ domain: 'example.com' }],
                        features: {
                            testSubFeature: {
                                state: 'enabled',
                                exceptions: [{ domain: 'sub.example.com' }],
                            },
                        },
                    },
                },
            };

            const v5Config = compatFunctions.v5(v6Config);

            expect(v5Config.features.testFeature.exceptions).to.deep.equal([{ domain: 'example.com' }]);
            expect(v5Config.features.testFeature.features.testSubFeature.exceptions).to.equal(undefined);
        });

        it('should strip rollout from parent features', () => {
            const v6Config = {
                features: {
                    testFeature: {
                        state: 'enabled',
                        exceptions: [],
                        rollout: {
                            steps: [{ percent: 5 }],
                        },
                        features: {
                            testSubFeature: {
                                state: 'enabled',
                                rollout: {
                                    steps: [{ percent: 10 }],
                                },
                            },
                        },
                    },
                },
            };

            const v5Config = compatFunctions.v5(v6Config);

            expect(v5Config.features.testFeature.rollout).to.equal(undefined);
            // Sub-feature rollout should be preserved (it was already supported in v5)
            expect(v5Config.features.testFeature.features.testSubFeature.rollout).to.deep.equal({
                steps: [{ percent: 10 }],
            });
        });

        it('should strip targets from parent features', () => {
            const v6Config = {
                features: {
                    testFeature: {
                        state: 'enabled',
                        exceptions: [],
                        targets: [
                            {
                                variantKey: '1',
                                localeCountry: 'US',
                            },
                        ],
                        features: {
                            testSubFeature: {
                                state: 'enabled',
                                targets: [
                                    {
                                        variantKey: '2',
                                    },
                                ],
                            },
                        },
                    },
                },
            };

            const v5Config = compatFunctions.v5(v6Config);

            expect(v5Config.features.testFeature.targets).to.equal(undefined);
            // Sub-feature targets should be preserved (it was already supported in v5)
            expect(v5Config.features.testFeature.features.testSubFeature.targets).to.deep.equal([
                {
                    variantKey: '2',
                },
            ]);
        });

        it('should strip description from parent features', () => {
            const v6Config = {
                features: {
                    testFeature: {
                        state: 'enabled',
                        exceptions: [],
                        description: 'Test feature description',
                        features: {
                            testSubFeature: {
                                state: 'enabled',
                                description: 'Sub-feature description',
                            },
                        },
                    },
                },
            };

            const v5Config = compatFunctions.v5(v6Config);

            expect(v5Config.features.testFeature.description).to.equal(undefined);
            // Sub-feature description should be preserved (it was already supported in v5)
            expect(v5Config.features.testFeature.features.testSubFeature.description).to.equal('Sub-feature description');
        });

        it('should strip cohorts from parent features', () => {
            const v6Config = {
                features: {
                    testFeature: {
                        state: 'enabled',
                        exceptions: [],
                        cohorts: [
                            { name: 'control', weight: 1 },
                            { name: 'treatment', weight: 1 },
                        ],
                        features: {
                            testSubFeature: {
                                state: 'enabled',
                                cohorts: [
                                    { name: 'subControl', weight: 1 },
                                    { name: 'subTreatment', weight: 1 },
                                ],
                            },
                        },
                    },
                },
            };

            const v5Config = compatFunctions.v5(v6Config);

            expect(v5Config.features.testFeature.cohorts).to.equal(undefined);
            // Sub-feature cohorts should be preserved (it was already supported in v5)
            expect(v5Config.features.testFeature.features.testSubFeature.cohorts).to.deep.equal([
                { name: 'subControl', weight: 1 },
                { name: 'subTreatment', weight: 1 },
            ]);
        });

        it('should handle features without sub-features', () => {
            const v6Config = {
                features: {
                    simpleFeature: {
                        state: 'enabled',
                        exceptions: [{ domain: 'example.com' }],
                        description: 'Simple feature',
                        rollout: { steps: [{ percent: 100 }] },
                    },
                },
            };

            const v5Config = compatFunctions.v5(v6Config);

            expect(v5Config.features.simpleFeature.exceptions).to.deep.equal([{ domain: 'example.com' }]);
            expect(v5Config.features.simpleFeature.description).to.equal(undefined);
            expect(v5Config.features.simpleFeature.rollout).to.equal(undefined);
        });

        it('should preserve other feature properties', () => {
            const v6Config = {
                features: {
                    testFeature: {
                        state: 'enabled',
                        exceptions: [{ domain: 'example.com' }],
                        settings: { key: 'value' },
                        minSupportedVersion: '1.0.0',
                        hash: 'abc123',
                        description: 'Should be stripped',
                        features: {
                            testSubFeature: {
                                state: 'enabled',
                                settings: { subKey: 'subValue' },
                                exceptions: [{ domain: 'should-be-stripped.com' }],
                            },
                        },
                    },
                },
            };

            const v5Config = compatFunctions.v5(v6Config);

            expect(v5Config.features.testFeature.state).to.equal('enabled');
            expect(v5Config.features.testFeature.exceptions).to.deep.equal([{ domain: 'example.com' }]);
            expect(v5Config.features.testFeature.settings).to.deep.equal({ key: 'value' });
            expect(v5Config.features.testFeature.minSupportedVersion).to.equal('1.0.0');
            expect(v5Config.features.testFeature.hash).to.equal('abc123');
            expect(v5Config.features.testFeature.features.testSubFeature.state).to.equal('enabled');
            expect(v5Config.features.testFeature.features.testSubFeature.settings).to.deep.equal({ subKey: 'subValue' });
        });

        it('should not mutate the original config', () => {
            const v6Config = {
                features: {
                    testFeature: {
                        state: 'enabled',
                        exceptions: [],
                        description: 'Original description',
                        features: {
                            testSubFeature: {
                                state: 'enabled',
                                exceptions: [{ domain: 'original.com' }],
                            },
                        },
                    },
                },
            };

            const originalJson = JSON.stringify(v6Config);
            compatFunctions.v5(v6Config);

            expect(JSON.stringify(v6Config)).to.equal(originalJson);
        });
    });
});
