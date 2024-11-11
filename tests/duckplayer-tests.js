const expect = require('chai').expect
const fs = require('fs')
const { createValidator, formatErrors } = require('./schema-validation')

describe('Duck Player Settings Tests', () => {
    const validateRoot = createValidator('DuckPlayerSettings')

    it('validates the duckplayer settings in `./generated/v4/macos-config.json`', () => {
        const macosConfig = JSON.parse(fs.readFileSync('./generated/v4/macos-config.json', 'utf8'))
        const actual = validateRoot(macosConfig.features.duckPlayer.settings)
        expect(actual).to.be.equal(true, formatErrors(validateRoot.errors))
    })
    it('validates the duckplayer settings in `./generated/v4/windows-config.json`', () => {
        const windowsConfig = JSON.parse(fs.readFileSync('./generated/v4/windows-config.json', 'utf8'))
        const actual = validateRoot(windowsConfig.features.duckPlayer.settings)
        expect(actual).to.be.equal(true, formatErrors(validateRoot.errors))
    })
})
