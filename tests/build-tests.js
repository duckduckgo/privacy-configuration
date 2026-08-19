import { expect } from 'chai';
import {
    addAllowlistRule,
    addCnameEntriesToAllowlist,
    inlineReasonArrays,
    mergeAllowlistedTrackers,
    mergeEventHubTelemetry,
    mergeInterferenceTypes,
    addHashToFeatures,
    addUnprotectedTemporaryUserAgentMitigations,
} from '../util.js';

const ta1 = {
    'f1.com': {
        rules: [
            {
                rule: 'www.f1.com/foo/bar',
                domains: [
                    'dom1.com',
                    'dom2.net',
                ],
                reason: 'Reason1.',
            },
            {
                rule: 'www.f1.com/bar',
                domains: [
                    'dom1.com',
                ],
                reason: 'Reason1.',
            },
        ],
    },
    'f2.com': {
        // in ta1 not ta2
        rules: [
            {
                rule: 'f2.com/foo',
                domains: [
                    'dom1.com',
                    'dom0.com', // should get moved to start (lexical ordering)
                    'dom1.com', // duplicate should be removed
                ],
                reason: 'Reason1.',
            },
        ],
    },
    'f4.com': {
        rules: [
            {
                rule: 'f4.com/foo',
                domains: [
                    'dom1.com',
                ],
                reason: 'Reason1.',
            },
            {
                rule: 'f4.com/foo.bar', // more specific, so should get put earler
                domains: [
                    'dom1.com',
                ],
                reason: 'Reason1.',
            },
        ],
    },
};

const ta2 = {
    'f1.com': {
        rules: [
            {
                rule: 'www.f1.com/foo/bar',
                domains: [
                    'dom1.com', // overlaps
                    'dom3.net', // new domain
                    'dom0.com', // should get moved to start (lexical ordering)
                ],
                reason: 'Reason2.',
            },
            {
                rule: 'www.f1.com/foo', // new rule
                domains: [
                    'dom1.com',
                    'dom0.com', // should be sorted in output
                ],
                reason: 'Reason1.',
            },
        ],
    },
    'f3.com': {
        // in ta2 not ta1
        rules: [
            {
                rule: 'f3.com/foo',
                domains: [
                    'dom1.com',
                    'dom0.com', // should be sorted in output
                    'dom1.com', // duplicate should be removed
                ],
                reason: 'Reason1.',
            },
        ],
    },
};

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
                    'dom3.net',
                ],
                reason: 'Reason1.; Reason2.',
            },
            {
                rule: 'www.f1.com/bar',
                domains: [
                    'dom1.com',
                ],
                reason: 'Reason1.',
            },
            {
                rule: 'www.f1.com/foo',
                domains: [
                    'dom0.com',
                    'dom1.com',
                ],
                reason: 'Reason1.',
            },
        ],
    },
    'f2.com': {
        rules: [
            {
                rule: 'f2.com/foo',
                domains: [
                    'dom0.com',
                    'dom1.com',
                ],
                reason: 'Reason1.',
            },
        ],
    },
    'f3.com': {
        rules: [
            {
                rule: 'f3.com/foo',
                domains: [
                    'dom0.com',
                    'dom1.com',
                ],
                reason: 'Reason1.',
            },
        ],
    },
    'f4.com': {
        rules: [
            {
                rule: 'f4.com/foo.bar',
                domains: [
                    'dom1.com',
                ],
                reason: 'Reason1.',
            },
            {
                rule: 'f4.com/foo',
                domains: [
                    'dom1.com',
                ],
                reason: 'Reason1.',
            },
        ],
    },
};

describe('mergeAllowlistedTrackers', () => {
    it('should be able to perform a basic merge', () => {
        expect(mergeAllowlistedTrackers(ta1, ta2)).to.deep.equal(ta1plus2);
    });
    it('should sort merged domain keys', () => {
        expect(
            Object.keys(
                mergeAllowlistedTrackers(
                    {
                        f2: { rules: [] },
                        f4: { rules: [] },
                    },
                    {
                        f1: { rules: [] },
                        f3: { rules: [] },
                    },
                ),
            ),
        ).to.deep.equal([
            'f1',
            'f2',
            'f3',
            'f4',
        ]);
    });
    it('is idempotent', () => {
        const gen = () => ({
            'simple.com': {
                rules: [
                    {
                        rule: 'really.simple.com/foo',
                        domains: [
                            'domain1.com',
                        ],
                        reason: 'Simple reason',
                    },
                ],
            },
        });
        expect(mergeAllowlistedTrackers(gen(), gen())).to.deep.equal(gen());
    });
});

describe('mergeEventHubTelemetry', () => {
    const baseEntry = (source) => ({
        state: 'enabled',
        trigger: { period: { days: 1 } },
        parameters: { count: { template: 'counter', source, buckets: { 0: { gte: 0 } } } },
    });

    it('inherits base entries not present in the override', () => {
        const base = { base_pixel_day: baseEntry('base') };
        const override = { override_pixel_day: baseEntry('override') };
        expect(mergeEventHubTelemetry(base, override)).to.deep.equal({
            base_pixel_day: baseEntry('base'),
            override_pixel_day: baseEntry('override'),
        });
    });

    it('lets the override replace a base entry with the same key', () => {
        const base = { shared_pixel_day: baseEntry('base') };
        const override = { shared_pixel_day: baseEntry('override') };
        expect(mergeEventHubTelemetry(base, override)).to.deep.equal({
            shared_pixel_day: baseEntry('override'),
        });
    });

    it('replaces matching keys wholesale rather than deep-merging them', () => {
        const base = {
            shared_pixel_day: {
                state: 'enabled',
                trigger: { period: { days: 1 } },
                parameters: {
                    a: { template: 'counter', source: 'a', buckets: { 0: { gte: 0 } } },
                    b: { template: 'counter', source: 'b', buckets: { 0: { gte: 0 } } },
                },
            },
        };
        const override = {
            shared_pixel_day: {
                state: 'enabled',
                trigger: { period: { days: 7 } },
                parameters: { a: { template: 'counter', source: 'a', buckets: { 0: { gte: 0 } } } },
            },
        };
        // The override entry wins entirely — parameter `b` from the base is not carried over.
        expect(mergeEventHubTelemetry(base, override)).to.deep.equal(override);
    });

    it('returns base entries unchanged when the override is empty', () => {
        const base = { base_pixel_day: baseEntry('base') };
        expect(mergeEventHubTelemetry(base, {})).to.deep.equal(base);
    });
});

describe('mergeInterferenceTypes', () => {
    const baseType = (interval) => ({
        state: 'enabled',
        sweepIntervalMs: interval,
        playerSelectors: [
            '#player',
        ],
    });

    it('inherits base types not present in the override', () => {
        const base = { adwallDetection: baseType(1000) };
        const override = { youtubeAds: baseType(2000) };
        expect(mergeInterferenceTypes(base, override)).to.deep.equal({
            adwallDetection: baseType(1000),
            youtubeAds: baseType(2000),
        });
    });

    it('lets the override replace a base type with the same key', () => {
        const base = { adwallDetection: baseType(1000) };
        const override = { adwallDetection: baseType(2000) };
        expect(mergeInterferenceTypes(base, override)).to.deep.equal({
            adwallDetection: baseType(2000),
        });
    });

    it('replaces matching keys wholesale rather than deep-merging them', () => {
        const base = {
            adwallDetection: {
                state: 'enabled',
                sweepIntervalMs: 1000,
                playerSelectors: [
                    '#player',
                    '#movie_player',
                ],
            },
        };
        const override = {
            adwallDetection: {
                state: 'enabled',
                sweepIntervalMs: 2000,
                playerSelectors: [
                    '#player',
                ],
            },
        };
        // The override type wins entirely — the extra base selector is not carried over.
        expect(mergeInterferenceTypes(base, override)).to.deep.equal(override);
    });

    it('returns base types unchanged when the override is empty', () => {
        const base = { adwallDetection: baseType(1000) };
        expect(mergeInterferenceTypes(base, {})).to.deep.equal(base);
    });
});

describe('addUnprotectedTemporaryUserAgentMitigations', () => {
    const exceptions = [
        {
            domain: 'global.example',
            reason: 'Global temporary mitigation',
        },
        {
            domain: 'platform.example',
            reason: 'Platform temporary mitigation',
        },
    ];

    it('adds Safari-like custom user-agent entries on iOS', () => {
        const config = {
            features: {
                customUserAgent: {
                    settings: {
                        ddgFixedSites: [
                            {
                                domain: 'global.example',
                                reason: 'Manual override',
                            },
                        ],
                        omitApplicationSites: [],
                    },
                },
            },
        };

        addUnprotectedTemporaryUserAgentMitigations('ios', config, exceptions);

        expect(config.features.customUserAgent.settings.ddgFixedSites).to.deep.equal([
            {
                domain: 'global.example',
                reason: 'Manual override',
            },
            {
                domain: 'platform.example',
                reason: 'Platform temporary mitigation',
            },
        ]);
        expect(config.features.customUserAgent.settings.omitApplicationSites).to.deep.equal(exceptions);
    });

    it('adds Safari-like custom user-agent entries on macOS', () => {
        const config = {
            features: {
                customUserAgent: {
                    settings: {
                        defaultSites: [],
                    },
                },
            },
        };

        addUnprotectedTemporaryUserAgentMitigations('macos', config, exceptions);

        expect(config.features.customUserAgent.settings.defaultSites).to.deep.equal(exceptions);
    });

    it('adds Chrome client-brand hints on Android', () => {
        const config = {
            features: {
                clientBrandHint: {
                    settings: {
                        domains: [
                            {
                                domain: 'global.example',
                                brand: 'DDG',
                            },
                        ],
                    },
                },
            },
        };

        addUnprotectedTemporaryUserAgentMitigations('android', config, exceptions);

        expect(config.features.clientBrandHint.settings.domains).to.deep.equal([
            {
                domain: 'global.example',
                brand: 'DDG',
            },
            {
                domain: 'platform.example',
                brand: 'CHROME',
            },
        ]);
    });

    it('adds Chrome client-hint entries on Windows', () => {
        const config = {
            features: {
                clientBrandHint: {
                    settings: {
                        domains: [],
                    },
                },
                uaChBrands: {
                    exceptions: [
                        {
                            domain: 'global.example',
                        },
                        {
                            domain: 'platform.example',
                        },
                    ],
                    settings: {
                        conditionalChanges: [
                            {
                                condition: {
                                    domain: 'global.example',
                                },
                                patchSettings: [
                                    {
                                        op: 'add',
                                        path: '/brandName',
                                        value: 'Google Chrome',
                                    },
                                ],
                            },
                        ],
                    },
                },
            },
        };

        addUnprotectedTemporaryUserAgentMitigations('windows', config, exceptions);

        expect(config.features.clientBrandHint.settings.domains).to.deep.equal([
            {
                domain: 'global.example',
                brand: 'Google Chrome',
            },
            {
                domain: 'platform.example',
                brand: 'Google Chrome',
            },
        ]);
        expect(config.features.uaChBrands.exceptions).to.deep.equal([]);
        expect(config.features.uaChBrands.settings.conditionalChanges).to.have.length(2);
    });
});

const mkRule = (rulePath, domains, reason) => {
    return {
        rule: rulePath,
        domains: domains || [
            '<all>',
        ],
        reason: reason || '',
    };
};

describe('addAllowlistRule', () => {
    let allowlist;
    beforeEach(() => {
        allowlist = {};
    });
    it('should add single entry', () => {
        addAllowlistRule(allowlist, {
            rule: 'really.simple.com/foo',
            domains: [
                'domain1.com',
            ],
            reason: 'Simple reason',
        });
        expect(allowlist).to.deep.equal({
            'simple.com': {
                rules: [
                    {
                        rule: 'really.simple.com/foo',
                        domains: [
                            'domain1.com',
                        ],
                        reason: 'Simple reason',
                    },
                ],
            },
        });
    });
    it('identifies true base domain', () => {
        addAllowlistRule(allowlist, {
            rule: 'really.simple.co.uk/foo',
            domains: [
                'domain1.com',
            ],
            reason: 'Simple reason',
        });
        expect(Object.keys(allowlist)).to.deep.equal([
            'simple.co.uk',
        ]);
    });
    it('should be idempotent', () => {
        addAllowlistRule(allowlist, {
            rule: 'really.simple.com/foo',
            domains: [
                'domain1.com',
            ],
            reason: 'Simple reason',
        });
        addAllowlistRule(allowlist, {
            rule: 'really.simple.com/foo',
            domains: [
                'domain1.com',
            ],
            reason: 'Simple reason',
        });
        expect(allowlist).to.deep.equal({
            'simple.com': {
                rules: [
                    {
                        rule: 'really.simple.com/foo',
                        domains: [
                            'domain1.com',
                        ],
                        reason: 'Simple reason',
                    },
                ],
            },
        });
    });
    it('does not add duplicate reason', () => {
        addAllowlistRule(allowlist, {
            rule: 'really.simple.com/foo',
            domains: [
                'domain1.com',
            ],
            reason: 'Simple reason 1',
        });
        addAllowlistRule(allowlist, {
            rule: 'really.simple.com/foo',
            domains: [
                'domain1.com',
            ],
            reason: 'Simple reason 2',
        });
        addAllowlistRule(allowlist, {
            rule: 'really.simple.com/foo',
            domains: [
                'domain1.com',
            ],
            reason: 'Simple reason 2',
        });
        expect(allowlist).to.deep.equal({
            'simple.com': {
                rules: [
                    {
                        rule: 'really.simple.com/foo',
                        domains: [
                            'domain1.com',
                        ],
                        reason: 'Simple reason 1; Simple reason 2',
                    },
                ],
            },
        });
    });
    describe('<all> domain is absorbing', () => {
        it('adding domain to <all> is <all>', () => {
            addAllowlistRule(
                allowlist,
                mkRule('really.simple.com/foo', [
                    '<all>',
                ]),
            );
            addAllowlistRule(
                allowlist,
                mkRule('really.simple.com/foo', [
                    'domain.com',
                ]),
            );
            expect(allowlist['simple.com'].rules[0].domains).to.deep.equal([
                '<all>',
            ]);
        });
        it('adding <all> to domain is <all>', () => {
            addAllowlistRule(
                allowlist,
                mkRule('really.simple.com/foo', [
                    'domain.com',
                ]),
            );
            addAllowlistRule(
                allowlist,
                mkRule('really.simple.com/foo', [
                    '<all>',
                ]),
            );
            expect(allowlist['simple.com'].rules[0].domains).to.deep.equal([
                '<all>',
            ]);
        });
    });
    it('should merge domains and reasons', () => {
        addAllowlistRule(allowlist, {
            rule: 'really.simple.com/foo',
            domains: [
                'domain1.com',
            ],
            reason: 'Simple reason 1',
        });
        addAllowlistRule(allowlist, {
            rule: 'really.simple.com/foo',
            domains: [
                'domain2.com',
            ],
            reason: 'Simple reason 2',
        });
        expect(allowlist).to.deep.equal({
            'simple.com': {
                rules: [
                    {
                        rule: 'really.simple.com/foo',
                        domains: [
                            'domain1.com',
                            'domain2.com',
                        ],
                        reason: 'Simple reason 1; Simple reason 2',
                    },
                ],
            },
        });
    });
});

describe('addCnameEntriesToAllowlist', () => {
    const tds = { cnames: { 'tracker.simple.com': 'simple.tracker.com', 'tracker.simple2.com': 'simple2.tracker.com' } };
    it('adds only specific domains when full CNAME domain specified', () => {
        const allowlist = {};
        addAllowlistRule(allowlist, mkRule('simple.tracker.com/request'));
        addCnameEntriesToAllowlist(tds, allowlist);
        expect(Object.keys(allowlist)).to.deep.equal([
            'tracker.com',
            'simple.com',
        ]);
    });
    it('if domains are specified, exempts only on specified domains', () => {
        const allowlist = {};
        addAllowlistRule(
            allowlist,
            mkRule('simple.tracker.com/request', [
                'domain.com',
            ]),
        );
        addCnameEntriesToAllowlist(tds, allowlist);
        expect(allowlist['simple.com'].rules[0].domains).to.deep.equal([
            'domain.com',
        ]);
    });
    it('merges with existing entry', () => {
        const allowlist = {};
        addAllowlistRule(
            allowlist,
            mkRule('tracker.simple.com/request', [
                'domain1.com',
            ]),
        );
        addAllowlistRule(
            allowlist,
            mkRule('simple.tracker.com/request', [
                'domain2.com',
            ]),
        );
        addCnameEntriesToAllowlist(tds, allowlist);
        expect(allowlist['simple.com'].rules[0].domains).to.deep.equal([
            'domain1.com',
            'domain2.com',
        ]);
    });
    it('adds all domains when partial CNAME domain specified', () => {
        const allowlist = {};
        addAllowlistRule(allowlist, mkRule('tracker.com/request'));
        addCnameEntriesToAllowlist(tds, allowlist);
        expect(Object.keys(allowlist)).to.deep.equal([
            'tracker.com',
            'simple.com',
            'simple2.com',
        ]);
    });
});

describe('inlineReasonArrays', () => {
    it('simple object with array reason', () => {
        expect(
            inlineReasonArrays({
                reason: [
                    'reason1',
                    'reason2',
                ],
            }),
        ).to.deep.equal({ reason: 'reason1 reason2' });
    });
    it('simple object with empty array reason', () => {
        expect(inlineReasonArrays({ reason: [] })).to.deep.equal({ reason: '' });
    });
    it("doesn't merge non-reason arrays", () => {
        expect(
            inlineReasonArrays({
                nonreason: [
                    'nonreason1',
                    'nonreason2',
                ],
            }),
        ).to.deep.equal({
            nonreason: [
                'nonreason1',
                'nonreason2',
            ],
        });
    });
    it('simple object with string reason', () => {
        expect(inlineReasonArrays({ reason: 'simple reason' })).to.deep.equal({ reason: 'simple reason' });
    });
    it('nested in array', () => {
        expect(
            inlineReasonArrays([
                {
                    reason: [
                        'reason1',
                        'reason2',
                    ],
                },
            ]),
        ).to.deep.equal([
            { reason: 'reason1 reason2' },
        ]);
    });
    it('nested in object', () => {
        expect(
            inlineReasonArrays({
                exceptions: {
                    reason: [
                        'reason1',
                        'reason2',
                    ],
                },
            }),
        ).to.deep.equal({
            exceptions: { reason: 'reason1 reason2' },
        });
    });
    it('null', () => {
        expect(inlineReasonArrays(null)).to.equal(null);
    });
});

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
    }`;
    it('should generate correct hash', () => {
        const testConfig = JSON.parse(testConfigStr);
        addHashToFeatures(testConfig);
        expect(testConfig.features.testFeature.hash).to.be.equal('28ea3a50d97a1e3eada2b8666b096e40');
    });
    it('should update hash', () => {
        const testConfig = JSON.parse(testConfigStr);
        testConfig.features.testFeature.settings.setting1 = 456;
        addHashToFeatures(testConfig);
        expect(testConfig.features.testFeature.hash).to.be.equal('91f8efc44dcd8f708619421e045120c4');
    });
});
