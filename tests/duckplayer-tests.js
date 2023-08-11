const expect = require('chai').expect
const fs = require('fs')

describe('Duck Player Settings Tests', () => {
    const Ajv = require('ajv').default
    const ajv = new Ajv()
    const rootSchema = JSON.parse(fs.readFileSync('./tests/schemas/duckplayer-settings.json', 'utf8'))
    const validateRoot = ajv.compile(rootSchema)

    it('validates the duckplayer settings in `./generated/v2/macos-config.json`', () => {
        const macosConfig = JSON.parse(fs.readFileSync('./generated/v2/macos-config.json', 'utf8'))
        const actual = validateRoot(macosConfig.features.duckPlayer.settings)
        if (validateRoot.errors) {
            for (const error of validateRoot.errors) {
                console.error(error)
            }
        }
        expect(actual).to.be.equal(true)
    })
    it('validates the duckplayer settings in `./generated/v2/windows-config.json`', () => {
        const windowsConfig = JSON.parse(fs.readFileSync('./generated/v2/windows-config.json', 'utf8'))
        const actual = validateRoot(windowsConfig.features.duckPlayer.settings)
        if (validateRoot.errors) {
            for (const error of validateRoot.errors) {
                console.error(error)
            }
        }
        expect(actual).to.be.equal(true)
    })
})
