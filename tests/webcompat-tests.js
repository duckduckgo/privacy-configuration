const expect = require('chai').expect
const fs = require('fs')
const Ajv = require('ajv').default
const ajv = new Ajv()
const rootSchema = JSON.parse(fs.readFileSync('./tests/schemas/webcompat-settings.json', 'utf8'))
const validateRoot = ajv.compile(rootSchema)

const platforms = ['macos', 'ios', 'android']
const latestConfigs = platforms.map((plat) => {
    return {
        name: `v4/${plat}-config.json`,
        body: JSON.parse(fs.readFileSync(`./generated/v4/${plat}-config.json`))
    }
})

for (const config of latestConfigs) {
    describe(`validates the config settings for ${config.name}`, () => {
        it('should have valid webCompat setting', () => {
            const actual = validateRoot(config.body.features.webCompat.settings)
            if (validateRoot.errors) {
                for (const error of validateRoot.errors) {
                    console.error(error)
                }
            }
            expect(actual).to.be.equal(true)
        })
    })
}
