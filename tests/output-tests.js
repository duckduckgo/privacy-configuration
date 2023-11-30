const fs = require('fs')
const path = require('path')
const expect = require('chai').expect

function loadJSON (pathFromRoot) {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', pathFromRoot), 'utf-8'))
}

function fileNameToFeatureName (name) {
    return name.replace(/[.]json$/, '').replace(/-([a-z0-9])/g, function (g) { return g[1].toUpperCase() })
}

/**
 * Tests on the built config output. You'll need to run `npm run build` first for these tests to
 * work.
 */
describe('Build output validation', () => {
    describe('unprotected temporary merge', () => {
        const extractDomains = (exception) => exception.domain
        const override = loadJSON('overrides/extension-override.json')
        const config = loadJSON('generated/v4/extension-config.json');

        ['content-blocking', 'cookie', 'click-to-load', 'web-compat'].forEach((featureFile) => {
            const feature = fileNameToFeatureName(featureFile)
            const featureConfig = loadJSON(`features/${featureFile}.json`)
            it(`${feature} should include platform unprotectedTemporary exceptions`, () => {
                const expected = override.unprotectedTemporary.map(extractDomains)
                const actual = config.features[feature].exceptions.map(extractDomains)
                expected.forEach((domain) => {
                    expect(actual).to.contain(domain)
                })
            })

            it(`${feature} should include feature exceptions`, () => {
                const expected = featureConfig.exceptions.map(extractDomains)
                const actual = config.features[feature].exceptions.map(extractDomains)
                expected.forEach((domain) => {
                    expect(actual).to.contain(domain)
                })
            })

            it(`${feature} exceptions should not contain duplicates`, () => {
                expect(config.features[feature].exceptions.length).to.equal(new Set(config.features[feature].exceptions.map(extractDomains)).size)
            })
        });

        ['ad-click-attribution', 'autofill'].forEach((featureFile) => {
            const feature = fileNameToFeatureName(featureFile)
            const featureConfig = loadJSON(`features/${featureFile}.json`)

            it(`${feature} should not include platform unprotectedTemporary exceptions`, () => {
                const unprotected = new Set(override.unprotectedTemporary.map(extractDomains))
                featureConfig.exceptions.map(extractDomains).forEach((domain) => unprotected.delete(domain))
                const actual = config.features[feature].exceptions.map(extractDomains)
                unprotected.forEach((domain) => {
                    expect(actual).to.not.contain(domain)
                })
            })

            it(`${feature} should include feature exceptions`, () => {
                const expected = featureConfig.exceptions.map(extractDomains)
                const actual = config.features[feature].exceptions.map(extractDomains)
                expected.forEach((domain) => {
                    expect(actual).to.contain(domain)
                })
            })
        })
    })
})
