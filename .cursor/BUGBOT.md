# Bugbot PR Review Guidelines

## Repository-Wide Validation Framework

### Schema Compliance (All Features)
- **Verify rule structure** matches schema definitions in `schema/features/`
- **Check required fields** based on feature-specific schemas
- **Validate JSON structure** and syntax
- **Ensure TypeScript type compliance**

## Feature State Transitions

### Minimum Supported Version Bumps
When a feature transitions from `internal` to `enabled` (or from `enabled` to `internal`), the minimum supported version **must** be bumped. Clients rely on the version to detect config changes; without a bump, the state transition will be silently ignored.

### Parent and Subfeature Independence
Parent features and their subfeatures are **not** co-dependent — a subfeature's state is evaluated independently of its parent. Because of this, they often require the exact same gating (e.g. matching `state`, `minSupportedVersion`, rollout targets). When transitioning a subfeature, ensure its gating is explicitly set rather than assuming it inherits from the parent.

### Rollout Step Edits
When a rollout percentage changes, the diff must **append** a new entry to `rollout.steps[]` rather than mutate an existing entry. Each step is a discrete event clients persist; modifying an existing `percent` is silently ignored for already-enrolled users. Flag any PR that edits or removes an existing step object instead of appending a new one. See [`.cursor/rules/rollout-steps.mdc`](../.cursor/rules/rollout-steps.mdc) and [`docs/incremental-rollout-implementation-guide.md`](../docs/incremental-rollout-implementation-guide.md).

## Build Pipeline

### Feature-Specific Config Transforms

`index.js` and `util.js` transform the merged config before it is written to `generated/`. Warn on a PR that adds a transform which fills in or rewrites data for one feature — supplying a default for an omitted key, expanding a shorthand, normalising a shape the author could have written directly. Ask the author whether the schema can require the value instead, or the client can interpret what is authored.

A transform earns its place when the data cannot be authored: derived from an external source, such as `addCnameEntriesToAllowlist` expanding from TDS, or reconciling a base feature with a platform override, such as `mergeEventHubTelemetry` and `mergeInterferenceTypes`. Defaults and shorthands are authorable, and every transform is a rule that lives outside the schema and that four clients read the output of.

This is a **warning**, not a block.

## Element Hiding Feature Validation

### Schema & Implementation References
- **Rule File**: `.cursor/rules/element-hiding.mdc` - Developer guidance and decision tree
- **Schema**: `schema/features/element-hiding.ts` - TypeScript type definitions
- **Implementation**: `https://github.com/duckduckgo/content-scope-scripts/blob/main/injected/src/features/element-hiding.js` - JavaScript runtime logic
- **Configuration**: `features/element-hiding.json` - Rule definitions and domain-specific overrides

## Request Blocklist Feature Validation

### References

- **Rule File**: `.cursor/rules/request-blocklist.mdc` - Developer guidance
- **Schema**: `schema/features/request-blocklist.ts` - TypeScript type definitions
- **Configuration**: `features/request-blocklist.json` - Request blocking rule definitions

## Tracker Allowlist Feature Validation

### References

- **Rule File**: `.cursor/rules/tracker-allowlist.mdc` - Mitigation Guidance
- **Schema**: `schema/features/tracker-allowlist.ts` - TypeScript type definitions
- **Configuration**: `features/tracker-allowlist.json` - Tracker allowlist rule definitions
- **Tests**: `tests/tracker-allowlist-tests.js` - Unit tests enforcing ordering, propagation, and duplicate detection
- **Matching algorithm**: [tracker_allowlist_matching_tests.json](https://github.com/duckduckgo/privacy-reference-tests/blob/main/tracker-radar-tests/TR-domain-matching/tracker_allowlist_matching_tests.json) - Client matching is subdomain-aware, not pure string prefix. A subdomain rule does not match the parent domain.

## Experiment Metrics Validation

### References

- **Schema**: `schema/features/experiment-metrics.ts` - Metric shape shared by experiment subfeatures
- **Tests**: `tests/experiment-metrics-tests.js` - Placement, shape, naming, and event-production checks
- Metrics live in `settings.metrics` of experiment subfeatures under `contentScopeExperiments`, `blockList`, and `contentBlocking` only.

### No Metric Additions to Already-Enabled Experiments

Clients snapshot or anchor metric state at enrollment, and users enroll as soon as an experiment is enabled. A metric **added** to an experiment subfeature that already has `state: enabled` and `cohorts` in the base branch will silently not fire for already-enrolled users on some platforms. Flag any PR that adds new keys to an existing experiment's `settings.metrics` (or adds a whole `metrics` object to it) unless the same PR is what enables the experiment. **Removing** a metric is always fine — deletion is the kill switch and must not be flagged.

### Detector Changes Affecting Live Experiment Metrics

If a PR modifies a `webDetection` detector (its `match`, `triggers`, or `actions.fireEvent`) whose `fireEvent.type` is referenced as the `event` of a metric in an experiment that is currently `enabled` with cohorts, warn on the PR: the change applies to both cohorts equally so the A/B comparison survives, but the metric's meaning steps mid-experiment and analysis needs to know the date. This is a **warning**, not a block — ask the author to confirm the experiment owner is aware.

## Custom User Agent / Client Hints Validation

### References

- **Rule File**: `.cursor/rules/user-agent-client-hints.mdc` - Cross-platform UA/client-hint mitigation guidance
- **Schemas**: `schema/features/custom-user-agent.ts`, `schema/features/client-brand-hint.ts`, `schema/features/ua-ch-brands.ts`
- **Configurations**: `overrides/windows-override.json`, `overrides/android-override.json`, `overrides/ios-override.json`, `overrides/macos-override.json`

## Adding New Features to Bugbot

### Template for New Feature Validation
When adding new features to this repository, the following are **entirely optional** and should only be done when clearly beneficial:

- **Add a reference section to this `BUGBOT.md`** with links to the schema and configuration — only if the feature has specific validation concerns that the bot should check for.

- **Create a `.cursor/rules/new-feature.mdc`** — only if the feature has complex validation logic or non-obvious configuration patterns. Most features do not need one.

Do **not** flag PRs for missing documentation files.