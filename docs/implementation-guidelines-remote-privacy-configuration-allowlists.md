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
- Features included in the config files: [Feature Key Mappings](./privacy-feature-key-mappings.md)
- Structure specified in [`schema/config.ts`](https://github.com/duckduckgo/privacy-configuration/blob/main/schema/config.ts).
- Load the file for your platform: `<platform>-config.json`

### Format
- `version`: Timestamp (ms since Unix epoch) when the config was published. Always increases, even on rollback.
- `features`: Mapping of all privacy features and their properties.
  - `featurename`: Canonical name for the feature.
    - `state`: If the feature is enabled/disabled/internal/preview.
        - ⚠️ Clients should be able to parse any string here, treating unknown states as disabled.
    - `hash`: The generated config outputs the hash of the stringified config.
    - `exceptions`: Websites that have this feature disabled. (domain, reason)
      - `domain`: top level URL
      - `reason`: [removed from [v4](https://app.asana.com/1/137249556945/project/1200890834746050/task/1205680646032200?focus=true) onwards and should not be relied upon] the reason for the exception
    - `minSupportedVersion`: Minimum platform version for which this feature should be enabled. (Android uses numbers, others use strings)
    - `description`: (v6+) optional human-readable description for the feature.
    - `rollout`: (v6+) optional progressive rollout configuration (same format as sub-feature rollout).
    - `targets`: (v6+) optional targeting rules for the feature (same format as sub-feature targets).
    - `cohorts`: (v6+) optional, but **not functionally supported** at parent level. Use sub-feature cohorts for experiments.
    - `features`: Some features have sub-features.
      - `state`: same as parent features.
          - ⚠️ unclear if a disabled feature should make a sub-feature disabled (Android/Extensions does not but iOS/macOS and Windows does).
      - `minSupportedVersion`: same as parent features.
      - `description`: optional and non functional to describe the sub feature.
      - `rollout`: They can also support progressive rollout which are described here: ✓ NetP: Feature Flag Incremental Rollouts
          - [Windows] rollout applies separately to enabled/preview states. More info here: [Add a feature flag via Remote Config](https://app.asana.com/1/137249556945/project/1208736637614995/task/1207579150090376?focus=true)
      - `targets`: Permits enabling of the features based on certain conditions.
      - `cohorts`: Enables [Native Apps Experiment Framework (A/B testing framework)](https://app.asana.com/1/137249556945/project/1208889145294658/list/1208889101183474)
      - `exceptions`: (v6+) optional per-domain exceptions for this sub-feature (same format as parent feature exceptions). When a feature supports exceptions, sub-features should also support them for finer-grained control.
    - `settings`: Optional mapping for extra info needed for the feature. (e.g., scripts, aboutBlankEnabled, aboutBlankSites)
      - In our browser extension it may be common to see the following keys within "settings"
      - `scripts`: a list of URL regexes that are exempted from protection (follows the same format as "exceptions")
        - Note: this is a runtime protection and we trace the stack to see if the script URL is within the trace. This can't capture all scripts, but for common cases it should work.
      - `aboutBlankEnabled`: if set to "disabled" this disables the specific feature for about:blank frames embedded within websites.
      - `aboutBlankSites`: a list of sites disabling about:blank frame protection (follows the same format as "exceptions")
      - Some features (such as [Temporary tracker allowlist](https://app.asana.com/1/137249556945/project/1163321984198618/task/1200434943367884?focus=true)) use other keys not mentioned here. If this is the case it will be documented in the feature's own documentation and implementation guidelines.
- `unprotectedTemporary`: Websites that have ALL features disabled (same format as `exceptions`).
- `experimentalVariants`: Mapping of all live experiment variants and their properties (Android only [Add 'experimentalVariants' and 'targets' to remote config](https://app.asana.com/1/137249556945/project/1200890834746050/task/1205908353497982)).
  - `desc`: variant's description for documentation purposes.
  - `variantKey`: letters associated to the experimental variant.
  - `weight`: weight of the variant [0.0-1.0] to be used for the distribution.
  - `filters`: a mapping of filters to be used to allocate a user to the variant or not. For now, we only support locale, but could expand in the future.

### Notes
- All `domain` fields are wildcarded by default (e.g., `https://bank.com` matches `https://bank.com` and all subdomains), except user manual disables, which are not wildcarded.
- All exceptions should only match the top frame URL and apply to all subframes.  e.g. Let's say that the feature X has "safelisted.com" on the "exceptions" list. This means that if "safelisted.com" is loaded as an iframe on "example.com" the exception does NOT apply. It also means that if "safelsited.com" (where exception does apply) has an iframe with "example.com" the exception DOES apply to that frame also.
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