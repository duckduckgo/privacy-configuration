# Remote Config Debugging

## Config Version Validation

### Critical: Required Field Updates

**When updating config, you MUST update both:**
- **Version**: Bump the version number — clients ignore updates without version changes
- **Hash**: Update the hash field — clients ignore updates without hash changes

**Required fields:**
- **unprotectedTemporary**: Required by ContentScopeScripts and Autofill — must be included in the config

Without bumping both `version` and `hash`, clients will ignore the update even if other fields change.

### What to Check
- **Config version**: Ensure the version number in the loaded config matches what you expect
- **Config hash**: Verify the hash field has been updated to match the new config content
- **unprotectedTemporary**: Confirm this field is present (required by ContentScopeScripts and Autofill)
- **Remote config source**: Verify the config is being fetched from the expected endpoint
- **Cache state**: If using cached config, verify it's not stale and the version has updated

### Common Config Issues

#### Config Not Updating
- **Most common cause**: Version and/or hash were not updated
- Check cache expiration settings
- Verify config version has changed
- Verify config hash has changed
- Ensure remote config endpoint is accessible
- Check for network errors in DevTools

#### Config Structure Errors
- Validate JSON structure
- Check for missing required fields (especially `unprotectedTemporary`)
- Verify feature settings format

### Validating Config Structure

1. **Build config with tooling**: Check out the codebase and build a config file using the project's tooling to produce a valid output.
2. **Draft a PR**: The automation will validate the config structure, generate a test link, and catch common issues.

## Config Processing and Feature Enablement

For debugging how the config is processed and how features are enabled/disabled, see:

**[content-scope-scripts/injected/docs/build-and-troubleshooting.md](https://github.com/duckduckgo/content-scope-scripts/blob/main/injected/docs/build-and-troubleshooting.md#config-and-platform-parameters-validation)** — Config and Platform Parameters Validation section.
