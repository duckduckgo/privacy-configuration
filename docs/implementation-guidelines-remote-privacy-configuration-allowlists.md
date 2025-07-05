# 🛠 Implementation Guidelines: Remote Privacy Configuration/Allowlists

## User Unprotected Sites List

When a user disables protections manually ("Site Privacy Protection"/"Protections are ENABLED for this site" toggle off):

- All privacy protections should be disabled, including custom user agent (if used by the app).
- Any content scripts related to privacy protections should NOT be injected into the page (they might interfere and cause breakage).
  - This does not include features that are not protections and would be unexpected to get disabled (like autofill).
- Protections should be disabled for the current domain only (e.g., `https://example.com`) and NOT its subdomains (e.g., `https://other.example.com`).
  - "www." subdomain gets special treatment: `https://example.com` and `https://www.example.com` are considered the same for safelisting.
  - Hostname matching for user safelist is different from global temporary sites list domain matching.
- User should be able to enable protections again. Status should be reflected by the "Site Privacy Protection" toggle.
- Manual exceptions do not expire and survive the fire button.

Reference tests: [privacy-reference-tests](https://github.com/duckduckgo/privacy-reference-tests/tree/main/privacy-configuration)

## Global Temporary Sites List & Per-feature Allow Lists

- Products download a configuration file defining which privacy features are enabled and which sites are excluded (globally or per-feature).
- If the downloaded config fails to parse, platforms should embed a local copy with the installation.
- Example config: [extension-config.json](https://staticcdn.duckduckgo.com/trackerblocking/config/v1/extension-config.json)
- Features included in the config files: [Feature Key Mappings](https://app.asana.com/0/0/1201287926785314/f/)
- Structure specified in [`schema/config.ts`](https://github.com/duckduckgo/privacy-configuration/blob/main/schema/config.ts).
- Load the file for your platform: `<platform>-config.json`

### Format
- `version`: Timestamp (ms since Unix epoch) when the config was published. Always increases, even on rollback.
- `features`: Mapping of all privacy features and their properties.
  - `featurename`: Canonical name for the feature.
    - `state`: If the feature is enabled/disabled/internal/preview. Unknown states should be treated as disabled.
    - `exceptions`: Websites that have this feature disabled. (domain, reason)
    - `minSupportedVersion`: Minimum platform version for which this feature should be enabled. (Android uses numbers, others use strings)
    - `features`: Some features have sub-features.
      - `state`, `minSupportedVersion`, `description`, `rollout`, `targets`, `cohorts` (see Asana for details)
    - `settings`: Optional mapping for extra info needed for the feature. (e.g., scripts, aboutBlankEnabled, aboutBlankSites)
      - Some features use other keys; see feature-specific docs.
- `unprotectedTemporary`: Websites that have ALL features disabled (same format as `exceptions`).
- `experimentalVariants`: Mapping of all live experiment variants and their properties (Android only).

### Notes
- All `domain` fields are wildcarded by default (e.g., `https://bank.com` matches `https://bank.com` and all subdomains), except user manual disables, which are not wildcarded.
- All exceptions should only match the top frame URL and apply to all subframes.
- If a single feature in the config fails to parse, it should be considered disabled.

### Implementation Verification
- Reference tests: [privacy-reference-tests](https://github.com/duckduckgo/privacy-reference-tests/tree/main/privacy-configuration)
- Tracker allowlisting config feature tests: [tracker_allowlist_matching_tests.json](https://github.com/duckduckgo/privacy-reference-tests/blob/main/tracker-radar-tests/TR-domain-matching/tracker_allowlist_matching_tests.json)

### Additional References
- [Current platform support of a feature](https://app.asana.com/0/0/1201287926785314/f/)
- [Maintaining these features](https://app.asana.com/0/0/1200573250322769/f/)

### See Also

- [Config Maintainer Documentation](./config-maintainer-documentation.md)
- [Config Reviewer Documentation](./config-reviewer-documentation.md)
- [Feature Implementer Documentation](./feature-implementer-documentation.md)
- [Privacy Feature Key Mappings](./privacy-feature-key-mappings.md)
- [Incremental Rollout Implementation Guide](./incremental-rollout-implementation-guide.md)
- [Writing a Schema for Your Config Feature](./writing-schema-for-config-feature.md)
- [Remote Configuration Change Log](./remote-configuration-change-log.md) 