const expect = require('chai').expect

const generateConfigUsingOverride = require('./../index').generateConfigUsingOverride
const { mergeAllowlistedTrackers, inlineReasonArrays } = require('../util')

const ta1 = {
    features: {
        trackerAllowlist: {
            state: 'enabled',
            exceptions: [],
            settings: {
                allowlistedTrackers: {
                    'f1.com': {
                        rules: [
                            {
                                rule: 'www.f1.com/foo/bar',
                                domains: [
                                    'dom1.com',
                                    'dom2.net'
                                ],
                                reason: 'Reason1.'
                            },
                            {
                                rule: 'www.f1.com/bar',
                                domains: [
                                    'dom1.com'
                                ],
                                reason: 'Reason1.'
                            }
                        ]
                    },
                    'f2.com': { // in ta1 not ta2
                        rules: [
                            {
                                rule: 'f2.com/foo',
                                domains: [
                                    'dom1.com',
                                    'dom0.com', // should get moved to start (lexical ordering)
                                    'dom1.com' // duplicate should be removed
                                ],
                                reason: 'Reason1.'
                            }
                        ]
                    },
                    'f4.com': {
                        rules: [
                            {
                                rule: 'f4.com/foo',
                                domains: [
                                    'dom1.com'
                                ],
                                reason: 'Reason1.'
                            },
                            {
                                rule: 'f4.com/foo.bar', // more specific, so should get put earler
                                domains: [
                                    'dom1.com'
                                ],
                                reason: 'Reason1.'
                            }
                        ]
                    }
                }
            }
        }
    }
}

const ta2 = {
    features: {
        trackerAllowlist: {
            settings: {
                allowlistedTrackers: {
                    'f1.com': {
                        rules: [
                            {
                                rule: 'www.f1.com/foo/bar',
                                domains: [
                                    'dom1.com', // overlaps
                                    'dom3.net', // new domain
                                    'dom0.com' // should get moved to start (lexical ordering)
                                ],
                                reason: 'Reason2.'
                            },
                            {
                                rule: 'www.f1.com/foo', // new rule
                                domains: [
                                    'dom1.com',
                                    'dom0.com' // should be sorted in output
                                ],
                                reason: 'Reason1.'
                            }
                        ]
                    },
                    'f3.com': { // in ta2 not ta1
                        rules: [
                            {
                                rule: 'f3.com/foo',
                                domains: [
                                    'dom1.com',
                                    'dom0.com', // should be sorted in output
                                    'dom1.com' // duplicate should be removed
                                ],
                                reason: 'Reason1.'
                            }
                        ]
                    }
                }
            }
        }
    }
}

// combined expected result
const ta1plus2 = {
    features: {
        trackerAllowlist: {
            state: 'enabled',
            exceptions: [],
            settings: {
                allowlistedTrackers: {
                    'f1.com': {
                        rules: [
                            {
                                rule: 'www.f1.com/foo/bar',
                                domains: [
                                    'dom0.com',
                                    'dom1.com',
                                    'dom2.net',
                                    'dom3.net'
                                ],
                                reason: 'Reason1.; Reason2.'
                            },
                            {
                                rule: 'www.f1.com/bar',
                                domains: [
                                    'dom1.com'
                                ],
                                reason: 'Reason1.'
                            },
                            {
                                rule: 'www.f1.com/foo',
                                domains: [
                                    'dom0.com',
                                    'dom1.com'
                                ],
                                reason: 'Reason1.'
                            }
                        ]
                    },
                    'f2.com': {
                        rules: [
                            {
                                rule: 'f2.com/foo',
                                domains: [
                                    'dom0.com',
                                    'dom1.com'
                                ],
                                reason: 'Reason1.'
                            }
                        ]
                    },
                    'f3.com': {
                        rules: [
                            {
                                rule: 'f3.com/foo',
                                domains: [
                                    'dom0.com',
                                    'dom1.com'
                                ],
                                reason: 'Reason1.'
                            }
                        ]
                    },
                    'f4.com': {
                        rules: [
                            {
                                rule: 'f4.com/foo.bar',
                                domains: [
                                    'dom1.com'
                                ],
                                reason: 'Reason1.'
                            },
                            {
                                rule: 'f4.com/foo',
                                domains: [
                                    'dom1.com'
                                ],
                                reason: 'Reason1.'
                            }
                        ]
                    }
                }
            }
        }
    }
}

describe('mergeAllowlistedTrackers', () => {
    it('should be able to perform a basic merge', () => {
        generateConfigUsingOverride(ta1, ta2)
        expect(ta1).to.deep.equal(ta1plus2)
    })

    it('should sort merged domain keys', () => {
        expect(Object.keys(mergeAllowlistedTrackers({
            f2: { rules: [] }, f4: { rules: [] }
        }, {
            f1: { rules: [] }, f3: { rules: [] }
        }))).to.deep.equal(['f1', 'f2', 'f3', 'f4'])
    })
})

describe('inlineReasonArrays', () => {
    it('simple object with array reason', () => {
        expect(inlineReasonArrays({ reason: ['reason1', 'reason2'] })).to.deep.equal({ reason: 'reason1 reason2' })
    })
    it('simple object with empty array reason', () => {
        expect(inlineReasonArrays({ reason: [] })).to.deep.equal({ reason: '' })
    })
    it("doesn't merge non-reason arrays", () => {
        expect(inlineReasonArrays({ nonreason: ['nonreason1', 'nonreason2'] })).to.deep.equal({ nonreason: ['nonreason1', 'nonreason2'] })
    })
    it('simple object with string reason', () => {
        expect(inlineReasonArrays({ reason: 'simple reason' })).to.deep.equal({ reason: 'simple reason' })
    })
    it('nested in array', () => {
        expect(inlineReasonArrays([{ reason: ['reason1', 'reason2'] }])).to.deep.equal([{ reason: 'reason1 reason2' }])
    })
    it('nested in object', () => {
        expect(inlineReasonArrays({ exceptions: { reason: ['reason1', 'reason2'] } })).to.deep.equal({ exceptions: { reason: 'reason1 reason2' } })
    })
    it('null', () => {
        expect(inlineReasonArrays(null)).to.equal(null)
    })
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
