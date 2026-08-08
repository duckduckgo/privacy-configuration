# Adding a New Config Feature

1. **Create Feature File**
   - Copy `features/_template.json` to a new file in `features/`.
   - The filename (e.g., `myFeature.json`) becomes the feature key (camelCased) in the output.

2. **Feature Structure**
   - Top-level features should be platform-agnostic and shareable.
   - If the feature is platform-specific, reconsider its scope.
   - For similar or prefixed features, consider grouping as sub-features under a parent.

3. **Exceptions**
   - Add an `"exceptions"` key (list of TLDs) to disable the feature for specific sites (for breakage, etc.).

4. **Custom Keys**
   - Additional keys can be added, typically under a `"settings"` object.

5. **Schema Validation**
   - Always schema-validate your config to prevent broken merges.

6. **Web Content Features**
   - If the feature modifies web content (e.g., WebView), add its key to the designated array and ensure `"exceptions"` support.

7. **Review Process**
   - For PRs, add Config AoR primary/secondary as reviewers if waiting for review.
   - Do not merge code that depends on config changes until the config PR is ready and approved.

---

**References:**

- [Feature Flagging Guide](./feature-flagging-guide.md)
- [Config Maintainer Documentation](./config-maintainer-documentation.md)
- [🛠 Implementation Guidelines: Remote Privacy Configuration/Allowlists](./implementation-guidelines-remote-privacy-configuration-allowlists.md)
- [Incremental Rollout Implementation Guide](./incremental-rollout-implementation-guide.md)
- [Writing a Schema for Your Config Feature](./writing-schema-for-config-feature.md)
- [Remote Configuration Change Log](./remote-configuration-change-log.md)
- [Privacy Feature Key Mappings](./privacy-feature-key-mappings.md)
