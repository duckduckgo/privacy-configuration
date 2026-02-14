# Tracker Allowlist Mitigation Instructions

## Background

Tracker Allowlist is used to allow specific tracker requests that would normally be blocked by the tracker radar, where necessary to fix website breakages. The feature configuration lists rules of which tracker requests should be allowed for which websites. Care must be taken when writing these rules, since allowing tracker requests reduces privacy protection for users.

- **Configuration**: `features/tracker-allowlist.json` — Rule definitions (applies to all browser platforms)
- **Override files**: `overrides/` — Platform-specific configuration override files
- **Schema**: `schema/features/tracker-allowlist.ts` — TypeScript type definitions

## Quick Cheat Sheet

### Tracker Allowlist Decision Tree

1. Search existing rules first for both the domain you're mitigating and the rule you have in mind (including platform overrides)
2. Rule already exists? → Update domains/reason if needed. When updating, follow step 6 guidance.
3. Rule doesn't exist? → Make sure your new rule is specific but stable
   - Example: `tracker.com/api/endpoint` (avoid domain-only rules and dynamic params like user/session IDs)
4. Check if the new rule shares prefix with existing rules
   - Example: `tracker.com/api/endpoint` shares prefix with `tracker.com/api`
5. It shares prefix? → Order most-specific → least-specific
6. Add the site domain to all rules that share the same prefix (domain propagation)
   - Use `<all>` if appropriate (domain propagation not needed with `<all>`)
7. Multi-country/sibling sites affected? → Consider cross-entity coverage
8. Domain-wide exception needed? → Avoid if possible; document thoroughly

### Reference Tracker Rule Set

```json
"tracker.com": {
  "rules": [
    {
      "rule": "tracker.com/static/widget.js/config/analytics",
      "domains": ["site1.com", "site3.com"],
      "reason": [
        "site1.com - https://github.com/duckduckgo/privacy-configuration/pull/1111",
        "site3.com - https://github.com/duckduckgo/privacy-configuration/pull/3333"
      ]
    },
    {
      "rule": "tracker.com/static/widget.js/config",
      "domains": ["site3.com"],
      "reason": ["site3.com - https://github.com/duckduckgo/privacy-configuration/pull/3333"]
    },
    {
      "rule": "tracker.com/static/widget.js",
      "domains": ["<all>"],
      "reason": "https://github.com/duckduckgo/privacy-configuration/pull/4444"
    },
    {
      "rule": "tracker.com/api/collect",
      "domains": ["site2.com"],
      "reason": "site2.com - https://github.com/duckduckgo/privacy-configuration/pull/2222"
    }
  ]
}
```

## In-Depth Guidelines

### 1. Choosing Trackers to Allow

#### 1.1. Not too generic nor too specific
- Avoid domain-only rules (no path) whenever possible: `"rule": "tracker.com"`
- Avoid temporary URLs with dynamic parameters (user/session IDs, tokens, timestamps)
- Use specific, stable endpoint paths: `"rule": "tracker.com/api/endpoint"`

#### 1.2. Avoid regex/wildcards
Platforms have varying support for these.

### 2. Rule Precedence (Ordering)

Order rules **most-specific → least-specific**, but only when both can match the same tracker request.

#### 2.1. First Match Wins
The algorithm checks rules top to bottom and stops at the first matching rule:
1. Check rules from top to bottom until a rule matches the request URL
2. When a rule matches: if the domain is in the rule's list → allowed; if `<all>` → allowed; otherwise → blocked
3. The algorithm stops at the first match

#### 2.2. When Order Matters
Order matters only if two rules could match the same request. A rule is more specific if it uses a subdomain or has a longer path.

If two rules can't match the same request (different domains or non-overlapping paths), order doesn't matter.

#### 2.3. Domain Propagation
For same tracker requests, a domain in a less-specific rule must also appear in all more-specific rules. This prevents the more-specific rule from blocking the request before the less-specific rule can allow it.

**Not needed when using `<all>`** — it already covers all domains.

#### 2.4. The `<all>` Specifier
Treated as if every domain were specified. A more-specific rule without `<all>` restricts that path to listed domains only.

### 4. Cross-Entity Coverage
- **Multi-country brands**: Consider adding mitigations across country sites (e.g., `vinted.com`, `vinted.fr`, `vinted.de`)
- **Sibling sites under same parent company**: Check if breakage exists, then consider adding coverage

### 5. Domain-Wide Exceptions
Added to the `"exceptions"` array of `features/content-blocking.json`. Allows all tracker requests from that domain. **Avoid whenever possible.** Document thoroughly if required.
