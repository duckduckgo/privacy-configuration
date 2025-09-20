import { expect } from 'chai';
import { isPathAllowedForFeature, AUTO_APPROVABLE_FEATURES } from '../automation-utils.js';

describe('isPathAllowedForFeature tests', () => {
    describe('Valid feature paths with allowed subpaths', () => {
        it('should allow exact path matches for elementHiding domains', () => {
            const result = isPathAllowedForFeature('/features/elementHiding/settings/domains', '/features/elementHiding');
            expect(result).to.equal(true);
        });

        it('should allow exact path matches for elementHiding exceptions', () => {
            const result = isPathAllowedForFeature('/features/elementHiding/exceptions', '/features/elementHiding');
            expect(result).to.equal(true);
        });

        it('should allow nested paths for elementHiding domains', () => {
            const result = isPathAllowedForFeature('/features/elementHiding/settings/domains/0', '/features/elementHiding');
            expect(result).to.equal(true);
        });

        it('should allow deeply nested paths for elementHiding domains', () => {
            const result = isPathAllowedForFeature('/features/elementHiding/settings/domains/0/domain', '/features/elementHiding');
            expect(result).to.equal(true);
        });

        it('should allow nested paths for elementHiding exceptions', () => {
            const result = isPathAllowedForFeature('/features/elementHiding/exceptions/0/domain', '/features/elementHiding');
            expect(result).to.equal(true);
        });

        it('should allow nested array indices for elementHiding exceptions', () => {
            const result = isPathAllowedForFeature('/features/elementHiding/exceptions/42/reason', '/features/elementHiding');
            expect(result).to.equal(true);
        });
    });


    describe('Complex feature paths', () => {
        it('should allow all allowed paths for trackerAllowlist', () => {
            const result = isPathAllowedForFeature('/features/trackerAllowlist/settings/allowlistedTrackers', '/features/trackerAllowlist');
            expect(result).to.equal(true);
        });

        it('should allow nested paths for trackerAllowlist', () => {
            const result = isPathAllowedForFeature(
                '/features/trackerAllowlist/settings/allowlistedTrackers/0/domain',
                '/features/trackerAllowlist',
            );
            expect(result).to.equal(true);
        });

        it('should allow all paths for autoconsent exceptions', () => {
            const result1 = isPathAllowedForFeature('/features/autoconsent/exceptions', '/features/autoconsent');
            const result2 = isPathAllowedForFeature('/features/autoconsent/settings/disabledCMPs', '/features/autoconsent');
            expect(result1).to.equal(true);
            expect(result2).to.equal(true);
        });

        it('should allow all paths for customUserAgent', () => {
            const paths = [
                '/features/customUserAgent/exceptions',
                '/features/customUserAgent/settings/ddgFixedSites',
                '/features/customUserAgent/settings/omitApplicationSites',
                '/features/customUserAgent/settings/defaultSites',
            ];

            paths.forEach((path) => {
                const result = isPathAllowedForFeature(path, '/features/customUserAgent');
                expect(result).to.equal(true);
            });
        });
    });

    describe('Invalid feature paths', () => {
        it('should return false for non-existent features', () => {
            const result = isPathAllowedForFeature('/features/nonExistentFeature/settings/domains', '/features/nonExistentFeature');
            expect(result).to.equal(false);
        });

        it('should return false for undefined feature path', () => {
            const result = isPathAllowedForFeature('/some/path', undefined);
            expect(result).to.equal(false);
        });

        it('should return false for null feature path', () => {
            const result = isPathAllowedForFeature('/some/path', null);
            expect(result).to.equal(false);
        });

        it('should return false for empty feature path', () => {
            const result = isPathAllowedForFeature('/some/path', '');
            expect(result).to.equal(false);
        });
    });

    describe('Disallowed paths within valid features', () => {
        it('should NOT allow elementHiding settings/rules', () => {
            const result = isPathAllowedForFeature('/features/elementHiding/settings/rules', '/features/elementHiding');
            expect(result).to.equal(false);
        });

        it('should NOT allow elementHiding settings/enabled', () => {
            const result = isPathAllowedForFeature('/features/elementHiding/settings/enabled', '/features/elementHiding');
            expect(result).to.equal(false);
        });

        it('should NOT allow fingerprinting settings for fingerprinting features', () => {
            const result = isPathAllowedForFeature('/features/fingerprintingCanvas/settings/enabled', '/features/fingerprintingCanvas');
            expect(result).to.equal(false);
        });

        it('should NOT allow state changes for any feature', () => {
            const result = isPathAllowedForFeature('/features/elementHiding/state', '/features/elementHiding');
            expect(result).to.equal(false);
        });

        it('should NOT allow random settings paths for trackerAllowlist', () => {
            const result = isPathAllowedForFeature('/features/trackerAllowlist/settings/randomSetting', '/features/trackerAllowlist');
            expect(result).to.equal(false);
        });
    });

    describe('Edge cases and path matching precision', () => {
        it('should NOT match similar but different path prefixes', () => {
            // This tests that '/settings/domain' doesn't match '/settings/domains'
            const result = isPathAllowedForFeature('/features/elementHiding/settings/domain', '/features/elementHiding');
            expect(result).to.equal(false);
        });

        it('should NOT match paths that are prefixes of allowed paths', () => {
            // '/settings' should not match when only '/settings/domains' is allowed
            const result = isPathAllowedForFeature('/features/elementHiding/settings', '/features/elementHiding');
            expect(result).to.equal(false);
        });

        it('should handle trailing slashes correctly', () => {
            const result1 = isPathAllowedForFeature('/features/elementHiding/settings/domains/', '/features/elementHiding');
            const result2 = isPathAllowedForFeature('/features/elementHiding/settings/domains/0/', '/features/elementHiding');
            expect(result1).to.equal(true);
            expect(result2).to.equal(true);
        });

        it('should be case sensitive', () => {
            const result = isPathAllowedForFeature('/features/elementHiding/settings/Domains', '/features/elementHiding');
            expect(result).to.equal(false);
        });

        it('should handle empty patch path', () => {
            const result = isPathAllowedForFeature('', '/features/elementHiding');
            expect(result).to.equal(false);
        });

        it('should handle paths with double slashes', () => {
            const result = isPathAllowedForFeature('/features/elementHiding//settings/domains', '/features/elementHiding');
            expect(result).to.equal(false);
        });
    });

    describe('Wildcard pattern support', () => {
        it('should allow exceptions for any new feature using wildcard pattern', () => {
            const result1 = isPathAllowedForFeature('/features/newFeature/exceptions', '/features/*');
            const result2 = isPathAllowedForFeature('/features/anotherFeature/exceptions/0', '/features/*');
            expect(result1).to.equal(true);
            expect(result2).to.equal(true);
        });

        it('should NOT allow non-exceptions paths for wildcard pattern', () => {
            const result1 = isPathAllowedForFeature('/features/newFeature/settings/enabled', '/features/*');
            const result2 = isPathAllowedForFeature('/features/anotherFeature/state', '/features/*');
            expect(result1).to.equal(false);
            expect(result2).to.equal(false);
        });

        it('should prefer exact feature matches over wildcard', () => {
            // elementHiding has specific allowed paths, should not fall back to wildcard
            const result = isPathAllowedForFeature('/features/elementHiding/settings/enabled', '/features/elementHiding');
            expect(result).to.equal(false);
        });
    });

    describe('Comprehensive AUTO_APPROVABLE_FEATURES coverage', () => {
        it('should test all configured auto-approvable features exist', () => {
            // Ensure our test coverage matches the actual configuration
            const configuredFeatures = Object.keys(AUTO_APPROVABLE_FEATURES);
            expect(configuredFeatures).to.include.members([
                '/features/elementHiding',
                '/features/trackerAllowlist',
                '/features/autoconsent',
                '/features/customUserAgent',
                '/features/*',
            ]);
        });

        it('should verify each feature has at least one allowed path', () => {
            Object.entries(AUTO_APPROVABLE_FEATURES).forEach(
                ([
                    featurePath,
                    allowedPaths,
                ]) => {
                    expect(allowedPaths).to.be.an('array');
                    expect(allowedPaths.length).to.be.greaterThan(0);

                    // Test that at least one allowed path works
                    const testPath = featurePath + allowedPaths[0];
                    const result = isPathAllowedForFeature(testPath, featurePath);
                    expect(result).to.equal(true);
                },
            );
        });

        it('should test all allowed paths for each feature', () => {
            Object.entries(AUTO_APPROVABLE_FEATURES).forEach(
                ([
                    featurePath,
                    allowedPaths,
                ]) => {
                    allowedPaths.forEach((allowedPath) => {
                        // Test exact match
                        const exactPath = featurePath + allowedPath;
                        const exactResult = isPathAllowedForFeature(exactPath, featurePath);
                        expect(exactResult).to.equal(true);

                        // Test nested path
                        const nestedPath = featurePath + allowedPath + '/0';
                        const nestedResult = isPathAllowedForFeature(nestedPath, featurePath);
                        expect(nestedResult).to.equal(true);

                        // Test deeply nested path
                        const deepPath = featurePath + allowedPath + '/0/property';
                        const deepResult = isPathAllowedForFeature(deepPath, featurePath);
                        expect(deepResult).to.equal(true);
                    });
                },
            );
        });
    });
});
