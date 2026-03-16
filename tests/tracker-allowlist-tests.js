import { expect } from 'chai';
import fs from 'fs';
import platforms from '../platforms.js';

/**
 * Split a rule string into domain and path components.
 * Trailing slashes are treated as regular characters (no normalization).
 *
 * @param {string} rule - Rule string (e.g. "tracker.com/api/endpoint")
 * @returns {[string, string]} [domain, path] - e.g. ["tracker.com", "/api/endpoint"]
 */
function splitDomainPath(rule) {
    const slashIndex = rule.indexOf('/');
    if (slashIndex === -1) {
        return [
            rule,
            '',
        ];
    }
    return [
        rule.slice(0, slashIndex),
        rule.slice(slashIndex),
    ];
}

/**
 * Check if domain A is equal to domain B or is a subdomain of B.
 * Used for rule path comparison (e.g. cdn.tracker.com vs tracker.com).
 *
 * @param {string} domA - First domain (e.g. "cdn.tracker.com")
 * @param {string} domB - Second domain (e.g. "tracker.com")
 * @returns {boolean} True if domA equals domB or domA is a subdomain of domB
 */
function isSubdomainOrEqual(domA, domB) {
    if (domA === domB) {
        return true;
    }
    return domA.endsWith('.' + domB);
}

/**
 * Detect if a rule contains regex patterns. Such rules are treated as incomparable.
 * Uses a simple heuristic: common regex metacharacters (.*, \., [, ], |).
 *
 * @param {string} rule - Rule string (e.g. "tracker.com/api" or "tracker\\.com/.*")
 * @returns {boolean} True if the rule appears to contain regex
 */
function isRegexRule(rule) {
    return /\.\*|\\\.|[[\]|]/.test(rule);
}

/**
 * Compare two path strings (the path part after the domain).
 * Uses string prefix: pathA is more specific than pathB if pathB is a prefix of pathA.
 *
 * @param {string} path1 - First path (e.g. "/api/endpoint")
 * @param {string} path2 - Second path (e.g. "/api")
 * @returns {-1 | 0 | 1 | 2} -1 if path1 more specific, 0 if equal, 1 if path1 more general, 2 if incomparable
 */
function compareRulePaths(path1, path2) {
    const p1 = path1 || '';
    const p2 = path2 || '';

    if (p1 === p2) {
        return 0;
    }
    if (p2.startsWith(p1)) {
        return 1; // path1 is prefix of path2 → path1 more general
    }
    if (p1.startsWith(p2)) {
        return -1; // path2 is prefix of path1 → path1 more specific
    }
    return 2; // incomparable
}

/** @typedef {'equal' | 'moreSpecific' | 'moreGeneral' | 'incomparable'} RuleRelationship */

/**
 * Compare two rules (full rule strings) to determine their relationship.
 * Combines domain (subdomain) and path (prefix) comparison.
 *
 * @param {string} ruleA - First rule string (e.g. "tracker.com/api/endpoint")
 * @param {string} ruleB - Second rule string (e.g. "tracker.com/api")
 * @returns {RuleRelationship}
 */
function compareRules(ruleA, ruleB) {
    if (isRegexRule(ruleA) || isRegexRule(ruleB)) {
        return 'incomparable';
    }

    const [
        domA,
        pathA,
    ] = splitDomainPath(ruleA);
    const [
        domB,
        pathB,
    ] = splitDomainPath(ruleB);

    const pathComp = compareRulePaths(pathA, pathB);

    // Same domain and same path → equal
    if (domA === domB && pathComp === 0) {
        return 'equal';
    }

    // ruleA more specific than ruleB: domainA is subdomain-or-equal of domainB, pathB is prefix of pathA (or equal)
    if (isSubdomainOrEqual(domA, domB) && (pathComp === -1 || pathComp === 0)) {
        return 'moreSpecific';
    }

    // ruleA more general than ruleB: domainB is subdomain-or-equal of domainA, pathA is prefix of pathB (or equal)
    if (isSubdomainOrEqual(domB, domA) && (pathComp === 1 || pathComp === 0)) {
        return 'moreGeneral';
    }

    return 'incomparable';
}

/** @typedef {{ rule: string, domains: string[] }} AllowlistRule — keep in sync with schema/features/tracker-allowlist.ts */
/** @typedef {{ type: 'ORDERING_VIOLATION' | 'DOMAIN_PROPAGATION_VIOLATION' | 'DUPLICATE_RULE', tracker: string, ruleA: AllowlistRule, ruleB: AllowlistRule, message: string, fix: string }} ValidationError */

/**
 * Validate rules for a single tracker. Checks ordering, domain propagation, and duplicates.
 *
 * @param {string} trackerDomain - Tracker domain (e.g. "tracker.com")
 * @param {AllowlistRule[]} rules - Rules for this tracker (order = file order)
 * @returns {ValidationError[]}
 */
function validateTrackerRules(trackerDomain, rules) {
    const errors = [];
    if (!rules || rules.length <= 1) {
        return errors;
    }

    for (let i = 0; i < rules.length; i++) {
        for (let j = i + 1; j < rules.length; j++) {
            const ruleA = rules[i];
            const ruleB = rules[j];
            const rel = compareRules(ruleA.rule, ruleB.rule);

            if (rel === 'equal') {
                errors.push({
                    type: 'DUPLICATE_RULE',
                    tracker: trackerDomain,
                    ruleA,
                    ruleB,
                    message: `Duplicate rule: "${ruleA.rule}" appears more than once.`,
                    fix: 'Remove the duplicate rule.',
                });
                continue;
            }

            if (rel === 'moreGeneral') {
                errors.push({
                    type: 'ORDERING_VIOLATION',
                    tracker: trackerDomain,
                    ruleA,
                    ruleB,
                    message: `Wrong order: more-general rule "${ruleA.rule}" appears before more-specific rule "${ruleB.rule}"; the more-specific rule will never be reached.`,
                    fix: 'Move the more-specific rule above the more-general rule.',
                });
                continue;
            }

            if (rel === 'moreSpecific') {
                const domainsA = ruleA.domains || [];
                const domainsB = ruleB.domains || [];

                if (domainsA.includes('<all>')) {
                    continue;
                }

                if (domainsB.includes('<all>')) {
                    errors.push({
                        type: 'DOMAIN_PROPAGATION_VIOLATION',
                        tracker: trackerDomain,
                        ruleA,
                        ruleB,
                        message: `More-specific rule narrows <all>: "${ruleA.rule}" has [${domainsA.join(', ')}] while "${ruleB.rule}" has <all>.`,
                        fix: 'Add <all> to the more-specific rule, or remove it if redundant.',
                    });
                    continue;
                }

                const missing = domainsB.filter((d) => !domainsA.includes(d));
                if (missing.length > 0) {
                    errors.push({
                        type: 'DOMAIN_PROPAGATION_VIOLATION',
                        tracker: trackerDomain,
                        ruleA,
                        ruleB,
                        message: `Missing domain propagation: more-specific rule "${ruleA.rule}" is missing domain(s) from less-specific rule "${ruleB.rule}": [${missing.join(', ')}].`,
                        fix: 'Add the missing domain(s) to the more-specific rule.',
                    });
                }
            }
        }
    }

    return errors;
}

/**
 * Validate an entire allowlist. Iterates over all trackers and collects errors.
 *
 * @param {Object<string, { rules: AllowlistRule[] }>} allowlistedTrackers
 * @returns {ValidationError[]}
 */
function validateAllowlist(allowlistedTrackers) {
    const errors = [];
    for (const [
        trackerDomain,
        tracker,
    ] of Object.entries(allowlistedTrackers)) {
        errors.push(...validateTrackerRules(trackerDomain, tracker.rules));
    }
    return errors;
}

describe('tracker-allowlist-validator', () => {
    describe('splitDomainPath', () => {
        it('splits domain and path', () => {
            expect(splitDomainPath('tracker.com/api/endpoint')).to.deep.equal([
                'tracker.com',
                '/api/endpoint',
            ]);
        });

        it('returns empty path when no slash', () => {
            expect(splitDomainPath('tracker.com')).to.deep.equal([
                'tracker.com',
                '',
            ]);
        });

        it('returns slash as path when rule ends with slash', () => {
            expect(splitDomainPath('tracker.com/')).to.deep.equal([
                'tracker.com',
                '/',
            ]);
        });

        it('handles subdomain with path', () => {
            expect(splitDomainPath('cdn.tracker.com/api')).to.deep.equal([
                'cdn.tracker.com',
                '/api',
            ]);
        });
    });

    describe('isSubdomainOrEqual', () => {
        it('returns true for equal domains', () => {
            expect(isSubdomainOrEqual('tracker.com', 'tracker.com')).to.equal(true);
        });

        it('returns true when first is subdomain of second', () => {
            expect(isSubdomainOrEqual('cdn.tracker.com', 'tracker.com')).to.equal(true);
        });

        it('returns true for deeper subdomain', () => {
            expect(isSubdomainOrEqual('a.b.tracker.com', 'tracker.com')).to.equal(true);
        });

        it('returns false for sibling subdomains', () => {
            expect(isSubdomainOrEqual('cdn.tracker.com', 'media.tracker.com')).to.equal(false);
        });

        it('returns false when second is subdomain of first', () => {
            expect(isSubdomainOrEqual('tracker.com', 'cdn.tracker.com')).to.equal(false);
        });

        it('returns false for unrelated domains', () => {
            expect(isSubdomainOrEqual('tracker.com', 'other.com')).to.equal(false);
        });
    });

    describe('isRegexRule', () => {
        it('returns false for plain domain/path rule', () => {
            expect(isRegexRule('tracker.com/api/endpoint')).to.equal(false);
        });

        it('returns true for rule with .*', () => {
            expect(isRegexRule('tracker.com/vendor/.*/user.js')).to.equal(true);
        });

        it('returns true for rule with escaped dot', () => {
            expect(isRegexRule('tracker\\.com/path')).to.equal(true);
        });

        it('returns true for rule with character class', () => {
            expect(isRegexRule('tracker.com/path[0]')).to.equal(true);
        });

        it('returns true for rule with pipe', () => {
            expect(isRegexRule('tracker.com/(foo|bar)')).to.equal(true);
        });
    });

    describe('compareRulePaths', () => {
        it('returns 0 for equal paths', () => {
            expect(compareRulePaths('/api', '/api')).to.equal(0);
        });

        it('returns 0 for both empty paths', () => {
            expect(compareRulePaths('', '')).to.equal(0);
        });

        it('returns -1 when path1 is more specific', () => {
            expect(compareRulePaths('/api/endpoint', '/api')).to.equal(-1);
        });

        it('returns 1 when path1 is more general', () => {
            expect(compareRulePaths('/api', '/api/endpoint')).to.equal(1);
        });

        it('returns 2 for incomparable paths', () => {
            expect(compareRulePaths('/api', '/other')).to.equal(2);
        });

        it('handles deeply nested paths', () => {
            expect(compareRulePaths('/api/v1/users/123', '/api/v1/users')).to.equal(-1);
        });

        it('treats trailing slash as more specific', () => {
            expect(compareRulePaths('/api/', '/api')).to.equal(-1);
        });

        it('returns -1 for similar prefix without shared boundary', () => {
            expect(compareRulePaths('/products-new', '/products')).to.equal(-1);
        });
    });

    describe('compareRules', () => {
        it('returns equal for identical rules', () => {
            expect(compareRules('tracker.com/api', 'tracker.com/api')).to.equal('equal');
        });

        it('returns moreSpecific when path is more specific', () => {
            expect(compareRules('tracker.com/api/endpoint', 'tracker.com/api')).to.equal('moreSpecific');
        });

        it('returns moreGeneral when path is more general', () => {
            expect(compareRules('tracker.com/api', 'tracker.com/api/endpoint')).to.equal('moreGeneral');
        });

        it('returns moreSpecific when subdomain is more specific', () => {
            expect(compareRules('cdn.tracker.com/api', 'tracker.com/api')).to.equal('moreSpecific');
        });

        it('returns moreGeneral when subdomain is more general', () => {
            expect(compareRules('tracker.com/api', 'cdn.tracker.com/api')).to.equal('moreGeneral');
        });

        it('returns incomparable for sibling subdomains', () => {
            expect(compareRules('cdn.tracker.com/api', 'media.tracker.com/api')).to.equal('incomparable');
        });

        it('returns moreGeneral for domain-only vs domain with path', () => {
            expect(compareRules('tracker.com', 'tracker.com/api')).to.equal('moreGeneral');
        });

        it('returns incomparable for different paths', () => {
            expect(compareRules('tracker.com/api', 'tracker.com/other')).to.equal('incomparable');
        });

        it('returns incomparable for subdomain with differing path', () => {
            expect(compareRules('sub.tracker.com/foo', 'tracker.com/bar')).to.equal('incomparable');
        });

        it('returns incomparable when either rule is regex', () => {
            expect(compareRules('tracker.com/vendor/.*/user.js', 'tracker.com/vendor')).to.equal('incomparable');
        });

        it('returns incomparable when non-regex paired with regex', () => {
            expect(compareRules('tracker.com/api', 'tracker.com/.*/script.js')).to.equal('incomparable');
        });
    });

    describe('validateTrackerRules - failure cases', () => {
        it('detects ordering violation: general before specific', () => {
            const rules = [
                {
                    rule: 'tracker.com/api',
                    domains: [
                        'site1.com',
                    ],
                },
                {
                    rule: 'tracker.com/api/endpoint',
                    domains: [
                        'site1.com',
                    ],
                },
            ];
            const errors = validateTrackerRules('tracker.com', rules);
            expect(errors).to.have.length(1);
            expect(errors[0].type).to.equal('ORDERING_VIOLATION');
        });

        it('detects duplicate rules', () => {
            const rules = [
                {
                    rule: 'tracker.com/api',
                    domains: [
                        'site1.com',
                    ],
                },
                {
                    rule: 'tracker.com/api',
                    domains: [
                        'site1.com',
                    ],
                },
            ];
            const errors = validateTrackerRules('tracker.com', rules);
            expect(errors).to.have.length(1);
            expect(errors[0].type).to.equal('DUPLICATE_RULE');
        });

        it('detects missing domain propagation', () => {
            const rules = [
                {
                    rule: 'tracker.com/api/endpoint',
                    domains: [
                        'site1.com',
                    ],
                },
                {
                    rule: 'tracker.com/api',
                    domains: [
                        'site1.com',
                        'site2.com',
                    ],
                },
            ];
            const errors = validateTrackerRules('tracker.com', rules);
            expect(errors).to.have.length(1);
            expect(errors[0].type).to.equal('DOMAIN_PROPAGATION_VIOLATION');
        });

        it('detects <all> narrowing', () => {
            const rules = [
                {
                    rule: 'tracker.com/api/endpoint',
                    domains: [
                        'site1.com',
                    ],
                },
                {
                    rule: 'tracker.com/api',
                    domains: [
                        '<all>',
                    ],
                },
            ];
            const errors = validateTrackerRules('tracker.com', rules);
            expect(errors).to.have.length(1);
            expect(errors[0].type).to.equal('DOMAIN_PROPAGATION_VIOLATION');
        });

        it('detects ordering violation: similar prefix without slash', () => {
            const rules = [
                {
                    rule: 'tracker.com/products',
                    domains: [
                        'site1.com',
                    ],
                },
                {
                    rule: 'tracker.com/products-new',
                    domains: [
                        'site1.com',
                    ],
                },
            ];
            const errors = validateTrackerRules('tracker.com', rules);
            expect(errors).to.have.length(1);
            expect(errors[0].type).to.equal('ORDERING_VIOLATION');
        });

        it('detects ordering violation: trailing slash', () => {
            const rules = [
                {
                    rule: 'tracker.com/api',
                    domains: [
                        'site1.com',
                    ],
                },
                {
                    rule: 'tracker.com/api/',
                    domains: [
                        'site1.com',
                    ],
                },
            ];
            const errors = validateTrackerRules('tracker.com', rules);
            expect(errors).to.have.length(1);
            expect(errors[0].type).to.equal('ORDERING_VIOLATION');
        });

        it('detects ordering violation: subdomain wrong order', () => {
            const rules = [
                {
                    rule: 'tracker.com/api',
                    domains: [
                        'site1.com',
                    ],
                },
                {
                    rule: 'cdn.tracker.com/api',
                    domains: [
                        'site1.com',
                    ],
                },
            ];
            const errors = validateTrackerRules('tracker.com', rules);
            expect(errors).to.have.length(1);
            expect(errors[0].type).to.equal('ORDERING_VIOLATION');
        });
    });

    describe('validateTrackerRules - valid cases', () => {
        it('returns no errors for single rule tracker', () => {
            const rules = [
                {
                    rule: 'tracker.com/api',
                    domains: [
                        'site1.com',
                    ],
                },
            ];
            expect(validateTrackerRules('tracker.com', rules)).to.deep.equal([]);
        });

        it('returns no errors for incomparable paths', () => {
            const rules = [
                {
                    rule: 'tracker.com/api',
                    domains: [
                        'site1.com',
                    ],
                },
                {
                    rule: 'tracker.com/other',
                    domains: [
                        'site2.com',
                    ],
                },
            ];
            expect(validateTrackerRules('tracker.com', rules)).to.deep.equal([]);
        });

        it('returns no errors for sibling subdomains', () => {
            const rules = [
                {
                    rule: 'cdn.tracker.com/api',
                    domains: [
                        'site1.com',
                    ],
                },
                {
                    rule: 'media.tracker.com/api',
                    domains: [
                        'site2.com',
                    ],
                },
            ];
            expect(validateTrackerRules('tracker.com', rules)).to.deep.equal([]);
        });

        it('returns no errors for trailing slash boundary (incomparable segments)', () => {
            const rules = [
                {
                    rule: 'tracker.com/products/',
                    domains: [
                        'site1.com',
                    ],
                },
                {
                    rule: 'tracker.com/products-new/',
                    domains: [
                        'site2.com',
                    ],
                },
            ];
            expect(validateTrackerRules('tracker.com', rules)).to.deep.equal([]);
        });

        it('returns no errors when more-specific has <all>', () => {
            const rules = [
                {
                    rule: 'tracker.com/api/endpoint',
                    domains: [
                        '<all>',
                    ],
                },
                {
                    rule: 'tracker.com/api',
                    domains: [
                        'site1.com',
                    ],
                },
            ];
            expect(validateTrackerRules('tracker.com', rules)).to.deep.equal([]);
        });

        it('returns no errors for correct ordering and propagation', () => {
            const rules = [
                {
                    rule: 'tracker.com/api/endpoint',
                    domains: [
                        'site1.com',
                        'site2.com',
                    ],
                },
                {
                    rule: 'tracker.com/api',
                    domains: [
                        'site2.com',
                    ],
                },
            ];
            expect(validateTrackerRules('tracker.com', rules)).to.deep.equal([]);
        });

        it('returns no errors for regex rules (skipped)', () => {
            const rules = [
                {
                    rule: 'tracker.com/vendor/.*/user.js',
                    domains: [
                        'site1.com',
                    ],
                },
                {
                    rule: 'tracker.com/vendor',
                    domains: [
                        'site2.com',
                    ],
                },
            ];
            expect(validateTrackerRules('tracker.com', rules)).to.deep.equal([]);
        });
    });

    describe('validateAllowlist', () => {
        it('returns errors only for trackers with violations', () => {
            const allowlist = {
                'good-tracker.com': {
                    rules: [
                        {
                            rule: 'good-tracker.com/api/endpoint',
                            domains: [
                                'site1.com',
                            ],
                        },
                        {
                            rule: 'good-tracker.com/api',
                            domains: [
                                'site1.com',
                            ],
                        },
                    ],
                },
                'bad-tracker.com': {
                    rules: [
                        {
                            rule: 'bad-tracker.com/api',
                            domains: [
                                'site1.com',
                            ],
                        },
                        {
                            rule: 'bad-tracker.com/api/endpoint',
                            domains: [
                                'site1.com',
                            ],
                        },
                    ],
                },
            };
            const errors = validateAllowlist(allowlist);
            expect(errors).to.have.length(1);
            expect(errors[0].tracker).to.equal('bad-tracker.com');
            expect(errors[0].type).to.equal('ORDERING_VIOLATION');
        });

        it('returns no errors for a clean allowlist', () => {
            const allowlist = {
                'tracker1.com': {
                    rules: [
                        {
                            rule: 'tracker1.com/api',
                            domains: [
                                'site1.com',
                            ],
                        },
                    ],
                },
                'tracker2.com': {
                    rules: [
                        {
                            rule: 'tracker2.com/api/endpoint',
                            domains: [
                                'site1.com',
                            ],
                        },
                        {
                            rule: 'tracker2.com/api',
                            domains: [
                                'site1.com',
                            ],
                        },
                    ],
                },
            };
            expect(validateAllowlist(allowlist)).to.deep.equal([]);
        });

        it('returns multiple errors across trackers', () => {
            const allowlist = {
                'tracker1.com': {
                    rules: [
                        {
                            rule: 'tracker1.com/api',
                            domains: [
                                'site1.com',
                            ],
                        },
                        {
                            rule: 'tracker1.com/api/endpoint',
                            domains: [
                                'site1.com',
                            ],
                        },
                    ],
                },
                'tracker2.com': {
                    rules: [
                        {
                            rule: 'tracker2.com/api',
                            domains: [
                                'site1.com',
                            ],
                        },
                        {
                            rule: 'tracker2.com/api',
                            domains: [
                                'site1.com',
                            ],
                        },
                    ],
                },
            };
            const errors = validateAllowlist(allowlist);
            expect(errors).to.have.length(2);
            expect(errors[0].tracker).to.equal('tracker1.com');
            expect(errors[0].type).to.equal('ORDERING_VIOLATION');
            expect(errors[1].tracker).to.equal('tracker2.com');
            expect(errors[1].type).to.equal('DUPLICATE_RULE');
        });
    });

    describe('validate real tracker-allowlist.json', () => {
        it('has no violations in features/tracker-allowlist.json', () => {
            const raw = fs.readFileSync('./features/tracker-allowlist.json', 'utf-8');
            const config = JSON.parse(raw);
            const allowlistedTrackers = config.settings.allowlistedTrackers;
            const errors = validateAllowlist(allowlistedTrackers);
            if (errors.length > 0) {
                const messages = errors.map((e) => `[${e.type}] ${e.tracker}: ${e.message} Fix: ${e.fix}`);
                throw new Error(`Found ${errors.length} violation(s) in base config:\n${messages.join('\n')}`);
            }
        });
    });

    describe('validate generated platform configs', () => {
        const platformOutput = platforms.map((item) => item.replace('browsers/', 'extension-'));
        const baseConfig = JSON.parse(fs.readFileSync('./features/tracker-allowlist.json', 'utf-8'));
        const baseTrackers = baseConfig.settings.allowlistedTrackers;
        const baseErrors = validateAllowlist(baseTrackers);
        const baseErrorKeys = new Set(baseErrors.map((e) => `${e.type}|${e.tracker}|${e.message}`));

        function overridePath(platform) {
            const raw = platform.replace('extension-', 'browsers/');
            return `overrides/${raw}-override.json`;
        }

        function ruleSource(tracker, rule, overrideTrackers) {
            const inBase = baseTrackers[tracker]?.rules.some((ruleEntry) => ruleEntry.rule === rule);
            const inOverride = overrideTrackers?.[tracker]?.rules.some((ruleEntry) => ruleEntry.rule === rule);
            if (inBase && inOverride) return 'base + override';
            if (inOverride) return 'override';
            return 'base';
        }

        function fileForSource(src, ovrFile) {
            if (src === 'override' || src === 'base + override') return ovrFile;
            return 'features/tracker-allowlist.json';
        }

        function formatOverrideError(e, platform, overrideTrackers) {
            const srcA = ruleSource(e.tracker, e.ruleA.rule, overrideTrackers);
            const srcB = ruleSource(e.tracker, e.ruleB.rule, overrideTrackers);
            const ovrFile = overridePath(platform);
            const sameSource = srcA === srcB;
            const lines = [
                `[${e.type}] ${e.tracker}:`,
            ];

            if (e.type === 'DOMAIN_PROPAGATION_VIOLATION') {
                const isAllNarrowing = e.ruleB.domains?.includes('<all>');
                if (isAllNarrowing) {
                    lines.push(`  "${e.ruleA.rule}" (${srcA}) narrows <all> from "${e.ruleB.rule}" (${srcB}).`);
                    lines.push(`  Fix: Add "${e.ruleA.rule}" with [<all>] to ${ovrFile}`);
                } else {
                    const missing = e.ruleB.domains.filter((d) => !e.ruleA.domains?.includes(d));
                    lines.push(`  "${e.ruleA.rule}" (${srcA}) is missing [${missing.join(', ')}] from "${e.ruleB.rule}" (${srcB}).`);
                    if (sameSource) {
                        lines.push(`  Fix: Add missing domain(s) to "${e.ruleA.rule}" in ${fileForSource(srcA, ovrFile)}`);
                    } else {
                        lines.push(`  Fix: Add "${e.ruleA.rule}" with [${missing.join(', ')}] to ${ovrFile}`);
                    }
                }
            } else if (e.type === 'ORDERING_VIOLATION') {
                lines.push(`  "${e.ruleA.rule}" (${srcA}) is more general than "${e.ruleB.rule}" (${srcB}) but appears first.`);
                if (sameSource) {
                    lines.push(`  Fix: Reorder rules in ${fileForSource(srcA, ovrFile)}`);
                } else {
                    lines.push(
                        `  Fix: Check build sort logic — rules from ${fileForSource(srcA, ovrFile)} and ${fileForSource(srcB, ovrFile)} are misordered after merge.`,
                    );
                }
            } else if (e.type === 'DUPLICATE_RULE') {
                if (sameSource) {
                    lines.push(`  "${e.ruleA.rule}" is duplicated in ${fileForSource(srcA, ovrFile)}.`);
                    lines.push(`  Fix: Remove the duplicate entry.`);
                } else {
                    lines.push(`  "${e.ruleA.rule}" exists in both ${fileForSource(srcA, ovrFile)} and ${fileForSource(srcB, ovrFile)}.`);
                    lines.push(`  Fix: Remove duplicate from ${ovrFile}`);
                }
            }
            return lines.join('\n');
        }

        for (const platform of platformOutput) {
            it(`has no override-introduced violations in ${platform}`, () => {
                const config = JSON.parse(fs.readFileSync(`./generated/v5/${platform}-config.json`, 'utf-8'));
                const allowlistedTrackers = config.features?.trackerAllowlist?.settings?.allowlistedTrackers;
                if (!allowlistedTrackers) return;

                const ovrFile = overridePath(platform);
                let overrideTrackers = null;
                if (fs.existsSync(ovrFile)) {
                    const override = JSON.parse(fs.readFileSync(ovrFile, 'utf-8'));
                    overrideTrackers = override.features?.trackerAllowlist?.settings?.allowlistedTrackers || null;
                }

                const newErrors = validateAllowlist(allowlistedTrackers).filter(
                    (e) => !baseErrorKeys.has(`${e.type}|${e.tracker}|${e.message}`),
                );
                if (newErrors.length > 0) {
                    const messages = newErrors.map((e) => formatOverrideError(e, platform, overrideTrackers));
                    throw new Error(`Found ${newErrors.length} override-introduced violation(s) in ${platform}:\n${messages.join('\n')}`);
                }
            });
        }
    });
});
