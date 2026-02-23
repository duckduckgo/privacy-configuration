import { expect } from 'chai';
import { extractFromOverrides, getEnabledExperimentsSummary } from '../scripts/extract-experiments.mjs';

describe('extract-experiments', () => {
    describe('extractFromOverrides', () => {
        it('should extract experiments from all platforms', () => {
            const manifest = extractFromOverrides();

            expect(manifest).to.have.property('extractedAt');
            expect(manifest).to.have.property('source', 'overrides');
            expect(manifest).to.have.property('platforms');

            // All 5 platforms should be present
            expect(Object.keys(manifest.platforms)).to.include.members(['android', 'ios', 'macos', 'windows', 'extension']);
        });

        it('should extract native experiments for Android', () => {
            const manifest = extractFromOverrides();
            const android = manifest.platforms.android;

            expect(android.nativeExperiments).to.be.an('array');
            expect(android.nativeExperiments.length).to.be.greaterThan(0);

            const exp = android.nativeExperiments[0];
            expect(exp).to.have.property('name');
            expect(exp).to.have.property('state');
            expect(exp).to.have.property('cohorts');
            expect(exp.cohorts).to.be.an('array');
        });

        it('should extract contentScope experiments', () => {
            const manifest = extractFromOverrides();
            const android = manifest.platforms.android;

            expect(android.contentScopeExperiments).to.be.an('array');
            expect(android.contentScopeExperiments.length).to.be.greaterThan(0);
        });

        it('should not have native experiments for iOS', () => {
            const manifest = extractFromOverrides();
            expect(manifest.platforms.ios.nativeExperiments).to.deep.equal([]);
        });

        it('should extract rollout percentages', () => {
            const manifest = extractFromOverrides();
            const allExps = [
                ...manifest.platforms.android.nativeExperiments,
                ...manifest.platforms.android.contentScopeExperiments,
            ];

            const withRollout = allExps.filter((e) => e.rolloutPercent !== null);
            expect(withRollout.length).to.be.greaterThan(0);

            for (const exp of withRollout) {
                expect(exp.rolloutPercent).to.be.a('number');
                expect(exp.rolloutPercent).to.be.greaterThan(0);
                expect(exp.rolloutPercent).to.be.at.most(100);
            }
        });
    });

    describe('getEnabledExperimentsSummary', () => {
        it('should return only enabled experiments', () => {
            const manifest = extractFromOverrides();
            const enabled = getEnabledExperimentsSummary(manifest);

            expect(enabled).to.be.an('array');
            for (const exp of enabled) {
                expect(exp).to.have.property('platform');
                expect(exp).to.have.property('type');
                expect(exp).to.have.property('name');
                expect(exp.state).to.equal('enabled');
            }
        });
    });
});
