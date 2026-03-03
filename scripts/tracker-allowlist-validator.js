/**
 * Validates tracker allowlist rules for ordering, domain propagation, and duplicates.
 * @module scripts/tracker-allowlist-validator
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
        return [rule, ''];
    }
    return [rule.slice(0, slashIndex), rule.slice(slashIndex)];
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
    return /\.\*|\\\.|[\[\]|]/.test(rule);
}

/**
 * Compare two path strings (the path part after the domain).
 * Uses string prefix: pathA is more specific than pathB if pathB is a prefix of pathA.
 *
 * @param {string} path1 - First path (e.g. "/api/endpoint")
 * @param {string} path2 - Second path (e.g. "/api")
 * @returns {number} -1 if path1 more specific, 0 if equal, 1 if path1 more general, 2 if incomparable
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

    const [domA, pathA] = splitDomainPath(ruleA);
    const [domB, pathB] = splitDomainPath(ruleB);

    const pathComp = compareRulePaths(pathA, pathB);

    // Same domain and same path → equal
    if (domA === domB && pathComp === 0) {
        return 'equal';
    }

    // ruleA more specific than ruleB: domainA is subdomain-or-equal of domainB, pathA more specific than pathB
    if (isSubdomainOrEqual(domA, domB) && pathComp === -1) {
        return 'moreSpecific';
    }

    // ruleA more general than ruleB: domainB is subdomain-or-equal of domainA, pathA more general than pathB
    if (isSubdomainOrEqual(domB, domA) && pathComp === 1) {
        return 'moreGeneral';
    }

    return 'incomparable';
}
