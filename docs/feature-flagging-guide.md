# Feature Flagging with Privacy Configuration

This document explains how feature flagging works across DuckDuckGo clients via the privacy remote configuration system, and how it relates to client-side feature flags.

## Overview

Feature flagging at DuckDuckGo uses **two layers**:

1. **Remote Configuration (this repo)** -- the server-side feature state, sub-features, rollouts, and settings defined in `features/` and `overrides/`.
2. **Client-side feature flags** -- each native client declares its own local feature flag enum that optionally maps to a remote config feature/sub-feature.

The remote config acts as the **source of truth for remotely-controlled flags**. Clients consume the generated `<platform>-config.json` at runtime to resolve whether a feature or sub-feature is enabled.

## How the Remote Config Controls Features

Every feature in this repo starts as a JSON file in `features/`. The template (`features/_template.json`) looks like:

```json
{
    "_meta": {
        "description": "Explain the feature here."
    },
    "state": "disabled",
    "exceptions": []
}
```

### Parent feature properties

| Field | Purpose |
|---|---|
| `state` | `"enabled"`, `"disabled"`, `"internal"`, or `"preview"`. Unknown values are treated as disabled. |
| `exceptions` | Sites where the feature is disabled (breakage fixes). |
| `settings` | Arbitrary key-value data the feature needs at runtime. |
| `features` | Sub-features nested under this parent (see below). |

### Sub-feature properties

Sub-features live inside a parent's `features` object and support additional capabilities that **parent features do not**:

| Field | Purpose |
|---|---|
| `state` | Same semantics as parent features. |
| `minSupportedVersion` | Minimum platform version for which this sub-feature is enabled. |
| `rollout` | Progressive rollout via percentage steps. See [Incremental Rollout Guide](./incremental-rollout-implementation-guide.md). |
| `targets` | Audience targeting conditions (variant, locale, returning user, etc.). |
| `cohorts` | A/B test cohort definitions with weights and enrollment tracking. |

> **Note:** `rollout`, `targets`, and `cohorts` are only supported on sub-features. If you need these capabilities, use a sub-feature rather than a parent feature. This distinction is important -- see [v6 config parity](https://app.asana.com/1/137249556945/project/1200890834746050/task/1208934823027474) for the ongoing work to align this across clients.

Platform-specific overrides live in `overrides/<platform>-override.json` and can change `state`, add sub-features, or override `settings` for a single platform.

For full format details see: [Implementation Guidelines](./implementation-guidelines-remote-privacy-configuration-allowlists.md).

## Choosing a Default Value

Every feature flag has a **default value** -- the fallback used when the remote config is unavailable or the flag has no remote state. The choice between `false` and `true` depends on the nature of the feature.

### Default `false` (opt-in)

Use when the feature is **new or experimental** and should not activate without an explicit remote config push:

- The feature is off until remote config enables it.
- Nothing changes for users until you are ready.
- If remote config is unreachable, the untested code path stays inactive.

### Default `true` (failsafe / kill-switch)

Use when the feature is **stable or already shipping** and you want the ability to disable it remotely if problems arise:

- The feature is on by default, so users get the expected behaviour even if remote config fails.
- You retain the ability to **kill-switch** the feature remotely without an app update.
- Appropriate when migrating existing always-on behaviour behind a flag for operational safety.

Apple refers to this pattern as a **failsafe feature flag** -- see [Using failsafe feature flags](https://app.asana.com/0/0/1209498782498498/f) for their guidance on when this is the right choice.

Each client expresses this concept slightly differently -- see the per-client sections below.

## Client-Side Integration

Each client has its own feature flag system that reads from the remote config. See the platform-specific guides for implementation details, code examples, and file locations:

| Platform | Guide |
|---|---|
| Apple (iOS / macOS) | [Feature Flag Guide](https://github.com/duckduckgo/apple-browsers/blob/main/SharedPackages/BrowserServicesKit/Sources/PrivacyConfig/FeatureFlagger/feature-flag-guide.md) |
| Android | [Feature Toggles Guide](https://github.com/duckduckgo/Android/blob/main/feature-toggles/readme.md) |
| Windows | [Feature Flag Guide](https://github.com/duckduckgo/windows-browser/blob/main/docs/feature-flag-guide.md) |
| Browser Extension | [Feature Flags](https://github.com/duckduckgo/duckduckgo-privacy-extension/blob/main/docs/feature-flags.md) |
| Content Scope Scripts | [Features Guide -- Remote Configuration](https://github.com/duckduckgo/content-scope-scripts/blob/main/injected/docs/features-guide.md#remote-configuration-and-feature-flags) |

## Where to Add a New Feature Flag

| What you want | Where to do it |
|---|---|
| **New remote config feature** (shared/cross-platform) | Create `features/myFeature.json`, optionally add platform overrides. See [Adding a New Config Feature](./feature-implementer-documentation.md). |
| **New platform-specific sub-feature** | Add to the relevant `overrides/<platform>-override.json` or to the feature's base file under `features`. |
| **New client-side flag backed by remote config** | See the platform-specific guide above for how to wire a remote config feature to a client-side flag. |
| **Schema validation** | Create a TypeScript schema in `schema/features/`. See [Writing a Schema](./writing-schema-for-config-feature.md). |
| **Incremental rollout** | Add a `rollout` object with `steps` to a sub-feature. See [Incremental Rollout Guide](./incremental-rollout-implementation-guide.md). |

## Best Practices

1. **Choose the right default** -- `false` for new/experimental features; `true` (failsafe) for stable features that need a kill-switch. See [Choosing a Default Value](#choosing-a-default-value).
2. **Use sub-features** for granular control under a parent feature. Sub-features support rollouts, targets, and cohorts; parent features do not.
3. **Prefer platform-specific overrides** over global changes when only one platform needs the feature enabled.
4. **Schema-validate** complex features to prevent broken merges.
5. **Clean up stale flags** once the feature is fully launched. See platform-specific guides for cleanup tooling.
6. **Test both states** -- verify the feature works when enabled and when disabled/unavailable.
7. **Coordinate config and code PRs** -- don't merge code that depends on a config change before the config PR is ready.

## Related Documentation

- [Adding a New Config Feature](./feature-implementer-documentation.md)
- [Config Maintainer Documentation](./config-maintainer-documentation.md)
- [Config Reviewer Documentation](./config-reviewer-documentation.md)
- [Implementation Guidelines](./implementation-guidelines-remote-privacy-configuration-allowlists.md)
- [Incremental Rollout Implementation Guide](./incremental-rollout-implementation-guide.md)
- [Writing a Schema for Your Config Feature](./writing-schema-for-config-feature.md)
- [Privacy Feature Key Mappings](./privacy-feature-key-mappings.md)
- [Remote Configuration Change Log](./remote-configuration-change-log.md)
