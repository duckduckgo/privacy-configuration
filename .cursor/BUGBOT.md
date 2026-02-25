# Bugbot PR Review Guidelines

## Repository-Wide Validation Framework

### Schema Compliance (All Features)
- **Verify rule structure** matches schema definitions in `schema/features/`
- **Check required fields** based on feature-specific schemas
- **Validate JSON structure** and syntax
- **Ensure TypeScript type compliance**

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

## Page Context Feature Validation

### Cross-Config Parity Check

The `pageContext` feature has **two** configuration points per platform that must stay in sync:

1. **Standalone `pageContext`** (C-S-S feature) — top-level entry in `features`
2. **`aiChat.features.pageContext`** (native sub-feature) — nested under `aiChat`

**When reviewing PRs that modify either entry, verify:**

- If `aiChat.features.pageContext` is being enabled/disabled, the standalone `pageContext` feature must match
- If standalone `pageContext` state changes, `aiChat.features.pageContext` must be updated accordingly
- The standalone `pageContext` settings include `mainContentSelector` (required for C-S-S content extraction)
- Domain-specific `conditionalChanges` (e.g., `nba.com`, `reddit.com`) are consistent across platforms

### References

- **Rule File**: `.cursor/rules/page-context-parity.mdc` - Parity enforcement guidance
- **Base Configuration**: `features/page-context.json`
- **C-S-S Implementation**: `https://github.com/duckduckgo/content-scope-scripts/blob/main/injected/src/features/page-context.js`

## Adding New Features to Bugbot

### Template for New Feature Validation
When adding new features to this repository, the following are **entirely optional** and should only be done when clearly beneficial:

- **Add a reference section to this `BUGBOT.md`** with links to the schema and configuration — only if the feature has specific validation concerns that the bot should check for.

- **Create a `.cursor/rules/new-feature.mdc`** — only if the feature has complex validation logic or non-obvious configuration patterns. Most features do not need one.

Do **not** flag PRs for missing documentation files.