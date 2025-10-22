# Bugbot PR Review Guidelines

## Repository-Wide Validation Framework

### Schema Compliance (All Features)
- **Verify rule structure** matches schema definitions in `schema/features/`
- **Check required fields** based on feature-specific schemas
- **Validate JSON structure** and syntax
- **Ensure TypeScript type compliance**

### Auto-Approval Integration
- **Respect path-based rules** defined in `automation-utils.js`
- **Only approve changes** in `AUTO_APPROVABLE_FEATURES` paths
- **Flag disallowed paths** for manual review
- **Follow existing automation logic** from `json-diff-directories.js`

## Element Hiding Feature Validation

### Schema & Implementation References
- **Rule File**: `.cursor/rules/element-hiding.mdc` - Developer guidance and decision tree
- **Schema**: `schema/features/element-hiding.ts` - TypeScript type definitions
- **Implementation**: `content-scope-scripts/injected/src/features/element-hiding.js` - JavaScript runtime logic
- **Configuration**: `features/element-hiding.json` - Rule definitions and domain-specific overrides

### Auto-Approval Paths
- **Allowed**: `domains`, `exceptions` (see `automation-utils.js`)
- **Requires Manual Review**: Global `rules`, `settings`, `useStrictHideStyleTag`, etc.

### Element Hiding Specific Checks
- **Rule Types**: Must be one of `hide-empty`, `hide`, `closest-empty`, `override`, `modify-style`, `modify-attr`, or `disable-default`
- **Required Fields**: `selector` for most rules, `type` for all rules
- **Optional Fields**: `values` array only for `modify-style` and `modify-attr` rules
- **Domain Placement**: Domain-specific rules go in `domains[]` array
- **Global Rules**: Go in top-level `rules[]` array

### Rule Type Validation
- **`hide-empty`**: Should be the default choice for empty containers
- **`closest-empty`**: Use when parent container remains empty
- **`hide`**: Only when content must be hidden (may trigger detection)
- **`override`**: Domain-specific only, fixes global rule conflicts
- **`disable-default`**: Domain-specific only, must be accompanied by working rules
- **`modify-style`**: For layout/visibility tweaks, requires `values` array
- **`modify-attr`**: For attribute corrections, requires `values` array

### Configuration Structure
- **Global settings**: `useStrictHideStyleTag`, `hideTimeouts`, `unhideTimeouts`
- **Media selectors**: `mediaAndFormSelectors` for form/media element targeting
- **Ad labels**: `adLabelStrings` for identifying ad containers
- **Exceptions**: `styleTagExceptions` for domains with special handling

## Common Issues to Flag

### Schema Violations
- Missing required fields for element-hiding rules
- Invalid rule types or values
- Malformed JSON structure
- TypeScript type mismatches

### Path Violations
- Changes outside `AUTO_APPROVABLE_FEATURES` paths
- Domain-specific rules in wrong location
- Global rules in domain-specific sections

### Quality Issues
- Inconsistent rule naming or formatting
- Missing rule comments or documentation
- Overly broad selectors (security risk)
- Missing test coverage

## Auto-Approval Criteria

### Repository-Wide Requirements
- Schema-compliant rule structure
- Valid JSON syntax
- Changes only in allowed paths (per `automation-utils.js`)
- Clear rule purpose and documentation

### Element Hiding Specific Requirements
- Appropriate rule type selection
- Proper domain placement
- Valid selector syntax
- Clear mitigation purpose

## Integration with Existing Automation

### Path-Based Validation
- Use `automation-utils.js` as source of truth for allowed paths
- Follow `AUTO_APPROVABLE_FEATURES` configuration
- Respect conditional changes patching logic

### Testing Integration
- Reference `tests/test-auto-approval.js` for valid patterns
- Follow `json-diff-directories.js` analysis logic
- Ensure compatibility with existing test suite

### Workflow Integration
- Work with `auto-respond-pr.yml` automation
- Integrate with Asana sync for manual review cases
- Support reviewer assignment automation

## Adding New Features to Bugbot

### Template for New Feature Validation
When adding new features to this repository, follow this pattern:

1. **Add feature to `automation-utils.js`**:
   ```javascript
   '/features/newFeatureName': [
       '/settings/allowedPath1',
       '/exceptions',
   ],
   ```

2. **Create `.cursor/rules/new-feature.mdc`** for developer guidance

3. **Update this `BUGBOT.md`** to include:
   - Feature-specific validation section
   - Schema references
   - Auto-approval paths
   - Common issues to flag

4. **Add feature-specific validation criteria** following the element-hiding pattern

### Scalable Architecture
This `BUGBOT.md` is designed to scale:
- **Repository-wide framework** handles general validation
- **Feature-specific sections** handle detailed validation
- **Integration points** work with existing automation
- **Template pattern** makes adding new features straightforward
