const expect = require('chai').expect
const fs = require('fs')

describe('WebCompat Settings Tests', () => {
    const Ajv = require('ajv').default
    const ajv = new Ajv()
    const rootSchema = JSON.parse(fs.readFileSync('./tests/schemas/webcompat-settings.json', 'utf8'))
    const validateRoot = ajv.compile(rootSchema)

    it('validates the override settings for macos', () => {
        const macosConfig = JSON.parse(fs.readFileSync('./generated/v2/macos-config.json', 'utf8'))
        const actual = validateRoot(macosConfig.features.webCompat.settings)
        if (validateRoot.errors) {
            for (const error of validateRoot.errors) {
                console.error(error)
            }
        }
        expect(actual).to.be.equal(true)
    })
})
