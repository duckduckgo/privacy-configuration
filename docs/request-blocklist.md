# Request Blocklist

## Background

The Request Blocklist feature is used to block arbitrary web requests where necessary to fix website breakage and other issues. The feature configuration lists rules of which requests should be blocked for which websites. Care must be taken when writing these rules, since blocking requests can also cause website breakage issues.

See:
- [Request Blocklist feature configuration](/features/request-blocklist.json) (applies to all browser platforms)
- [Platform-specific configuration override files](/overrides/)
- [The schema for request blocklist rules](/schema/features/request-blocklist.ts)

## Reviewing Changes

- Ensure that the modified rules follow the schema.

- Flag risky rule changes (where excess requests could be blocked) for manual review. For example:

  1. Rules that match a request for all website domains (that specify `"domains": ["<all>"]`).
  2. Rules that are very broad, e.g. are not restricted by path or other parts of URL other than request domain.
  3. Rules that apply to first-party requests, e.g. that specify website `"domains": []` array that includes the same domains as request.

- Catch common mistakes:

  1. Rules using regular expression or similar advanced syntax (only basic `*` wildcard matching is supported).
  2. Rules starting or ending with `*` wildcard (unnecessary, since that is implied).
  3. `"domains"` array should not be empty.
  4. `"domains"` array containing `"<all>"` should not contain any other domains.
  5. `"reason"` field must contain a useful reason, or provide a URL for more context. For cases where the rule applies to multiple domains, the reason field must be an array of reason strings, with each reason string starting with `"DOMAIN - "` followed by the reason, for example `"reason": ["domain1.example - PR1_URL", "domain2.example - PR2_URL"]`.
