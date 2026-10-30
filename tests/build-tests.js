import { expect } from 'chai';
import {
    addAllowlistRule,
    addCnameEntriesToAllowlist,
    inlineReasonArrays,
    mergeAllowlistedTrackers,
    mergeEventHubTelemetry,
    mergeInterferenceTypes,
    renameEventHubImmediateTriggers,
    addHashToFeatures,
} from '../util.js';
import { arrayWebDetectionBuckets } from '../web-detection-util.js';
import { compatFunctions } from '../compatibility.js';

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

describe('renameEventHubImmediateTriggers', () => {
    const configWith = (telemetry) => ({ features: { eventHub: { state: 'enabled', settings: { telemetry } } } });
    const immediateEntry = (type) => ({ state: 'enabled', trigger: { type, source: 'adwall' }, parameters: {} });
    const periodEntry = () => ({
        state: 'enabled',
        trigger: { period: { seconds: 86400 } },
        parameters: { count: { template: 'counter', source: 'adwall', buckets: { 0: { gte: 0 } } } },
    });

    for (const platform of [
        'ios',
        'macos',
    ]) {
        it(`rewrites immediate to immediate_v2 for ${platform}`, () => {
            const config = configWith({ pixel_immediate: immediateEntry('immediate') });
            renameEventHubImmediateTriggers(config, platform);
            expect(config.features.eventHub.settings.telemetry.pixel_immediate).to.deep.equal(immediateEntry('immediate_v2'));
        });
    }

    for (const platform of [
        'windows',
        'android',
    ]) {
        it(`leaves immediate unchanged for ${platform}`, () => {
            const config = configWith({ pixel_immediate: immediateEntry('immediate') });
            renameEventHubImmediateTriggers(config, platform);
            expect(config).to.deep.equal(configWith({ pixel_immediate: immediateEntry('immediate') }));
        });
    }

    it('leaves period entries unchanged', () => {
        const config = configWith({ pixel_day: periodEntry() });
        renameEventHubImmediateTriggers(config, 'ios');
        expect(config).to.deep.equal(configWith({ pixel_day: periodEntry() }));
    });

    it('no-ops when the config has no eventHub telemetry', () => {
        const config = { features: { eventHub: { state: 'enabled' } } };
        renameEventHubImmediateTriggers(config, 'ios');
        expect(config).to.deep.equal({ features: { eventHub: { state: 'enabled' } } });
        expect(() => renameEventHubImmediateTriggers({ features: {} }, 'ios')).to.not.throw();
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

describe('compatFunctions.v5', () => {
    const config = {
        features: {
            capped: { state: 'enabled', maxSupportedVersion: '7.300.0', minSupportedVersion: '7.250.0' },
            parent: {
                state: 'enabled',
                features: {
                    cappedSub: { state: 'enabled', maxSupportedVersion: '7.300.0' },
                    plainSub: { state: 'enabled', minSupportedVersion: '7.250.0' },
                },
            },
        },
    };
    const v5Config = compatFunctions.v5(config);

    it('disables features that set maxSupportedVersion and removes the key', () => {
        expect(v5Config.features.capped).to.deep.equal({ state: 'disabled', minSupportedVersion: '7.250.0' });
    });

    it('disables sub-features that set maxSupportedVersion and removes the key', () => {
        expect(v5Config.features.parent.state).to.equal('enabled');
        expect(v5Config.features.parent.features.cappedSub).to.deep.equal({ state: 'disabled' });
    });

    it('leaves features without maxSupportedVersion unchanged', () => {
        expect(v5Config.features.parent.features.plainSub).to.deep.equal({ state: 'enabled', minSupportedVersion: '7.250.0' });
    });

    it('does not modify its input', () => {
        expect(config.features.capped.state).to.equal('enabled');
        expect(config.features.capped.maxSupportedVersion).to.equal('7.300.0');
    });
});

describe('arrayWebDetectionBuckets', () => {
    /**
     * @param {object} settings
     */
    const built = (settings) => {
        const config = { features: { webDetection: { settings } } };
        arrayWebDetectionBuckets(config);
        return config.features.webDetection.settings;
    };
    const ranges = { '0-1': { gte: 0, lt: 1 }, '1-3': { gte: 1, lt: 3 }, '3+': { gte: 3 } };
    const rangeArray = [
        { name: '0-1', is: { gte: 0, lt: 1 } },
        { name: '1-3', is: { gte: 1, lt: 3 } },
        { name: '3+', is: { gte: 3 } },
    ];

    it('rewrites object buckets into an array in config order, and keeps an array', () => {
        const settings = built({
            detectors: {
                g: {
                    d: {
                        actions: [
                            { define: { n: 1 } },
                            {
                                if: true,
                                then: { fireEvent: { type: 'a', data: { n: { value: { ref: 'n' }, buckets: ranges } } } },
                                else: { breakageReportData: { data: { n: { value: { ref: 'n' }, buckets: rangeArray } } } },
                            },
                        ],
                    },
                },
            },
            conditionalChanges: [
                {
                    condition: { injectName: 'apple' },
                    patchSettings: [
                        {
                            op: 'add',
                            path: '/detectors/g/e',
                            value: { actions: { fireEvent: { type: 'b', data: { n: { value: 1, buckets: ranges } } } } },
                        },
                        {
                            op: 'replace',
                            path: '/detectors/g/d/actions/1/then/fireEvent/data',
                            value: { m: { value: 1, buckets: ranges } },
                        },
                        { op: 'replace', path: '/detectors/g/d/actions/1/then/fireEvent/data/n', value: { value: 2, buckets: ranges } },
                        { op: 'replace', path: '/detectors/g/d/actions/1/then/fireEvent/data/n/buckets', value: ranges },
                        {
                            op: 'replace',
                            path: '/detectors/g/d/actions/1/else/breakageReportData/data/n/buckets/0',
                            value: { name: 'zero', is: 0 },
                        },
                        {
                            op: 'replace',
                            path: '/detectors/g/d/actions/1/then/fireEvent',
                            value: { type: 'c', data: { n: { value: 1, buckets: ranges } } },
                        },
                        {
                            op: 'replace',
                            path: '/detectors/g/e/actions/breakageReportData',
                            value: { data: { n: { value: 1, buckets: ranges } } },
                        },
                    ],
                },
            ],
        });
        const [
            ,
            branch,
        ] = settings.detectors.g.d.actions;
        expect(branch.then.fireEvent.data.n.buckets).to.deep.equal(rangeArray);
        expect(branch.else.breakageReportData.data.n.buckets).to.deep.equal(rangeArray);
        const patches = settings.conditionalChanges[0].patchSettings;
        expect(patches[0].value.actions.fireEvent.data.n.buckets).to.deep.equal(rangeArray);
        expect(patches[1].value.m.buckets).to.deep.equal(rangeArray);
        expect(patches[2].value.buckets).to.deep.equal(rangeArray);
        expect(patches[3].value).to.deep.equal(rangeArray);
        expect(patches[4].value).to.deep.equal({ name: 'zero', is: 0 });
        expect(patches[5].value.data.n.buckets).to.deep.equal(rangeArray);
        expect(patches[6].value.data.n.buckets).to.deep.equal(rangeArray);
    });

    it('rejects an integer-like name in object buckets, and a patch addressing a bucket by name', () => {
        const field = (/** @type {unknown} */ buckets) => ({
            detectors: { g: { d: { actions: { breakageReportData: { data: { n: { value: 1, buckets } } } } } } },
        });
        expect(() => built(field({ 0: 0, '1+': { gte: 1 } }))).to.throw('integer-like');
        expect(() =>
            built(
                field([
                    { name: '0', is: 0 },
                ]),
            ),
        ).not.to.throw();
        expect(() =>
            built({
                ...field(ranges),
                conditionalChanges: [
                    {
                        condition: { injectName: 'apple' },
                        patchSettings: [
                            { op: 'replace', path: '/detectors/g/d/actions/breakageReportData/data/n/buckets/3+', value: { gte: 4 } },
                        ],
                    },
                ],
            }),
        ).to.throw('by name');
    });
});
