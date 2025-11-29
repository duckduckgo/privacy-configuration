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

## Adding New Features to Bugbot

### Template for New Feature Validation
When adding new features to this repository, follow this pattern:

1. **Create `.cursor/rules/new-feature.mdc`** for developer guidance

2. **Add a reference section to this `BUGBOT.md`** with links to the rule file, schema, and configuration (see Element Hiding or Request Blocklist sections as examples)