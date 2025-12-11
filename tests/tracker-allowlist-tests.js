import { expect } from 'chai';
import fs from 'fs';

function parseRule(rule) {
    const firstSlash = rule.indexOf('/');
    if (firstSlash === -1) {
        return { domain: rule, path: '' };
    }
    return {
        domain: rule.substring(0, firstSlash),
        path: rule.substring(firstSlash),
    };
}

function isSubdomainOf(subdomain, domain) {
    return subdomain.endsWith('.' + domain);
}

function genericMatchesSubdomain(genericRule, subdomainRule) {
    const generic = parseRule(genericRule);
    const subdomain = parseRule(subdomainRule);

    if (generic.path === '' && isSubdomainOf(subdomain.domain, generic.domain)) {
        return true;
    }
    return false;
}

function isMoreSpecific(moreRule, lessRule) {
    const more = parseRule(moreRule);
    const less = parseRule(lessRule);

    if (isSubdomainOf(more.domain, less.domain) && less.path === '' && more.path === '') {
        return true;
    }
    if (isSubdomainOf(less.domain, more.domain) && more.path === '' && less.path === '') {
        return false;
    }

    if (more.domain !== less.domain) {
        return false;
    }

    const lessPathPrefix = less.path.endsWith('/') ? less.path : less.path + '/';
    return more.path.startsWith(lessPathPrefix) && more.path.length > less.path.length;
}

function findOrderingIssues(rules) {
    const issues = [];

    for (let i = 0; i < rules.length; i++) {
        for (let j = i + 1; j < rules.length; j++) {
            const earlierRule = rules[i];
            const laterRule = rules[j];

            if (genericMatchesSubdomain(earlierRule.rule, laterRule.rule)) {
                const earlierDomains = new Set(earlierRule.domains);
                const laterDomains = new Set(laterRule.domains);

                const missingDomains = [...laterDomains].filter(
                    (d) => d !== '<all>' && !earlierDomains.has(d) && !earlierDomains.has('<all>'),
                );

                if (missingDomains.length > 0) {
                    issues.push({
                        earlierRule: earlierRule.rule,
                        laterRule: laterRule.rule,
                        earlierIndex: i,
                        laterIndex: j,
                        type: 'subdomain',
                        missingDomains: missingDomains,
                    });
                }
            } else if (isMoreSpecific(laterRule.rule, earlierRule.rule)) {
                issues.push({
                    earlierRule: earlierRule.rule,
                    laterRule: laterRule.rule,
                    earlierIndex: i,
                    laterIndex: j,
                    type: 'path-prefix',
                });
            }
        }
    }

    return issues;
}

function findMissingDomainInMoreSpecificRules(rules) {
    const problems = [];

    const allDomains = new Set();
    for (const rule of rules) {
        for (const d of rule.domains) {
            allDomains.add(d);
        }
    }

    const indexedRules = rules.map((rule, index) => ({ ...rule, index }));

    for (const domain of allDomains) {
        if (domain === '<all>') continue;

        for (const less of indexedRules) {
            if (!less.domains.includes(domain)) continue;

            if (less.domains.includes('<all>')) continue;

            for (const more of indexedRules) {
                if (!isMoreSpecific(more.rule, less.rule)) continue;

                if (more.domains.includes('<all>')) continue;

                if (!more.domains.includes(domain)) {
                    problems.push({
                        domain,
                        lessSpecificRule: less.rule,
                        moreSpecificRule: more.rule,
                        moreSpecificRuleIndex: more.index,
                    });
                }
            }
        }
    }

    return problems;
}

function formatOrderingIssues(allOrderingIssues) {
    const groupedByTracker = allOrderingIssues.reduce((acc, p) => {
        if (!acc[p.trackerDomain]) acc[p.trackerDomain] = [];
        acc[p.trackerDomain].push(p);
        return acc;
    }, {});

    return Object.entries(groupedByTracker)
        .map(
            ([
                tracker,
                problems,
            ]) => {
                const details = problems
                    .map((p) => {
                        if (p.type === 'subdomain') {
                            return `  - Rule at index ${p.earlierIndex} ("${p.earlierRule}") should come after rule at index ${p.laterIndex} ("${p.laterRule}")\n    Reason: Generic domain matches subdomain requests. Missing domains: ${p.missingDomains.join(', ')}`;
                        }
                        return `  - Rule at index ${p.earlierIndex} ("${p.earlierRule}") should come after rule at index ${p.laterIndex} ("${p.laterRule}")`;
                    })
                    .join('\n');
                return `${tracker}:\n${details}`;
            },
        )
        .join('\n\n');
}

function formatDomainPropagationIssues(allProblems) {
    return allProblems
        .map(({ trackerDomain, problems }) => {
            const problemDetails = problems
                .map((p) => `  - Domain "${p.domain}" in "${p.lessSpecificRule}" missing from "${p.moreSpecificRule}"`)
                .join('\n');
            return `${trackerDomain}:\n${problemDetails}`;
        })
        .join('\n\n');
}

describe('Allowlist rule ordering & domain propagation', () => {
    let trackerAllowlistData;

    before(() => {
        const fileContent = fs.readFileSync('./features/tracker-allowlist.json', 'utf8');
        trackerAllowlistData = JSON.parse(fileContent);
    });

    it('validates each rule has at least one domain', () => {
        for (const [
            trackerDomain,
            config,
        ] of Object.entries(trackerAllowlistData.settings.allowlistedTrackers)) {
            for (const rule of config.rules) {
                expect(rule.domains.length).to.be.greaterThan(0, `Rule "${rule.rule}" for tracker "${trackerDomain}" must have at least one domain`);
            }
        }
    });

    it('recognizes more-specific vs unrelated rules', () => {
        expect(isMoreSpecific('foo.com/bar/baz', 'foo.com/bar')).to.equal(true);
        expect(isMoreSpecific('foo.com/bar/baz/buz', 'foo.com/bar/baz')).to.equal(true);
        expect(isMoreSpecific('foo.com/bar', 'foo.com/bar/baz')).to.equal(false);
        expect(isMoreSpecific('foo.com/bar2', 'foo.com/bar')).to.equal(false);

        expect(isMoreSpecific('www.example.com/foo', 'example.com/foo')).to.equal(false);
        expect(isMoreSpecific('cdn.example.com/foo', 'example.com/foo')).to.equal(false);
        expect(isMoreSpecific('example.com/foo', 'other.com/foo')).to.equal(false);
    });

    it('recognizes subdomain relationships', () => {
        expect(isMoreSpecific('api.grow.me', 'grow.me')).to.equal(true);
        expect(isMoreSpecific('grow.me', 'api.grow.me')).to.equal(false);

        expect(isMoreSpecific('www.example.com', 'example.com')).to.equal(true);
        expect(isMoreSpecific('example.com', 'www.example.com')).to.equal(false);

        expect(isMoreSpecific('sub1.example.com', 'sub2.example.com')).to.equal(false);
        expect(isMoreSpecific('sub2.example.com', 'sub1.example.com')).to.equal(false);

        expect(isMoreSpecific('api.grow.me/path', 'grow.me')).to.equal(false);
        expect(isMoreSpecific('grow.me/path', 'api.grow.me')).to.equal(false);
    });

    it('detects generic domain matching subdomain requests', () => {
        expect(genericMatchesSubdomain('grow.me', 'api.grow.me')).to.equal(true);
        expect(genericMatchesSubdomain('grow.me', 'cdn.grow.me')).to.equal(true);
        expect(genericMatchesSubdomain('grow.me', 'www.grow.me')).to.equal(true);
        expect(genericMatchesSubdomain('grow.me/path', 'api.grow.me')).to.equal(false);
        expect(genericMatchesSubdomain('grow.me', 'api.grow.me/path')).to.equal(true);
        expect(genericMatchesSubdomain('example.com', 'other.com')).to.equal(false);
    });

    it('passes for the correct configuration', () => {
        const rules = [
            {
                rule: 'foo.com/bar/baz',
                domains: [
                    'site1.com',
                    'site2.com',
                ],
            },
            { rule: 'foo.com/bar', domains: ['site2.com'] },
        ];

        const problems = findMissingDomainInMoreSpecificRules(rules);
        expect(problems).to.have.lengthOf(0);
    });

    it('detects missing domain on a more-specific rule', () => {
        const rules = [
            { rule: 'foo.com/bar/baz', domains: ['site1.com'] },
            {
                rule: 'foo.com/bar',
                domains: [
                    'site1.com',
                    'site2.com',
                ],
            },
        ];

        const problems = findMissingDomainInMoreSpecificRules(rules);

        const hasExpectedProblem = problems.some(
            (p) => p.domain === 'site2.com' && p.lessSpecificRule === 'foo.com/bar' && p.moreSpecificRule === 'foo.com/bar/baz',
        );

        expect(hasExpectedProblem).to.equal(true);
    });

    it('does NOT force domains upward', () => {
        const rules = [
            { rule: 'foo.com/bar', domains: [] },
            { rule: 'foo.com/bar/baz', domains: ['site2.com'] },
        ];

        const problems = findMissingDomainInMoreSpecificRules(rules);
        expect(problems).to.have.lengthOf(0);
    });

    it('detects subdomain ordering issues', () => {
        const rules = [
            { rule: 'grow.me', domains: ['site1.com'] },
            { rule: 'api.grow.me', domains: ['site1.com', 'site2.com'] },
        ];

        const issues = findOrderingIssues(rules);
        expect(issues).to.have.lengthOf(1);
        expect(issues[0].type).to.equal('subdomain');
        expect(issues[0].missingDomains).to.include('site2.com');
    });

    it('does NOT flag subdomain ordering when domains match', () => {
        const rules = [
            { rule: 'grow.me', domains: ['<all>'] },
            { rule: 'api.grow.me', domains: ['site1.com'] },
        ];

        const issues = findOrderingIssues(rules);
        expect(issues).to.have.lengthOf(0);
    });

    it('validates rules are ordered most-specific to least-specific in actual tracker-allowlist.json', () => {
        const trackers = trackerAllowlistData.settings?.allowlistedTrackers;
        expect(trackers).to.exist;

        const allOrderingIssues = [];

        for (const [
            trackerDomain,
            config,
        ] of Object.entries(trackers)) {
            if (!config.rules || config.rules.length < 2) continue;

            const orderingIssues = findOrderingIssues(config.rules);
            for (const issue of orderingIssues) {
                allOrderingIssues.push({ trackerDomain, ...issue });
            }
        }

        if (allOrderingIssues.length > 0) {
            throw new Error(`Rule ordering issues found (rules should be most-specific first):\n\n${formatOrderingIssues(allOrderingIssues)}`);
        }

        expect(allOrderingIssues).to.have.lengthOf(0);
    });

    it('validates domain propagation in actual tracker-allowlist.json', () => {
        const trackers = trackerAllowlistData.settings?.allowlistedTrackers;
        expect(trackers).to.exist;

        const allProblems = [];

        for (const [
            trackerDomain,
            config,
        ] of Object.entries(trackers)) {
            if (!config.rules || config.rules.length === 0) continue;

            const problems = findMissingDomainInMoreSpecificRules(config.rules);
            if (problems.length > 0) {
                allProblems.push({ trackerDomain, problems });
            }
        }

        if (allProblems.length > 0) {
            throw new Error(`Domain propagation issues found:\n\n${formatDomainPropagationIssues(allProblems)}`);
        }

        expect(allProblems).to.have.lengthOf(0);
    });
});
