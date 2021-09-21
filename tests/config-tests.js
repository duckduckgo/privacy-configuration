const expect = require('chai').expect
const schema = require('./schema.js')
const Ajv = require('ajv').default
const ajv = new Ajv()
const fs = require('fs')

const platforms = [
    'extension',
    'ios',
    'android',
    'macos',
    'windows'
]

const configs = platforms.map((plat) => {
    return JSON.parse(fs.readFileSync(`./generated/${plat}-config.json`))
})

describe('Data schema tests', () => {
    it('should have a valid root schema', () => {
        for (const config of configs) {
            expect(ajv.validate(schema.root, config)).to.be.equal(true)
        }
    })

    it('should have a vaild feature schema', () => {
        for (const config of configs) {
            for (const featureKey of Object.keys(config.features)) {
                expect(ajv.validate(schema.feature, config.features[featureKey])).to.be.equal(true)
            }
        }
    })

    it('should have valid exception lists', () => {
        for (const config of configs) {
            for (const featureKey of Object.keys(config.features)) {
                for (const exception of config.features[featureKey].exceptions) {
                    expect(ajv.validate(schema.exception, exception)).to.be.equal(true)
                }
            }

            for (const exception of config.unprotectedTemporary) {
                expect(ajv.validate(schema.exception, exception)).to.be.equal(true)
            }
        }
    })
})
