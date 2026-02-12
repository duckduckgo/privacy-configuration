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

## Client-Side Feature Flag Patterns

### Apple (iOS / macOS)

**Terminology**: `FeatureFlag` enum, `FeatureFlagSource`, `FeatureFlagDescribing`

Each Apple app declares a `FeatureFlag` enum with four computed properties:

| Property | Purpose |
|---|---|
| `defaultValue: Bool` | Fallback when remote config is unavailable. Listed in a `switch` -- flags wanting `true` are enumerated explicitly; all others fall through to `default: false`. |
| `source: FeatureFlagSource` | Where the flag value comes from: `.remoteReleasable(...)`, `.remoteDevelopment(...)`, `.internalOnly()`, or `.disabled`. |
| `supportsLocalOverriding: Bool` | Whether internal users can toggle it in the debug menu. |
| `cohortType` | Optional A/B test cohort type. |

Remote flags map to a `PrivacyFeature` / `PrivacySubfeature` defined in `BrowserServicesKit`. Platform-generic flags typically live under `iOSBrowserConfig` or `macOSBrowserConfig`; domain-specific flags live under their parent feature (e.g., `AIChatSubfeature`, `SyncSubfeature`).

**Examples of each property** (from iOS `FeatureFlag.swift`):

`defaultValue` -- flags that should default to `true` (failsafe) are listed explicitly; everything else falls through to `false`:

```swift
public var defaultValue: Bool {
    switch self {
    case .canScanUrlBasedSyncSetupBarcodes,
         .syncCreditCards,
         .tabSwitcherTrackerCount:
        true
    default:
        false
    }
}
```

`source` -- determines where the flag's value comes from:

```swift
public var source: FeatureFlagSource {
    switch self {
    case .sync:
        return .remoteReleasable(.subfeature(SyncSubfeature.level0ShowSync))
    case .duckPlayerNativeUI:
        return .internalOnly()
    // ...
    }
}
```

`supportsLocalOverriding` -- allows internal users to toggle the flag in the debug menu:

```swift
public var supportsLocalOverriding: Bool {
    switch self {
    case .scamSiteProtection,
         .maliciousSiteProtection,
         .paidAIChat:
        true
    default:
        false
    }
}
```

**Source types**:
- `.remoteReleasable(.subfeature(...))` -- controlled via a remote config **sub-feature** state. **This is the recommended source for most flags** because sub-features support rollouts, targets, and cohorts.
- `.remoteReleasable(.feature(...))` -- controlled by a **top-level** remote config feature state. **Avoid this** unless you have a specific reason -- see the warning below.
- `.internalOnly()` -- always on for internal users, always off for external.
- `.disabled` -- always off (placeholder for future work).

> **Warning: avoid `.remoteReleasable(.feature(...))`.**
> Mapping a client flag directly to a parent feature means the flag cannot benefit from rollouts, targets, or cohorts (which are sub-feature-only). It has also caused incidents where engineers expected these capabilities to work and they silently did not. Prefer `.remoteReleasable(.subfeature(...))` and add a sub-feature to the relevant `PrivacyFeature` if one does not already exist.

**File locations**:
- iOS: `iOS/Core/FeatureFlag.swift`
- macOS: `macOS/LocalPackages/FeatureFlags/Sources/FeatureFlags/FeatureFlag.swift`
- Shared sub-feature enums: `SharedPackages/BrowserServicesKit/Sources/PrivacyConfig/Features/PrivacyFeature.swift`
- Cursor rule: `.cursor/rules/feature-flags-addition.mdc`

### Android

**Terminology**: `Toggle`, `@ContributesRemoteFeature`, `FeatureToggles`

Android uses a code-generation approach. Each remote feature is an **interface** annotated with `@ContributesRemoteFeature`:

```kotlin
@ContributesRemoteFeature(
    scope = AppScope::class,
    featureName = "aiChat",
)
interface DuckChatFeature {
    @Toggle.DefaultValue(DefaultFeatureValue.FALSE)
    fun self(): Toggle

    @Toggle.DefaultValue(DefaultFeatureValue.FALSE)
    fun someSubFeature(): Toggle
}
```

Key annotations on each toggle method:

| Annotation | Purpose |
|---|---|
| `@Toggle.DefaultValue(FALSE)` | The fallback when remote config has no state. `FALSE`, `TRUE`, or `INTERNAL` (on only for internal builds). |
| `@Toggle.InternalAlwaysEnabled` | Always enabled on internal builds regardless of remote state. |
| `@Toggle.Experiment` | Marks the flag as an experiment with cohort assignment. |

The `isEnabled()` method evaluates: remote state > rollout threshold > `minSupportedVersion` > target matching > default value.

**File locations**:
- Feature toggle API: `feature-toggles/feature-toggles-api/`
- Individual feature interfaces: scattered per-module (e.g., `duckchat/duckchat-impl/.../DuckChatFeature.kt`)
- Framework docs: `feature-toggles/readme.md`
- Flag cleanup tooling: `scripts/piranha/` (Kotlin dead-flag removal CLI)
- Local config patching: `privacy-config/privacy-config-internal/README.md`

### Windows

**Terminology**: `Feature` / `SubFeature` enums, `IProvider.GetFeatureState()` / `GetSubFeatureState()`

Windows declares features and sub-features as C# enums with `[Description]` attributes mapping to remote config keys:

```csharp
[JsonConverter(typeof(JsonEnumToCamelCaseConverter))]
public enum Feature
{
    [Description("aiChat")]
    AiChat,

    [Description("pinnedTabs")]
    PinnedTabs,
    // ...
}

public enum SubFeature
{
    [Description("sidebar")]
    Sidebar,
    // ...
}
```

Feature state is queried reactively:

```csharp
remoteConfigProvider.GetFeatureState(Feature.PinnedTabs)
remoteConfigProvider.GetSubFeatureState(Feature.AiChat, SubFeature.Sidebar)
```

The `FeatureState` enum supports: `Disabled`, `Enabled`, `Preview` (pre-release channels), `Internal`.

**File locations**:
- Feature/SubFeature enums: `WindowsBrowser.Common/Models/RemoteConfig/Feature.cs`
- FeatureState: `WindowsBrowser.Common/Models/RemoteConfig/FeatureState.cs`

### Browser Extension

The extension reads features directly from the generated config JSON (`extension-config.json`). Feature state and exceptions are evaluated at runtime by the extension's privacy-config module. There is no separate local feature-flag enum -- the remote config **is** the feature flag system.

### Content Scope Scripts (C-S-S)

C-S-S features are controlled by the remote config passed in from the host platform at injection time. Features check their state via:

```js
this.isFeatureEnabled   // top-level feature state
this.getFeatureSetting('settingName')  // feature settings
```

C-S-S does not maintain its own feature flag layer; it relies on the config provided by the native host. See `content-scope-scripts/injected/src/content-feature.js`.

## Where to Add a New Feature Flag

| What you want | Where to do it |
|---|---|
| **New remote config feature** (shared/cross-platform) | Create `features/myFeature.json`, optionally add platform overrides. See [Adding a New Config Feature](./feature-implementer-documentation.md). |
| **New platform-specific sub-feature** | Add to the relevant `overrides/<platform>-override.json` or to the feature's base file under `features`. |
| **New client-side flag backed by remote config** | Add the flag in the client's feature flag enum/interface and wire it to a `PrivacyFeature`/sub-feature (Apple), `@ContributesRemoteFeature` interface (Android), or `Feature`/`SubFeature` enum (Windows). |
| **Schema validation** | Create a TypeScript schema in `schema/features/`. See [Writing a Schema](./writing-schema-for-config-feature.md). |
| **Incremental rollout** | Add a `rollout` object with `steps` to a sub-feature. See [Incremental Rollout Guide](./incremental-rollout-implementation-guide.md). |

## Best Practices

1. **Choose the right default** -- `false` for new/experimental features; `true` (failsafe) for stable features that need a kill-switch. See [Choosing a Default Value](#choosing-a-default-value).
2. **Use sub-features** for granular control under a parent feature.
3. **Prefer platform-specific overrides** over global changes when only one platform needs the feature enabled.
4. **Schema-validate** complex features to prevent broken merges.
5. **Clean up stale flags** -- Android has tooling (`scripts/piranha/`); Apple tracks flags in an Asana registry. Remove flags once the feature is fully launched.
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
