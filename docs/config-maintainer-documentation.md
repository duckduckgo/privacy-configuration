# Config Maintainer Documentation

**Repo Location:** <https://github.com/duckduckgo/privacy-configuration>

## Before You Start

- Determine if your change should be global (all platforms) or platform-specific.
- Prefer platform-specific changes to maximize user protection.
- Use feature-specific exception lists and the global temporary unprotected list to minimize disruption.

---

## Global Changes

### Adding/Updating Features

1. Copy `features/_template.json` to a new file in `features/`.
2. The filename (e.g., `myFeature.json`) becomes the feature key (camelCased) in the output.
3. JSON files are copied into the generated output (see [🛠 Implementation Guidelines: Remote Privacy Configuration/Allowlists](./implementation-guidelines-remote-privacy-configuration-allowlists.md)).
4. The `_meta` key is removed (for documentation only).
5. Add an `"exceptions"` key (list of TLDs) to disable the feature for specific sites.
6. Other keys can be added, typically under a `"settings"` object.

---

## Platform-Specific Changes

1. Make changes in the appropriate override file in the `overrides/` directory (`<platform>-override.json`).
2. To change a feature's state:
   - Ensure the feature is listed under `features` in the override file.
   - Add a `state` key if it doesn't exist.
   - Set `state` to the desired value.
   - If `state` is "disabled" or missing, the feature won't appear in the generated file.
3. To change a feature's settings:
   - Ensure the feature has a `settings` key with all required properties.
   - Set new values as needed.
   - ⚠️ Platform overrides all keys in features except `"exceptions"` and `"unprotectedTemporary"` (these are concatenated).

---

## After Making Changes

1. Ensure dependencies are installed: `npm install`
2. Run `node index.js` and verify the output in the `generated/` directory.
3. Commit your changes.
4. Create a PR on GitHub. When merged, config files are built and pushed to production automatically.
   - Mark as draft if not ready.
   - Mark as 'merge when ready' if ready for review/merge.
   - Tag a reviewer familiar with the problem.
5. ⚠️ If waiting for review, ping the [~Breakage](https://chat.duckduckgo.com/ddg/channels/breakage) channel on Mattermost for help.

---

## See Also

- [Feature Flagging Guide](./feature-flagging-guide.md)
- [Feature Implementer Documentation](./feature-implementer-documentation.md)
- [Config Reviewer Documentation](./config-reviewer-documentation.md)
- [Privacy Feature Key Mappings](./privacy-feature-key-mappings.md)
- [🛠 Implementation Guidelines: Remote Privacy Configuration/Allowlists](./implementation-guidelines-remote-privacy-configuration-allowlists.md)
- [Incremental Rollout Implementation Guide](./incremental-rollout-implementation-guide.md)
- [Writing a Schema for Your Config Feature](./writing-schema-for-config-feature.md)
- [Remote Configuration Change Log](./remote-configuration-change-log.md)
