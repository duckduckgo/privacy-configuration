import { expect } from 'chai';
import fs from 'fs';
import platforms from '../platforms.js';

// --- Validator functions (inlined from tracker-allowlist-validator.js) ---
// AllowlistRule shape ({ rule, domains }) must stay in sync with schema/features/tracker-allowlist.ts

function splitDomainPath(rule) {
    const i = rule.indexOf('/');
    return i === -1
        ? [
              rule,
              '',
          ]
        : [
              rule.slice(0, i),
              rule.slice(i),
          ];
}

function isSubdomainOrEqual(domA, domB) {
    return domA === domB || domA.endsWith('.' + domB);
}

function isRegexRule(rule) {
    return /\.\*|\\\.|[[\]|]/.test(rule);
}

/** @returns {-1 | 0 | 1 | 2} -1=more specific, 0=equal, 1=more general, 2=incomparable */
function compareRulePaths(path1, path2) {
    const p1 = path1 || '';
    const p2 = path2 || '';
    if (p1 === p2) return 0;
    if (p2.startsWith(p1)) return 1;
    if (p1.startsWith(p2)) return -1;
    return 2;
}

/** @returns {'equal' | 'moreSpecific' | 'moreGeneral' | 'incomparable'} */
function compareRules(ruleA, ruleB) {
    if (isRegexRule(ruleA) || isRegexRule(ruleB)) return 'incomparable';
    if (ruleA === ruleB) return 'equal';
    if (ruleA.startsWith(ruleB)) return 'moreSpecific';
    if (ruleB.startsWith(ruleA)) return 'moreGeneral';
    return 'incomparable';
}

function validateTrackerRules(trackerDomain, rules) {
    const errors = [];
    if (!rules || rules.length <= 1) return errors;

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
                    suggestion: 'Remove the duplicate rule.',
                });
            } else if (rel === 'moreGeneral') {
                errors.push({
                    type: 'ORDERING_VIOLATION',
                    tracker: trackerDomain,
                    ruleA,
                    ruleB,
                    message: `Wrong order: more-general rule "${ruleA.rule}" appears before more-specific rule "${ruleB.rule}"; the more-specific rule will never be reached.`,
                    suggestion: 'Move the more-specific rule above the more-general rule.',
                });
            } else if (rel === 'moreSpecific') {
                const domainsA = ruleA.domains || [];
                const domainsB = ruleB.domains || [];
                if (domainsA.includes('<all>')) continue;
                if (domainsB.includes('<all>')) {
                    errors.push({
                        type: 'DOMAIN_PROPAGATION_VIOLATION',
                        tracker: trackerDomain,
                        ruleA,
                        ruleB,
                        message: `More-specific rule narrows <all>: "${ruleA.rule}" has [${domainsA.join(', ')}] while "${ruleB.rule}" has <all>.`,
                        suggestion: 'Add <all> to the more-specific rule, or remove it if redundant.',
                    });
                } else {
                    const missing = domainsB.filter((d) => !domainsA.includes(d));
                    if (missing.length > 0) {
                        errors.push({
                            type: 'DOMAIN_PROPAGATION_VIOLATION',
                            tracker: trackerDomain,
                            ruleA,
                            ruleB,
                            message: `Missing domain propagation: more-specific rule "${ruleA.rule}" is missing domain(s) from less-specific rule "${ruleB.rule}": [${missing.join(', ')}].`,
                            suggestion: 'Add the missing domain(s) to the more-specific rule.',
                        });
                    }
                }
            }
        }
    }
    return errors;
}

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

// --- Test helpers ---

const r = (rule, ...domains) => ({ rule, domains });
function formatErrors(errors) {
    return errors.map((e) => `[${e.type}] ${e.tracker}: ${e.message} Suggestion: ${e.suggestion}`).join('\n');
}

// --- Tests ---

describe('tracker-allowlist-validator', () => {
    describe('splitDomainPath', () => {
        const cases = [
            [
                'tracker.com/api/endpoint',
                [
                    'tracker.com',
                    '/api/endpoint',
                ],
            ],
            [
                'tracker.com',
                [
                    'tracker.com',
                    '',
                ],
            ],
            [
                'tracker.com/',
                [
                    'tracker.com',
                    '/',
                ],
            ],
            [
                'cdn.tracker.com/api',
                [
                    'cdn.tracker.com',
                    '/api',
                ],
            ],
        ];
        for (const [
            input,
            expected,
        ] of cases) {
            it(`splits "${input}"`, () => {
                expect(splitDomainPath(input)).to.deep.equal(expected);
            });
        }
    });

    describe('isSubdomainOrEqual', () => {
        const trueCases = [
            [
                'tracker.com',
                'tracker.com',
            ],
            [
                'cdn.tracker.com',
                'tracker.com',
            ],
            [
                'a.b.tracker.com',
                'tracker.com',
            ],
        ];
        const falseCases = [
            [
                'cdn.tracker.com',
                'media.tracker.com',
            ],
            [
                'tracker.com',
                'cdn.tracker.com',
            ],
            [
                'tracker.com',
                'other.com',
            ],
        ];
        for (const [
            a,
            b,
        ] of trueCases) {
            it(`returns true for ${a} vs ${b}`, () => {
                expect(isSubdomainOrEqual(a, b)).to.equal(true);
            });
        }
        for (const [
            a,
            b,
        ] of falseCases) {
            it(`returns false for ${a} vs ${b}`, () => {
                expect(isSubdomainOrEqual(a, b)).to.equal(false);
            });
        }
    });

    describe('isRegexRule', () => {
        const cases = [
            [
                'tracker.com/api/endpoint',
                false,
            ],
            [
                'tracker.com/vendor/.*/user.js',
                true,
            ],
            [
                'tracker\\.com/path',
                true,
            ],
            [
                'tracker.com/path[0]',
                true,
            ],
            [
                'tracker.com/(foo|bar)',
                true,
            ],
        ];
        for (const [
            input,
            expected,
        ] of cases) {
            it(`returns ${expected} for "${input}"`, () => {
                expect(isRegexRule(input)).to.equal(expected);
            });
        }
    });

    describe('compareRulePaths', () => {
        const cases = [
            [
                '/api',
                '/api',
                0,
            ],
            [
                '',
                '',
                0,
            ],
            [
                '/api/endpoint',
                '/api',
                -1,
            ],
            [
                '/api',
                '/api/endpoint',
                1,
            ],
            [
                '/api',
                '/other',
                2,
            ],
            [
                '/api/v1/users/123',
                '/api/v1/users',
                -1,
            ],
            [
                '/api/',
                '/api',
                -1,
            ],
            [
                '/products-new',
                '/products',
                -1,
            ],
        ];
        for (const [
            p1,
            p2,
            expected,
        ] of cases) {
            it(`returns ${expected} for "${p1}" vs "${p2}"`, () => {
                expect(compareRulePaths(p1, p2)).to.equal(expected);
            });
        }
    });

    describe('compareRules', () => {
        const cases = [
            [
                'tracker.com/api',
                'tracker.com/api',
                'equal',
            ],
            [
                'tracker.com/api/endpoint',
                'tracker.com/api',
                'moreSpecific',
            ],
            [
                'tracker.com/api',
                'tracker.com/api/endpoint',
                'moreGeneral',
            ],
            [
                'cdn.tracker.com/api',
                'tracker.com/api',
                'incomparable',
            ],
            [
                'tracker.com/api',
                'cdn.tracker.com/api',
                'incomparable',
            ],
            [
                'cdn.tracker.com/api',
                'media.tracker.com/api',
                'incomparable',
            ],
            [
                'tracker.com',
                'tracker.com/api',
                'moreGeneral',
            ],
            [
                'tracker.com/api',
                'tracker.com/other',
                'incomparable',
            ],
            [
                'sub.tracker.com/foo',
                'tracker.com/bar',
                'incomparable',
            ],
            [
                'tracker.com/vendor/.*/user.js',
                'tracker.com/vendor',
                'incomparable',
            ],
            [
                'tracker.com/api',
                'tracker.com/.*/script.js',
                'incomparable',
            ],
        ];
        for (const [
            a,
            b,
            expected,
        ] of cases) {
            it(`returns ${expected} for "${a}" vs "${b}"`, () => {
                expect(compareRules(a, b)).to.equal(expected);
            });
        }
    });

    describe('validateTrackerRules - failure cases', () => {
        it('detects ordering violation: general before specific', () => {
            const errors = validateTrackerRules('tracker.com', [
                r('tracker.com/api', 'site1.com'),
                r('tracker.com/api/endpoint', 'site1.com'),
            ]);
            expect(errors).to.have.length(1);
            expect(errors[0].type).to.equal('ORDERING_VIOLATION');
        });

        it('detects duplicate rules', () => {
            const errors = validateTrackerRules('tracker.com', [
                r('tracker.com/api', 'site1.com'),
                r('tracker.com/api', 'site1.com'),
            ]);
            expect(errors).to.have.length(1);
            expect(errors[0].type).to.equal('DUPLICATE_RULE');
        });

        it('detects missing domain propagation', () => {
            const errors = validateTrackerRules('tracker.com', [
                r('tracker.com/api/endpoint', 'site1.com'),
                r('tracker.com/api', 'site1.com', 'site2.com'),
            ]);
            expect(errors).to.have.length(1);
            expect(errors[0].type).to.equal('DOMAIN_PROPAGATION_VIOLATION');
        });

        it('detects <all> narrowing', () => {
            const errors = validateTrackerRules('tracker.com', [
                r('tracker.com/api/endpoint', 'site1.com'),
                r('tracker.com/api', '<all>'),
            ]);
            expect(errors).to.have.length(1);
            expect(errors[0].type).to.equal('DOMAIN_PROPAGATION_VIOLATION');
        });

        it('detects ordering violation: similar prefix without slash', () => {
            const errors = validateTrackerRules('tracker.com', [
                r('tracker.com/products', 'site1.com'),
                r('tracker.com/products-new', 'site1.com'),
            ]);
            expect(errors).to.have.length(1);
            expect(errors[0].type).to.equal('ORDERING_VIOLATION');
        });

        it('detects ordering violation: trailing slash', () => {
            const errors = validateTrackerRules('tracker.com', [
                r('tracker.com/api', 'site1.com'),
                r('tracker.com/api/', 'site1.com'),
            ]);
            expect(errors).to.have.length(1);
            expect(errors[0].type).to.equal('ORDERING_VIOLATION');
        });

        it('does not detect ordering violation for cross-subdomain rules', () => {
            const errors = validateTrackerRules('tracker.com', [
                r('tracker.com/api', 'site1.com'),
                r('cdn.tracker.com/api', 'site1.com'),
            ]);
            expect(errors).to.deep.equal([]);
        });
    });

    describe('validateTrackerRules - valid cases', () => {
        it('returns no errors for single rule tracker', () => {
            expect(
                validateTrackerRules('tracker.com', [
                    r('tracker.com/api', 'site1.com'),
                ]),
            ).to.deep.equal([]);
        });

        it('returns no errors for incomparable paths', () => {
            expect(
                validateTrackerRules('tracker.com', [
                    r('tracker.com/api', 'site1.com'),
                    r('tracker.com/other', 'site2.com'),
                ]),
            ).to.deep.equal([]);
        });

        it('returns no errors for sibling subdomains', () => {
            expect(
                validateTrackerRules('tracker.com', [
                    r('cdn.tracker.com/api', 'site1.com'),
                    r('media.tracker.com/api', 'site2.com'),
                ]),
            ).to.deep.equal([]);
        });

        it('returns no errors for trailing slash boundary (incomparable segments)', () => {
            expect(
                validateTrackerRules('tracker.com', [
                    r('tracker.com/products/', 'site1.com'),
                    r('tracker.com/products-new/', 'site2.com'),
                ]),
            ).to.deep.equal([]);
        });

        it('returns no errors when more-specific has <all>', () => {
            expect(
                validateTrackerRules('tracker.com', [
                    r('tracker.com/api/endpoint', '<all>'),
                    r('tracker.com/api', 'site1.com'),
                ]),
            ).to.deep.equal([]);
        });

        it('returns no errors for correct ordering and propagation', () => {
            expect(
                validateTrackerRules('tracker.com', [
                    r('tracker.com/api/endpoint', 'site1.com', 'site2.com'),
                    r('tracker.com/api', 'site2.com'),
                ]),
            ).to.deep.equal([]);
        });

        it('returns no errors for regex rules (skipped)', () => {
            expect(
                validateTrackerRules('tracker.com', [
                    r('tracker.com/vendor/.*/user.js', 'site1.com'),
                    r('tracker.com/vendor', 'site2.com'),
                ]),
            ).to.deep.equal([]);
        });
    });

    describe('validateAllowlist', () => {
        it('returns errors only for trackers with violations', () => {
            const errors = validateAllowlist({
                'good-tracker.com': {
                    rules: [
                        r('good-tracker.com/api/endpoint', 'site1.com'),
                        r('good-tracker.com/api', 'site1.com'),
                    ],
                },
                'bad-tracker.com': {
                    rules: [
                        r('bad-tracker.com/api', 'site1.com'),
                        r('bad-tracker.com/api/endpoint', 'site1.com'),
                    ],
                },
            });
            expect(errors).to.have.length(1);
            expect(errors[0].tracker).to.equal('bad-tracker.com');
            expect(errors[0].type).to.equal('ORDERING_VIOLATION');
        });

        it('returns no errors for a clean allowlist', () => {
            expect(
                validateAllowlist({
                    'tracker1.com': {
                        rules: [
                            r('tracker1.com/api', 'site1.com'),
                        ],
                    },
                    'tracker2.com': {
                        rules: [
                            r('tracker2.com/api/endpoint', 'site1.com'),
                            r('tracker2.com/api', 'site1.com'),
                        ],
                    },
                }),
            ).to.deep.equal([]);
        });

        it('returns multiple errors across trackers', () => {
            const errors = validateAllowlist({
                'tracker1.com': {
                    rules: [
                        r('tracker1.com/api', 'site1.com'),
                        r('tracker1.com/api/endpoint', 'site1.com'),
                    ],
                },
                'tracker2.com': {
                    rules: [
                        r('tracker2.com/api', 'site1.com'),
                        r('tracker2.com/api', 'site1.com'),
                    ],
                },
            });
            expect(errors).to.have.length(2);
            expect(errors[0].tracker).to.equal('tracker1.com');
            expect(errors[0].type).to.equal('ORDERING_VIOLATION');
            expect(errors[1].tracker).to.equal('tracker2.com');
            expect(errors[1].type).to.equal('DUPLICATE_RULE');
        });
    });

    describe('validate real tracker-allowlist.json', () => {
        it('has no violations in features/tracker-allowlist.json', () => {
            const config = JSON.parse(fs.readFileSync('./features/tracker-allowlist.json', 'utf-8'));
            const errors = validateAllowlist(config.settings.allowlistedTrackers);
            if (errors.length > 0) {
                throw new Error(`Found ${errors.length} violation(s) in base config:\n${formatErrors(errors)}`);
            }
        });
    });

    describe('validate generated platform configs', () => {
        const platformOutput = platforms.map((p) => p.replace('browsers/', 'extension-'));
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
