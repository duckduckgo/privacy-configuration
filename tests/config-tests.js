const expect = require('chai').expect
const Ajv = require('ajv').default
const ajv = new Ajv()
const fs = require('fs')
const platforms = require('./../platforms')

function formatErrors (errors) {
    if (!Array.isArray(errors)) {
        return ''
    }

    return errors.map(item => `${item.instancePath}: ${item.message}`).join(', ')
}

const configs = platforms.map((plat) => {
    return {
        name: `${plat}-config.json`,
        body: JSON.parse(fs.readFileSync(`./generated/${plat}-config.json`))
    }
})

describe('Config schema tests', () => {
    const rootSchema = JSON.parse(fs.readFileSync('./tests/schemas/root.json'))
    const validateRoot = ajv.compile(rootSchema)
    const featureSchema = JSON.parse(fs.readFileSync('./tests/schemas/feature.json'))
    const validateFeature = ajv.compile(featureSchema)
    const exceptionSchema = JSON.parse(fs.readFileSync('./tests/schemas/exception.json'))
    const validateException = ajv.compile(exceptionSchema)

    for (const config of configs) {
        describe(`${config.name}`, () => {
            it('should have a valid root schema', () => {
                expect(validateRoot(config.body)).to.be.equal(true, formatErrors(validateRoot.errors))
            })

            it('should have a vaild feature schema', () => {
                for (const featureKey in config.body.features) {
                    expect(validateFeature(config.body.features[featureKey])).to.be.equal(true, `Feature ${featureKey}: ` + formatErrors(validateFeature.errors))
                }
            })

            it('should have valid exception lists', () => {
                for (const featureKey in config.body.features) {
                    for (const exception of config.body.features[featureKey].exceptions) {
                        expect(validateException(exception)).to.be.equal(true, `Feature ${featureKey}: ` + formatErrors(validateException.errors))
                    }
                }

                for (const exception of config.body.unprotectedTemporary) {
                    expect(validateException(exception)).to.be.equal(true, 'unprotectedTemporary: ' + formatErrors(validateException.errors))
                }
            })
        })
    }
})
