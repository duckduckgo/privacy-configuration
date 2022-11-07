const expect = require('chai').expect

const { addAllowlistRule, addCnameEntriesToAllowlist, inlineReasonArrays, mergeAllowlistedTrackers, addHashToFeatures } = require('../util')

const ta1 = {
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

const ta2 = {
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

// combined expected result
const ta1plus2 = {
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

describe('mergeAllowlistedTrackers', () => {
    it('should be able to perform a basic merge', () => {
        expect(mergeAllowlistedTrackers(ta1, ta2)).to.deep.equal(ta1plus2)
    })
    it('should sort merged domain keys', () => {
        expect(Object.keys(mergeAllowlistedTrackers({
            f2: { rules: [] }, f4: { rules: [] }
        }, {
            f1: { rules: [] }, f3: { rules: [] }
        }))).to.deep.equal(['f1', 'f2', 'f3', 'f4'])
    })
    it('is idempotent', () => {
        const gen = () => ({ 'simple.com': { rules: [{ rule: 'really.simple.com/foo', domains: ['domain1.com'], reason: 'Simple reason' }] } })
        expect(mergeAllowlistedTrackers(gen(), gen())).to.deep.equal(gen())
    })
})

const mkRule = (rulePath, domains, reason) => {
    return {
        rule: rulePath,
        domains: domains || ['<all>'],
        reason: reason || ''
    }
}

describe('addAllowlistRule', () => {
    let allowlist
    beforeEach(() => {
        allowlist = {}
    })
    it('should add single entry', () => {
        addAllowlistRule(allowlist, { rule: 'really.simple.com/foo', domains: ['domain1.com'], reason: 'Simple reason' })
        expect(allowlist).to.deep.equal({ 'simple.com': { rules: [{ rule: 'really.simple.com/foo', domains: ['domain1.com'], reason: 'Simple reason' }] } })
    })
    it('identifies true base domain', () => {
        addAllowlistRule(allowlist, { rule: 'really.simple.co.uk/foo', domains: ['domain1.com'], reason: 'Simple reason' })
        expect(Object.keys(allowlist)).to.deep.equal(['simple.co.uk'])
    })
    it('should be idempotent', () => {
        addAllowlistRule(allowlist, { rule: 'really.simple.com/foo', domains: ['domain1.com'], reason: 'Simple reason' })
        addAllowlistRule(allowlist, { rule: 'really.simple.com/foo', domains: ['domain1.com'], reason: 'Simple reason' })
        expect(allowlist).to.deep.equal({ 'simple.com': { rules: [{ rule: 'really.simple.com/foo', domains: ['domain1.com'], reason: 'Simple reason' }] } })
    })
    it('does not add duplicate reason', () => {
        addAllowlistRule(allowlist, { rule: 'really.simple.com/foo', domains: ['domain1.com'], reason: 'Simple reason 1' })
        addAllowlistRule(allowlist, { rule: 'really.simple.com/foo', domains: ['domain1.com'], reason: 'Simple reason 2' })
        addAllowlistRule(allowlist, { rule: 'really.simple.com/foo', domains: ['domain1.com'], reason: 'Simple reason 2' })
        expect(allowlist).to.deep.equal({ 'simple.com': { rules: [{ rule: 'really.simple.com/foo', domains: ['domain1.com'], reason: 'Simple reason 1; Simple reason 2' }] } })
    })
    describe('<all> domain is absorbing', () => {
        it('adding domain to <all> is <all>', () => {
            addAllowlistRule(allowlist, mkRule('really.simple.com/foo', ['<all>']))
            addAllowlistRule(allowlist, mkRule('really.simple.com/foo', ['domain.com']))
            expect(allowlist['simple.com'].rules[0].domains).to.deep.equal(['<all>'])
        })
        it('adding <all> to domain is <all>', () => {
            addAllowlistRule(allowlist, mkRule('really.simple.com/foo', ['domain.com']))
            addAllowlistRule(allowlist, mkRule('really.simple.com/foo', ['<all>']))
            expect(allowlist['simple.com'].rules[0].domains).to.deep.equal(['<all>'])
        })
    })
    it('should merge domains and reasons', () => {
        addAllowlistRule(allowlist, { rule: 'really.simple.com/foo', domains: ['domain1.com'], reason: 'Simple reason 1' })
        addAllowlistRule(allowlist, { rule: 'really.simple.com/foo', domains: ['domain2.com'], reason: 'Simple reason 2' })
        expect(allowlist).to.deep.equal({ 'simple.com': { rules: [{ rule: 'really.simple.com/foo', domains: ['domain1.com', 'domain2.com'], reason: 'Simple reason 1; Simple reason 2' }] } })
    })
})

describe('addCnameEntriesToAllowlist', () => {
    const tds = { cnames: { 'tracker.simple.com': 'simple.tracker.com', 'tracker.simple2.com': 'simple2.tracker.com' } }
    it('adds only specific domains when full CNAME domain specified', () => {
        const allowlist = {}
        addAllowlistRule(allowlist, mkRule('simple.tracker.com/request'))
        addCnameEntriesToAllowlist(tds, allowlist)
        expect(Object.keys(allowlist)).to.deep.equal(['tracker.com', 'simple.com'])
    })
    it('if domains are specified, exempts only on specified domains', () => {
        const allowlist = {}
        addAllowlistRule(allowlist, mkRule('simple.tracker.com/request', ['domain.com']))
        addCnameEntriesToAllowlist(tds, allowlist)
        expect(allowlist['simple.com'].rules[0].domains).to.deep.equal(['domain.com'])
    })
    it('merges with existing entry', () => {
        const allowlist = {}
        addAllowlistRule(allowlist, mkRule('tracker.simple.com/request', ['domain1.com']))
        addAllowlistRule(allowlist, mkRule('simple.tracker.com/request', ['domain2.com']))
        addCnameEntriesToAllowlist(tds, allowlist)
        expect(allowlist['simple.com'].rules[0].domains).to.deep.equal(['domain1.com', 'domain2.com'])
    })
    it('adds all domains when partial CNAME domain specified', () => {
        const allowlist = {}
        addAllowlistRule(allowlist, mkRule('tracker.com/request'))
        addCnameEntriesToAllowlist(tds, allowlist)
        expect(Object.keys(allowlist)).to.deep.equal(['tracker.com', 'simple.com', 'simple2.com'])
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

describe('addHashToFeatures', () => {
    const testConfigStr = `{
        "features": {
            "testFeature": {
                "exceptions": [],
                "settings": {
                    "setting1": 123,
                    "setting2": "some setting"
                },
                "state": "enabled"
            }
        }
    }`
    it('should generate correct hash', () => {
        const testConfig = JSON.parse(testConfigStr)
        addHashToFeatures(testConfig)
        expect(testConfig.features.testFeature.hash).to.be.equal('28ea3a50d97a1e3eada2b8666b096e40')
    })
    it('should update hash', () => {
        const testConfig = JSON.parse(testConfigStr)
        testConfig.features.testFeature.settings.setting1 = 456
        addHashToFeatures(testConfig)
        expect(testConfig.features.testFeature.hash).to.be.equal('91f8efc44dcd8f708619421e045120c4')
    })
})
