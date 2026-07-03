import fs from 'fs';
import path from 'path';
import { expect } from 'chai';

function loadJSON(pathFromRoot) {
    return JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', pathFromRoot), 'utf-8'));
}

function fileNameToFeatureName(name) {
    return name.replace(/[.]json$/, '').replace(/-([a-z0-9])/g, function (g) {
        return g[1].toUpperCase();
    });
}

/**
 * Tests on the built config output. You'll need to run `npm run build` first for these tests to
 * work.
 */
describe('Build output validation', () => {
    describe('unprotected temporary merge', () => {
        const extractDomains = (exception) => exception.domain;
        const override = loadJSON('overrides/extension-override.json');
        const config = loadJSON('generated/v5/extension-config.json');

        [
            'content-blocking',
            'cookie',
            'click-to-load',
            'web-compat',
        ].forEach((featureFile) => {
            const feature = fileNameToFeatureName(featureFile);
            const featureConfig = loadJSON(`features/${featureFile}.json`);
            it(`${feature} should include platform unprotectedTemporary exceptions`, () => {
                const expected = override.unprotectedTemporary.map(extractDomains);
                const actual = config.features[feature].exceptions.map(extractDomains);
                expected.forEach((domain) => {
                    expect(actual).to.contain(domain);
                });
            });

            it(`${feature} should include feature exceptions`, () => {
                const expected = featureConfig.exceptions.map(extractDomains);
                const actual = config.features[feature].exceptions.map(extractDomains);
                expected.forEach((domain) => {
                    expect(actual).to.contain(domain);
                });
            });

            it(`${feature} exceptions should not contain duplicates`, () => {
                expect(config.features[feature].exceptions.length).to.equal(
                    new Set(config.features[feature].exceptions.map(extractDomains)).size,
                );
            });
        });

        [
            'ad-click-attribution',
            'autofill',
        ].forEach((featureFile) => {
            const feature = fileNameToFeatureName(featureFile);
            const featureConfig = loadJSON(`features/${featureFile}.json`);

            it(`${feature} should not include platform unprotectedTemporary exceptions`, () => {
                const unprotected = new Set(override.unprotectedTemporary.map(extractDomains));
                featureConfig.exceptions.map(extractDomains).forEach((domain) => unprotected.delete(domain));
                const actual = config.features[feature].exceptions.map(extractDomains);
                unprotected.forEach((domain) => {
                    expect(actual).to.not.contain(domain);
                });
            });

            it(`${feature} should include feature exceptions`, () => {
                const expected = featureConfig.exceptions.map(extractDomains);
                const actual = config.features[feature].exceptions.map(extractDomains);
                expected.forEach((domain) => {
                    expect(actual).to.contain(domain);
                });
            });
        });
    });

    describe('unprotected temporary user-agent mitigations', () => {
        const extractDomains = (entry) => entry.domain;
        const globalUnprotected = loadJSON('features/unprotected-temporary.json').exceptions.map(extractDomains);

        it('adds iOS Safari-like custom user-agent settings', () => {
            const config = loadJSON('generated/v5/ios-config.json');
            const settings = config.features.customUserAgent.settings;
            const ddgFixedSites = settings.ddgFixedSites.map(extractDomains);
            const omitApplicationSites = settings.omitApplicationSites.map(extractDomains);

            globalUnprotected.forEach((domain) => {
                expect(ddgFixedSites).to.contain(domain);
                expect(omitApplicationSites).to.contain(domain);
            });
        });

        it('adds macOS Safari-like custom user-agent settings', () => {
            const config = loadJSON('generated/v5/macos-config.json');
            const defaultSites = config.features.customUserAgent.settings.defaultSites.map(extractDomains);

            globalUnprotected.forEach((domain) => {
                expect(defaultSites).to.contain(domain);
            });
        });

        it('adds Android Chrome client-brand hints', () => {
            const config = loadJSON('generated/v5/android-config.json');
            const domains = config.features.clientBrandHint.settings.domains;

            globalUnprotected.forEach((domain) => {
                expect(domains).to.deep.include({ domain, brand: 'CHROME' });
            });
        });

        it('adds Windows Chrome UA and client-hint mitigations', () => {
            const config = loadJSON('generated/v5/windows-config.json');
            const strategies = config.features.customUserAgent.features.userAgentStrategies.settings.strategies;
            const clientHintDomains = config.features.clientBrandHint.settings.domains;
            const uaChBrandDomains = config.features.uaChBrands.settings.conditionalChanges.map(
                (change) => change.condition.domain,
            );
            const uaChBrandExceptions = config.features.uaChBrands.exceptions.map(extractDomains);

            globalUnprotected.forEach((domain) => {
                expect(strategies).to.deep.include({ strategy: 'ChromeUA', domain });
                expect(clientHintDomains).to.deep.include({ domain, brand: 'Google Chrome' });
                expect(uaChBrandDomains).to.contain(domain);
                expect(uaChBrandExceptions).to.not.contain(domain);
            });
        });
    });
});
