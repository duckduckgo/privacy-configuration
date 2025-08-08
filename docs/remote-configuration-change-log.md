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

### v4 ([PR #1325](https://github.com/duckduckgo/privacy-configuration/pull/1325))
- `reason` fields stripped from generated output.
- `internal` added as a possible state for features and sub-features.

### v3 ([PR #1151](https://github.com/duckduckgo/privacy-configuration/pull/1151))
- `rollout` (sub-features only): when present, the corresponding sub-feature should be enabled incrementally based on the values in the object. See [rollout implementation details]() for full client-side implementation.
  - Optional Support: If a platform does not implement this functionality, the feature should be considered disabled on the platform.
- Windows only: non-`enabled` features are disabled ([commit]()).

### v2 ([PR #176](https://github.com/duckduckgo/privacy-configuration/pull/176))
- `minSupportedVersion` (Required Support): Added to features and sub-features. If present, the corresponding feature should not be enabled if the platform version is below this value.

## See Also

- [Config Maintainer Documentation](./config)
- [Config Reviewer Documentation](./config)
- [Feature Implementer Documentation](./-)
- [Privacy Feature Key Mappings](./privacy)
- [🛠 Implementation Guidelines: Remote Privacy Configuration/Allowlists](./
-guidelines-remote-privacy-configuration-allowlists.md)
- [Incremental Rollout Implementation Guide](./)
- [Writing a Schema for Your Config Feature](./writing) 
