# Remote Configuration Change Log

Moving forward, config updates should be handled during weekly platform maintenance. When a new config is available, a new task will be created in each platform's maintenance task. Unless otherwise noted or needed by an upcoming project, updates do not need to be considered priority or time-sensitive.

Unless otherwise noted, each change in a version can be optionally implemented. However, all changes should be implemented on the platform to be considered in full support.

## Config Update Steps

1. Update the URL on the platform to pull from the latest version (e.g., `.../config/v4/...` → `.../config/v5/...`).
2. Refer to this change log to determine any breaking changes that should be implemented in this update.

## Version History

### v5 ([PR #3358](https://github.com/duckduckgo/privacy-configuration/pull/3358))
- `preview` added as a possible state for features and sub-features.
  - For release channels, this should be considered as disabled.
  - If the platform has a preview channel, consider making it enabled.
  - Support for v5 is ensuring that release doesn't get enabled when preview is set.
- `maxSupportedVersion` (Optional Support): added to features and sub-features. If present, the corresponding feature should not be enabled if the platform version is above this value. The comparison is inclusive: a platform version equal to the value is supported.
  - Clients that do not implement it ignore the key. Config that sets `maxSupportedVersion` must also set `minSupportedVersion` on the same object, at or above the platform's first release that implements it.
  - A platform adds that release to `maxSupportedVersionSince` in `tests/config-tests.js` when it ships support. The tests reject `maxSupportedVersion` on platforms without an entry.

### v4 ([PR #1325](https://github.com/duckduckgo/privacy-configuration/pull/1325))
- `reason` fields stripped from generated output.
- `internal` added as a possible state for features and sub-features.

### v3 ([PR #1151](https://github.com/duckduckgo/privacy-configuration/pull/1151))
- `rollout` (sub-features only): when present, the corresponding sub-feature should be enabled incrementally based on the values in the object. See [rollout implementation details](https://app.asana.com/0/0/1204934761241565) for full client-side implementation.
  - Optional Support: If a platform does not implement this functionality, the feature should be considered disabled on the platform.
- Windows only: non-`enabled` features are disabled ([commit](https://github.com/duckduckgo/privacy-configuration/commit/e0d868262701a6930e7bd9fec6cd71507b8bb525)).

### v2 ([PR #176](https://github.com/duckduckgo/privacy-configuration/pull/176))
- `minSupportedVersion` (Required Support): Added to features and sub-features. If present, the corresponding feature should not be enabled if the platform version is below this value.

## See Also

- [Config Maintainer Documentation](./config-maintainer-documentation.md)
- [Config Reviewer Documentation](./config-reviewer-documentation.md)
- [Feature Implementer Documentation](./feature-implementer-documentation.md)
- [Privacy Feature Key Mappings](./privacy-feature-key-mappings.md)
- [🛠 Implementation Guidelines: Remote Privacy Configuration/Allowlists](./implementation-guidelines-remote-privacy-configuration-allowlists.md)
- [Incremental Rollout Implementation Guide](./incremental-rollout-implementation-guide.md)
- [Writing a Schema for Your Config Feature](./writing-schema-for-config-feature.md) 