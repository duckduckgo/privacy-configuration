import { expect } from 'chai';
import fs from 'fs';
import {
    splitDomainPath,
    isSubdomainOrEqual,
    isRegexRule,
    compareRulePaths,
    compareRules,
    validateTrackerRules,
    validateAllowlist,
} from '../scripts/tracker-allowlist-validator.js';

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

        it('returns incomparable for different paths', () => {
            expect(compareRules('tracker.com/api', 'tracker.com/other')).to.equal('incomparable');
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
                const messages = errors.map((e) => `[${e.type}] ${e.tracker}: ${e.message} Suggestion: ${e.suggestion}`);
                throw new Error(`Found ${errors.length} violation(s):\n${messages.join('\n')}`);
            }
        });
    });
});
