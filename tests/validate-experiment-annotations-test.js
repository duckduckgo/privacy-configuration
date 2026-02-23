import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateAnnotations } from '../scripts/validate-experiment-annotations.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('validate-experiment-annotations', () => {
    describe('validateAnnotations', () => {
        it('should pass with no errors for current config', () => {
            const result = validateAnnotations();
            expect(result.summary.errors).to.equal(0);
        });

        it('should detect warnings for missing owners and privacy review', () => {
            const result = validateAnnotations();
            // Current annotations have empty owners and no privacy reviews
            expect(result.warnings.length).to.be.greaterThan(0);

            const ownerWarnings = result.warnings.filter((w) => w.issue === 'missing_owners');
            const privacyWarnings = result.warnings.filter((w) => w.issue === 'missing_privacy_review');
            expect(ownerWarnings.length).to.be.greaterThan(0);
            expect(privacyWarnings.length).to.be.greaterThan(0);
        });

        it('should produce errors when --require-privacy-review is set', () => {
            const result = validateAnnotations({ requirePrivacyReview: true });
            const privacyErrors = result.errors.filter((e) => e.issue === 'missing_privacy_review');
            expect(privacyErrors.length).to.be.greaterThan(0);
        });

        it('should detect feature impacts for enabled experiments', () => {
            const result = validateAnnotations();

            // Android contentScopeExperiment1 patches fingerprinting features
            const androidImpact = result.impacts.find(
                (i) => i.platform === 'android' && i.experiment === 'contentScopeExperiment1',
            );
            if (androidImpact) {
                expect(androidImpact.affectedFeatures).to.be.an('array');
                expect(androidImpact.affectedFeatures.length).to.be.greaterThan(0);
                expect(androidImpact.patchPaths).to.be.an('array');
                expect(androidImpact.patchPaths.length).to.be.greaterThan(0);
            }
        });

        it('should include errors, warnings, impacts, and summary in result', () => {
            const result = validateAnnotations();
            expect(result).to.have.property('validatedAt');
            expect(result).to.have.property('errors').that.is.an('array');
            expect(result).to.have.property('warnings').that.is.an('array');
            expect(result).to.have.property('impacts').that.is.an('array');
            expect(result).to.have.property('summary');
            expect(result.summary).to.have.property('errors').that.is.a('number');
            expect(result.summary).to.have.property('warnings').that.is.a('number');
        });
    });
});
