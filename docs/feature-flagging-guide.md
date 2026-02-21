# Feature Flagging with Privacy Configuration

## Overview

Feature flagging uses two layers:

1. **Remote Configuration (this repo)** -- feature state, sub-features, rollouts, and settings defined in [`features/`](../features) and [`overrides/`](../overrides).
2. **Client-side feature flags** -- native clients declare their own flag types that map to remote config features/sub-features. The browser extension reads the config directly.

Clients consume the generated `<platform>-config.json` at runtime. See [`features/_template.json`](../features/_template.json) for the starting point.

## Parent Features vs Sub-features

Parent features support `state`, `exceptions`, `minSupportedVersion`, `settings`, and nested `features` (sub-features).

Sub-features additionally support `rollout`, `targets`, and `cohorts` -- **parent features do not**. If you need progressive rollout, audience targeting, or A/B testing, use a sub-feature.

See [v6 config parity](https://app.asana.com/1/137249556945/project/1200890834746050/task/1208934823027474) for ongoing work to align this across clients.

Platform-specific overrides in [`overrides/`](../overrides) can change `state`, add sub-features, or override `settings` per platform.

For full format details: [Implementation Guidelines](./implementation-guidelines-remote-privacy-configuration-allowlists.md).

## Choosing a Default Value

Every client-side flag has a **default value** -- the fallback when remote config is unavailable. The choice matters:

**`false` (opt-in)** -- Feature stays off until explicitly enabled remotely. Use for new or experimental work.

**`true` (failsafe / kill-switch)** -- Feature is on by default; you retain the ability to disable it remotely. Use for stable, already-shipping features. Apple calls this a [failsafe feature flag](https://app.asana.com/1/137249556945/task/1210572145398078).

### Changing a default on a shipped feature

If a feature has already been rolled out with `default: false` and you want to flip it to `default: true`, **set `minSupportedVersion` in the config** to the version that includes the default change. Without this, older app versions that lack the finished implementation will pick up the new default when they download the remote config update -- potentially shipping half-finished work to users on older versions.

## Client-Side Integration

| Platform | Guide |
|---|---|
| Apple (iOS / macOS) | [Feature Flag Guide](https://github.com/duckduckgo/apple-browsers/blob/main/SharedPackages/BrowserServicesKit/Sources/PrivacyConfig/FeatureFlagger/feature-flag-guide.md) |
| Android | [Feature Toggles Guide](https://app.asana.com/1/137249556945/task/1203928902316231) |
| Windows | [Feature Flag Guide](https://github.com/duckduckgo/windows-browser/blob/main/docs/feature-flag-guide.md) |
| Browser Extension | [Feature Flags](https://github.com/duckduckgo/duckduckgo-privacy-extension/blob/main/docs/feature-flags.md) |
| Content Scope Scripts | [Features Guide -- Remote Configuration](https://github.com/duckduckgo/content-scope-scripts/blob/main/injected/docs/features-guide.md#remote-configuration-and-feature-flags) |

## Where to Add a New Feature Flag

| What you want | Where to do it |
|---|---|
| New remote config feature | Create a file in [`features/`](../features), optionally add platform overrides. See [Adding a New Config Feature](./feature-implementer-documentation.md). |
| Platform-specific sub-feature | Add to the relevant `overrides/<platform>-override.json` or the feature's base file. |
| Client-side flag wired to remote config | See the platform-specific guide above. |
| Schema validation | Create a TypeScript schema in [`schema/features/`](../schema/features). See [Writing a Schema](./writing-schema-for-config-feature.md). |
| Incremental rollout | Add a `rollout` object to a sub-feature. See [Incremental Rollout Guide](./incremental-rollout-implementation-guide.md). |

## Pitfalls

- **Sub-features vs parent features**: rollouts, targets, and cohorts only work on sub-features. Wiring a client flag to a parent feature silently loses these capabilities.
- **Changing defaults without `minSupportedVersion`**: see [above](#changing-a-default-on-a-shipped-feature).
- **Coordinate config and code PRs**: don't merge code that depends on a config change before the config PR is ready.

## Related Documentation

- [Adding a New Config Feature](./feature-implementer-documentation.md)
- [Config Maintainer Documentation](./config-maintainer-documentation.md)
- [Config Reviewer Documentation](./config-reviewer-documentation.md)
- [Implementation Guidelines](./implementation-guidelines-remote-privacy-configuration-allowlists.md)
- [Incremental Rollout Implementation Guide](./incremental-rollout-implementation-guide.md)
- [Writing a Schema for Your Config Feature](./writing-schema-for-config-feature.md)
- [Privacy Feature Key Mappings](./privacy-feature-key-mappings.md)
- [Remote Configuration Change Log](./remote-configuration-change-log.md)
