const expect = require('chai').expect
const Ajv = require('ajv').default
const ajv = new Ajv()
const fs = require('fs')
const platforms = require('./../platforms').map(item => item.replace('browsers/', 'extension-'))

const generateConfigUsingOverride = require('./../index').generateConfigUsingOverride

function formatErrors (errors) {
    if (!Array.isArray(errors)) {
        return ''
    }

    return errors.map(item => `${item.instancePath}: ${item.message}`).join(', ')
}

const v2configs = platforms.map((plat) => {
    return {
        name: `${plat}-config.json`,
        body: JSON.parse(fs.readFileSync(`./generated/v2/${plat}-config.json`))
    }
})

const v1configs = platforms.map((plat) => {
    return {
        name: `${plat}-config.json`,
        body: JSON.parse(fs.readFileSync(`./generated/v1/${plat}-config.json`))
    }
})

describe('Config schema tests', () => {
    const rootSchema = JSON.parse(fs.readFileSync('./tests/schemas/root.json'))
    const validateRoot = ajv.compile(rootSchema)
    const featureSchema = JSON.parse(fs.readFileSync('./tests/schemas/feature.json'))
    const validateFeature = ajv.compile(featureSchema)
    const exceptionSchema = JSON.parse(fs.readFileSync('./tests/schemas/exception.json'))
    const validateException = ajv.compile(exceptionSchema)

    for (const config of v2configs.concat(v1configs)) {
        describe(`${config.name}`, () => {
            if (config.name === 'extension-config.json') {
                it('legacy unprotected temporary include content blocking exceptions', () => {
                    const exceptions = config.body.features.contentBlocking.exceptions.map(item => item.domain)
                    const unprotectedTemporary = fs.readFileSync('./generated/trackers-unprotected-temporary.txt').toString().split('\n')

                    expect(unprotectedTemporary).to.be.an('array')
                    expect(unprotectedTemporary.length).to.be.above(0)
                    expect(unprotectedTemporary).to.include.members(exceptions)
                })
            }

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

describe('Deep merge tests', () => {
    it('Should merge nested settings objects', () => {
        const config = {
            features: {
                cookie: {
                    state: 'enabled',
                    exceptions: [],
                    settings: {
                        trackerCookie: 'disabled',
                        nonTrackerCookie: 'disabled',
                        excludedDomains: [
                            {
                                domain: 'example.com',
                                reason: 'site breakage'
                            }
                        ]
                    }
                }
            },
            unprotectedTemporary: []
        }

        const override = {
            features: {
                cookie: {
                    settings: {
                        trackerCookie: 'enabled',
                        excludedDomains: [
                            {
                                domain: 'example2.com',
                                reason: 'site breakage'
                            }
                        ]
                    }
                }
            },
            unprotectedTemporary: []
        }

        const expected = {
            features: {
                cookie: {
                    state: 'enabled',
                    exceptions: [],
                    settings: {
                        trackerCookie: 'enabled',
                        nonTrackerCookie: 'disabled',
                        excludedDomains: [
                            {
                                domain: 'example.com',
                                reason: 'site breakage'
                            },
                            {
                                domain: 'example2.com',
                                reason: 'site breakage'
                            }
                        ]
                    }
                }
            },
            unprotectedTemporary: []
        }

        generateConfigUsingOverride(config, override)

        expect(config).to.deep.equal(expected)
    })

    it('Should merge feature exception lists', () => {
        const config = {
            features: {
                cookie: {
                    state: 'enabled',
                    exceptions: [
                        {
                            domain: 'foo.com',
                            reason: 'site breakage'
                        }
                    ],
                    settings: {
                        trackerCookie: 'disabled',
                        nonTrackerCookie: 'disabled',
                        excludedDomains: [
                            {
                                domain: 'example.com',
                                reason: 'site breakage'
                            }
                        ]
                    }
                }
            },
            unprotectedTemporary: []
        }

        const override = {
            features: {
                cookie: {
                    exceptions: [
                        {
                            domain: 'example.com',
                            reason: 'site breakage'
                        },
                        {
                            domain: 'example2.com',
                            reason: 'site breakage'
                        }
                    ]
                }
            },
            unprotectedTemporary: []
        }

        const expected = {
            features: {
                cookie: {
                    state: 'enabled',
                    exceptions: [
                        {
                            domain: 'foo.com',
                            reason: 'site breakage'
                        },
                        {
                            domain: 'example.com',
                            reason: 'site breakage'
                        },
                        {
                            domain: 'example2.com',
                            reason: 'site breakage'
                        }
                    ],
                    settings: {
                        trackerCookie: 'disabled',
                        nonTrackerCookie: 'disabled',
                        excludedDomains: [
                            {
                                domain: 'example.com',
                                reason: 'site breakage'
                            }
                        ]
                    }
                }
            },
            unprotectedTemporary: []
        }

        generateConfigUsingOverride(config, override)

        expect(config).to.deep.equal(expected)
    })
})
