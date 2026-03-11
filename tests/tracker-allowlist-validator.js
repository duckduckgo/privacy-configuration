/**
 * Validates tracker allowlist rules for ordering, domain propagation, and duplicates.
 * @module tests/tracker-allowlist-validator
 */

/**
 * Split a rule string into domain and path components.
 * Trailing slashes are treated as regular characters (no normalization).
 *
 * @param {string} rule - Rule string (e.g. "tracker.com/api/endpoint")
 * @returns {[string, string]} [domain, path] - e.g. ["tracker.com", "/api/endpoint"]
 */
export function splitDomainPath(rule) {
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
export function isSubdomainOrEqual(domA, domB) {
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
export function isRegexRule(rule) {
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
export function compareRulePaths(path1, path2) {
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
export function compareRules(ruleA, ruleB) {
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

/** @typedef {{ rule: string, domains: string[] }} AllowlistRule */
/** @typedef {{ type: 'ORDERING_VIOLATION' | 'DOMAIN_PROPAGATION_VIOLATION' | 'DUPLICATE_RULE', tracker: string, ruleA: AllowlistRule, ruleB: AllowlistRule, message: string, suggestion: string }} ValidationError */

/**
 * Validate rules for a single tracker. Checks ordering, domain propagation, and duplicates.
 *
 * @param {string} trackerDomain - Tracker domain (e.g. "tracker.com")
 * @param {AllowlistRule[]} rules - Rules for this tracker (order = file order)
 * @returns {ValidationError[]}
 */
export function validateTrackerRules(trackerDomain, rules) {
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
                    suggestion: 'Remove the duplicate rule.',
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
                    suggestion: 'Move the more-specific rule above the more-general rule.',
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
                        suggestion: 'Add <all> to the more-specific rule, or remove it if redundant.',
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
                        suggestion: 'Add the missing domain(s) to the more-specific rule.',
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
export function validateAllowlist(allowlistedTrackers) {
    const errors = [];
    for (const [
        trackerDomain,
        tracker,
    ] of Object.entries(allowlistedTrackers)) {
        errors.push(...validateTrackerRules(trackerDomain, tracker.rules));
    }
    return errors;
}
