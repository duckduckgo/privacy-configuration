---
name: autofill-site-specific-settings
description: Use when adding an autofill site-specific rule, setting, or remote fix for a specific domain. These rules are used by the autofill package to fix issues that cannot be fixed via heuristics. They exist inside the override files, within the autofill feature as "siteSpecificFixes".
---

# Adding Autofill Site-Specific Settings

Site-specific fixes allow overriding autofill behavior for individual domains when the default
heuristics fail. They are delivered via remote config and do not require a code release.

## When to use

- A specific site's form or input is misclassified by the autofill algorithm
- The fix can be expressed as a CSS selector + config value
- The issue is limited to one domain or a small set of domains

## Instructions

1. **Identify the platform.** Clarify which platform(s) need the fix if not explicitly stated.
   Each platform has its own override file:
   - `overrides/android-override.json`
   - `overrides/ios-override.json`
   - `overrides/macos-override.json`
   - `overrides/windows-override.json`

   Some rules are only applicable for certain platforms — add them only to the respective files.

2. **Check the schema.** Available fix types are defined in `schema/features/autofill.ts`:
   - `inputTypeSettings` — force an input to a specific type (e.g., `credentials.username`)
   - `formTypeSettings` — force a form to be `login`, `signup`, or `hybrid`
   - `formBoundarySelector` — override which element the scanner treats as the form
   - `failsafeSettings` — adjust `maxInputsPerPage`, `maxFormsPerPage`, `maxInputsPerForm`

3. **Add the rule** using JSON Patch syntax inside the `siteSpecificFixes` sub-feature's `domains`
   array in the relevant override file(s). Example:

   ```json
   {
       "domain": ["example.com"],
       "patchSettings": [
           {
               "path": "/inputTypeSettings/-",
               "op": "add",
               "value": {
                   "selector": "input#username",
                   "type": "credentials.username"
               }
           }
       ]
   }
   ```

4. **Run tests** to validate:
   ```sh
   nvm use    # if needed
   npm test
   ```
