const expect = require('chai').expect
const Ajv = require('ajv').default
const ajv = new Ajv()
const fs = require('fs')
const platforms = require('./../platforms').map(item => item.replace('browsers/', 'extension-'))

function formatErrors (errors) {
    if (!Array.isArray(errors)) {
        return ''
    }

    return errors.map(item => `${item.instancePath}: ${item.message}`).join(', ')
}

// Test the latest 2 versions of each platform
const latestConfigs = platforms.map((plat) => {
    return {
        name: `v4/${plat}-config.json`,
        body: JSON.parse(fs.readFileSync(`./generated/v4/${plat}-config.json`))
    }
})

const previousConfigs = platforms.map((plat) => {
    return {
        name: `v3/${plat}-config.json`,
        body: JSON.parse(fs.readFileSync(`./generated/v3/${plat}-config.json`))
    }
})

describe('Config schema tests', () => {
    const rootSchema = JSON.parse(fs.readFileSync('./tests/schemas/root.json'))
    const validateRoot = ajv.compile(rootSchema)
    const featureSchema = JSON.parse(fs.readFileSync('./tests/schemas/feature.json'))
    const validateFeature = ajv.compile(featureSchema)
    const exceptionSchema = JSON.parse(fs.readFileSync('./tests/schemas/exception.json'))
    const validateException = ajv.compile(exceptionSchema)
    const exceptionSchemav4 = JSON.parse(fs.readFileSync('./tests/schemas/exception-v4.json'))
    const validateExceptionv4 = ajv.compile(exceptionSchemav4)

    for (const config of latestConfigs) {
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
                        expect(validateExceptionv4(exception)).to.be.equal(true, `Feature ${featureKey}: ` + formatErrors(validateException.errors))
                    }
                }

                for (const exception of config.body.unprotectedTemporary) {
                    expect(validateExceptionv4(exception)).to.be.equal(true, 'unprotectedTemporary: ' + formatErrors(validateException.errors))
                }
            })

            // appTrackerProtection should only be on the Android config since it is a large feature
            const shouldContainAppTP = (config.name.split('/')[1] === 'android-config.json')
            it('should contain appTrackerProtection or not', () => {
                expect('appTrackerProtection' in config.body.features).to.be.equal(shouldContainAppTP, `appTrackerProtection expected: ${shouldContainAppTP}`)
            })
        })
    }

    for (const config of previousConfigs) {
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

            // appTrackerProtection should only be on the Android config since it is a large feature
            const shouldContainAppTP = (config.name.split('/')[1] === 'android-config.json')
            it('should contain appTrackerProtection or not', () => {
                expect('appTrackerProtection' in config.body.features).to.be.equal(shouldContainAppTP, `appTrackerProtection expected: ${shouldContainAppTP}`)
            })
        })
    }
})
