# Autofill Site-Specific Settings

Rules used by the autofill package to fix issues that cannot be fixed via heuristics. The rules exist inside the override files, within the autofill feature as `siteSpecificFixes`.

## When to Use

When adding an autofill "site specific rule", "setting", or a "remote fix" for a specific domain.

## Key References

- **Schema**: `schema/features/autofill.ts` — types of settings available
- **Override files** (platform-specific):
  - `overrides/android-overrides.json`
  - `overrides/ios-overrides.json`
  - `overrides/macos-overrides.json`
  - `overrides/windows-overrides.json`

## Process

1. Check the schema at `schema/features/autofill.ts` for available setting types
2. Some rules are only applicable for certain platforms — add them only to the respective override files
3. Clarify which platform the user is interested in, if not explicitly stated
4. Use JSON Patch syntax for `patchSettings`
5. Run `npm test` when all files are updated (`nvm use` if needed)
