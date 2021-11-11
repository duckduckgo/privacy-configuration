const expect = require('chai').expect
const Ajv = require('ajv').default
const ajv = new Ajv()
const fs = require('fs')
const platforms = require('./../platforms')

const configs = platforms.map((plat) => {
    return JSON.parse(fs.readFileSync(`./generated/${plat}-config.json`))
})

describe('Config schema tests', () => {
    it('should have a valid root schema', () => {
        const schema = JSON.parse(fs.readFileSync('./tests/schemas/root.json'))
        for (const config of configs) {
            expect(ajv.validate(schema, config)).to.be.equal(true)
        }
    })

    it('should have a vaild feature schema', () => {
        const schema = JSON.parse(fs.readFileSync('./tests/schemas/feature.json'))
        for (const config of configs) {
            for (const featureKey in config.features) {
                expect(ajv.validate(schema, config.features[featureKey])).to.be.equal(true, `Feature ${featureKey} is not valid.`)
            }
        }
    })

    it('should have valid exception lists', () => {
        const schema = JSON.parse(fs.readFileSync('./tests/schemas/exception.json'))
        for (const config of configs) {
            for (const featureKey in config.feature) {
                for (const exception of config.features[featureKey].exceptions) {
                    expect(ajv.validate(schema, exception)).to.be.equal(true)
                }
            }

            for (const exception of config.unprotectedTemporary) {
                expect(ajv.validate(schema, exception)).to.be.equal(true)
            }
        }
    })
})
