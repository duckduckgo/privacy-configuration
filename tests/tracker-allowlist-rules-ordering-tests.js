import { expect } from 'chai';
import fs from 'fs';
import { createValidator } from './schema-validation.js';

/**
 * Extract domain and path portion from a rule string
 * Note: "path" here refers to the path portion of the rule string (after the domain),
 * not a JSON property. The JSON uses "rule" as the property name.
 * @param {string} rule - e.g., "www.example.com/foo/bar" or "example.com"
 * @returns {{domain: string, path: string}} - e.g., {domain: "www.example.com", path: "/foo/bar"}
 */
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

/**
 * A rule B is more specific than a rule A if they share the same prefix (same domain, path prefix).
 * 
 * Rules share the same prefix when:
 *   - Same domain: foo.com/bar/baz shares prefix with foo.com/bar
 * 
 * Rules do NOT share the same prefix when:
 *   - Different hosts: www.example.com/foo ≠ example.com/foo ≠ cdn.example.com/foo
 * 
 * Examples:
 *   - foo.com/bar/baz is more specific than foo.com/bar (same domain, path prefix)
 *   - foo.com/bar/baz/buz is more specific than foo.com/bar/baz (same domain, path prefix)
 *   - www.example.com/foo is NOT more specific than example.com/foo (different hosts)
 */
function isMoreSpecific(moreRule, lessRule) {
  const more = parseRule(moreRule);
  const less = parseRule(lessRule);

  // Only check if same domain - different hosts (subdomains) never match
  if (more.domain !== less.domain) {
    return false;
  }

  // Same domain - check if one path is a prefix of another
  const lessPathPrefix = less.path.endsWith('/') ? less.path : less.path + '/';
  return more.path.startsWith(lessPathPrefix) && more.path.length > less.path.length;
}

/**
 * Detect rule inconsistencies:
 *
 * If a domain appears in a LESS-specific rule (e.g. foo.com/bar),
 * then it must also appear in ALL MORE-specific rules
 * with the same prefix (e.g. foo.com/bar/baz).
 */
function findMissingDomainInMoreSpecificRules(rules) {
  const problems = [];

  // Collect all unique domains in the ruleset
  const allDomains = new Set();
  for (const rule of rules) {
    for (const d of rule.domains) {
      allDomains.add(d);
    }
  }

  // Annotate rules with index
  const indexedRules = rules.map((rule, index) => ({ ...rule, index }));

  // Check domain propagation for each domain independently
  for (const domain of allDomains) {
    for (const less of indexedRules) {
      if (!less.domains.includes(domain)) continue;

      for (const more of indexedRules) {
        // Only check "downward" propagation
        if (!isMoreSpecific(more.rule, less.rule)) continue;

        // Domain missing from more-specific rule? → Problem
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

// ----------------------------------------------------------------------
// ⭐ TESTS
// ----------------------------------------------------------------------

describe('Allowlist rule ordering & domain propagation', () => {
  let trackerAllowlistData;

  // Load the actual JSON file once before all tests
  before(() => {
    const fileContent = fs.readFileSync('./features/tracker-allowlist.json', 'utf8');
    trackerAllowlistData = JSON.parse(fileContent);
  });

  it('recognizes more-specific vs unrelated rules', () => {
    // Same domain - path prefix checks (share same prefix)
    expect(isMoreSpecific('foo.com/bar/baz', 'foo.com/bar')).to.equal(true);   // child path
    expect(isMoreSpecific('foo.com/bar/baz/buz', 'foo.com/bar/baz')).to.equal(true); // deeper path
    expect(isMoreSpecific('foo.com/bar', 'foo.com/bar/baz')).to.equal(false);  // parent path
    expect(isMoreSpecific('foo.com/bar2', 'foo.com/bar')).to.equal(false);     // sibling paths
    
    // Different hosts - do NOT share same prefix (order doesn't matter)
    expect(isMoreSpecific('www.example.com/foo', 'example.com/foo')).to.equal(false);   // different hosts
    expect(isMoreSpecific('cdn.example.com/foo', 'example.com/foo')).to.equal(false);    // different hosts
    expect(isMoreSpecific('example.com/foo', 'other.com/foo')).to.equal(false);        // unrelated domains
  });

  it('passes for the correct configuration (your intended example)', () => {
    const rules = [
      { rule: 'foo.com/bar/baz', domains: ['site1.com', 'site2.com'] },
      { rule: 'foo.com/bar',     domains: ['site2.com'] },
    ];

    const problems = findMissingDomainInMoreSpecificRules(rules);
    expect(problems).to.have.lengthOf(0);
  });

  it('detects missing domain on a more-specific rule (broken example)', () => {
    const rules = [
      { rule: 'foo.com/bar/baz', domains: ['site1.com'] }, // Missing site2.com
      { rule: 'foo.com/bar',     domains: ['site1.com', 'site2.com'] },
    ];

    const problems = findMissingDomainInMoreSpecificRules(rules);

    // Expect a problem specifically about site2.com
    const hasExpectedProblem = problems.some(
      (p) =>
        p.domain === 'site2.com' &&
        p.lessSpecificRule === 'foo.com/bar' &&
        p.moreSpecificRule === 'foo.com/bar/baz'
    );

    expect(hasExpectedProblem).to.equal(true);
  });

  it('does NOT force domains upward (valid behavior)', () => {
    const rules = [
      { rule: 'foo.com/bar',     domains: [] },
      { rule: 'foo.com/bar/baz', domains: ['site2.com'] }, // only deeper
    ];

    const problems = findMissingDomainInMoreSpecificRules(rules);
    expect(problems).to.have.lengthOf(0);
  });

  it('validates rules are ordered most-specific to least-specific in actual tracker-allowlist.json', () => {
    const trackers = trackerAllowlistData.settings?.allowlistedTrackers;
    expect(trackers).to.exist;

    const orderingProblems = [];

    // Check each tracker domain's rules
    for (const [trackerDomain, config] of Object.entries(trackers)) {
      if (!config.rules || config.rules.length < 2) continue;

      // Check if rules are ordered correctly (most-specific first)
      for (let i = 0; i < config.rules.length; i++) {
        for (let j = i + 1; j < config.rules.length; j++) {
          const earlierRule = config.rules[i];
          const laterRule = config.rules[j];

          // If later rule is more specific than earlier rule, ordering is wrong
          if (isMoreSpecific(laterRule.rule, earlierRule.rule)) {
            orderingProblems.push({
              trackerDomain,
              earlierRule: earlierRule.rule,
              laterRule: laterRule.rule,
              earlierIndex: i,
              laterIndex: j,
            });
          }
        }
      }
    }

    // Report any ordering issues found
    if (orderingProblems.length > 0) {
      const errorMessages = orderingProblems.map(({ trackerDomain, earlierRule, laterRule, earlierIndex, laterIndex }) => 
        `  - Rule at index ${earlierIndex} ("${earlierRule}") should come after rule at index ${laterIndex} ("${laterRule}")`
      ).join('\n');
      
      const groupedByTracker = orderingProblems.reduce((acc, p) => {
        if (!acc[p.trackerDomain]) acc[p.trackerDomain] = [];
        acc[p.trackerDomain].push(p);
        return acc;
      }, {});

      const groupedMessages = Object.entries(groupedByTracker).map(([tracker, problems]) => {
        const details = problems.map(p => 
          `  - Rule at index ${p.earlierIndex} ("${p.earlierRule}") should come after rule at index ${p.laterIndex} ("${p.laterRule}")`
        ).join('\n');
        return `${tracker}:\n${details}`;
      }).join('\n\n');
      
      throw new Error(`Rule ordering issues found (rules should be most-specific first):\n\n${groupedMessages}`);
    }

    expect(orderingProblems).to.have.lengthOf(0);
  });

  it('validates domain propagation in actual tracker-allowlist.json', () => {
    const trackers = trackerAllowlistData.settings?.allowlistedTrackers;
    expect(trackers).to.exist;

    const allProblems = [];

    // Check each tracker domain's rules
    for (const [trackerDomain, config] of Object.entries(trackers)) {
      if (!config.rules || config.rules.length === 0) continue;

      const problems = findMissingDomainInMoreSpecificRules(config.rules);
      
      if (problems.length > 0) {
        allProblems.push({
          trackerDomain,
          problems,
        });
      }
    }

    // Report any issues found
    if (allProblems.length > 0) {
      const errorMessages = allProblems.map(({ trackerDomain, problems }) => {
        const problemDetails = problems.map(p => 
          `  - Domain "${p.domain}" in "${p.lessSpecificRule}" missing from "${p.moreSpecificRule}"`
        ).join('\n');
        return `${trackerDomain}:\n${problemDetails}`;
      }).join('\n\n');
      
      throw new Error(`Domain propagation issues found:\n\n${errorMessages}`);
    }

    expect(allProblems).to.have.lengthOf(0);
  });

});
