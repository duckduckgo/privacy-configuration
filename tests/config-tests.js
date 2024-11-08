const expect = require('chai').expect
const Ajv = require('ajv').default
const ajv = new Ajv()
const fs = require('fs')
const createGenerator = require('ts-json-schema-generator').createGenerator
const platforms = require('./../platforms').map(item => item.replace('browsers/', 'extension-'))

function formatErrors (errors) {
    if (!Array.isArray(errors)) {
        return ''
    }

    return errors.map(item => `${item.instancePath}: ${item.message}`).join(', ')
}

const platformSpecificSchemas = {
    'v4/android-config.json': 'AndroidV4Config'
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
    const fullSchemaGenerator = createGenerator({
        path: './schema/config.d.ts'
    })

    for (const config of latestConfigs) {
        describe(`${config.name}`, () => {
            // appTrackerProtection should only be on the Android config since it is a large feature
            const shouldContainAppTP = (config.name.split('/')[1] === 'android-config.json')
            it('should contain appTrackerProtection or not', () => {
                expect('appTrackerProtection' in config.body.features).to.be.equal(shouldContainAppTP, `appTrackerProtection expected: ${shouldContainAppTP}`)
            })

            it('should validate against the full configV4 schema', () => {
                const schema = fullSchemaGenerator.createSchema(platformSpecificSchemas[config.name] || 'GenericV4Config')
                const validate = ajv.compile(schema)
                expect(validate(config.body)).to.be.equal(true, formatErrors(validate.errors))
            })
        })
    }

    for (const config of previousConfigs) {
        describe(`${config.name}`, () => {
            // appTrackerProtection should only be on the Android config since it is a large feature
            const shouldContainAppTP = (config.name.split('/')[1] === 'android-config.json')
            it('should contain appTrackerProtection or not', () => {
                expect('appTrackerProtection' in config.body.features).to.be.equal(shouldContainAppTP, `appTrackerProtection expected: ${shouldContainAppTP}`)
            })

            it('should validate against the full configLegacy schema', () => {
                const schema = fullSchemaGenerator.createSchema(platformSpecificSchemas[config.name] || 'GenericV4Config')
                const validate = ajv.compile(schema)
                expect(validate(config.body)).to.be.equal(true, formatErrors(validate.errors))
            })
        })
    }
})
