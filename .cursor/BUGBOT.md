# Bugbot PR Review Guidelines

## Element Hiding Feature Reviews

When reviewing pull requests that modify element-hiding rules or configuration:

### Schema Compliance Check
- **Verify rule structure** matches `schema/features/element-hiding.ts` types
- **Check required fields**: `selector` for most rules, `type` for all rules
- **Validate rule types**: Must be one of `hide-empty`, `hide`, `closest-empty`, `override`, `modify-style`, `modify-attr`, or `disable-default`
- **Check optional fields**: `values` array only for `modify-style` and `modify-attr` rules

### Rule Type Validation
- **`hide-empty`**: Should be the default choice for empty containers
- **`closest-empty`**: Use when parent container remains empty
- **`hide`**: Only when content must be hidden (may trigger detection)
- **`override`**: Domain-specific only, fixes global rule conflicts
- **`disable-default`**: Domain-specific only, must be accompanied by working rules
- **`modify-style`**: For layout/visibility tweaks, requires `values` array
- **`modify-attr`**: For attribute corrections, requires `values` array

### Domain-Specific Rules
- **Domain field**: Must be string or array of strings
- **Rule placement**: Domain-specific rules go in `domains[]` array
- **Global rules**: Go in top-level `rules[]` array

### Configuration Structure
- **Global settings**: `useStrictHideStyleTag`, `hideTimeouts`, `unhideTimeouts`
- **Media selectors**: `mediaAndFormSelectors` for form/media element targeting
- **Ad labels**: `adLabelStrings` for identifying ad containers
- **Exceptions**: `styleTagExceptions` for domains with special handling

### Common Issues to Flag
- Missing `selector` field for rules that require it
- Invalid `type` values
- Missing `values` array for `modify-style`/`modify-attr` rules
- Domain-specific rules in wrong location
- Malformed JSON structure
- Inconsistent rule naming or formatting

### Auto-Approval Criteria
- Schema-compliant rule structure
- Appropriate rule type selection
- Proper domain-specific rule placement
- Valid JSON syntax
- Clear rule purpose and selector

## General PR Review Guidelines

### Code Quality
- Check for syntax errors and linting issues
- Verify TypeScript type compliance
- Ensure proper error handling
- Validate configuration file structure

### Documentation
- Verify rule comments explain purpose
- Check for clear selector descriptions
- Ensure domain-specific rules have context

### Testing
- Look for test coverage of new rules
- Verify integration test updates if needed
- Check for breaking changes

### Security
- Validate selector safety (no XSS risks)
- Check for overly broad selectors
- Ensure proper input sanitization
