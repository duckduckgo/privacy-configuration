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

## Adding New Features to Bugbot

### Template for New Feature Validation
When adding new features to this repository, the following are **entirely optional** and should only be done when clearly beneficial:

- **Add a reference section to this `BUGBOT.md`** with links to the schema and configuration — only if the feature has specific validation concerns that the bot should check for.

- **Create a `.cursor/rules/new-feature.mdc`** — only if the feature has complex validation logic or non-obvious configuration patterns. Most features do not need one.

Do **not** flag PRs for missing documentation files.