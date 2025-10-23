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
- **Implementation**: `content-scope-scripts/injected/src/features/element-hiding.js` - JavaScript runtime logic
- **Configuration**: `features/element-hiding.json` - Rule definitions and domain-specific overrides

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

## Element Hiding Validation Errors

### Rule Placement Mistakes
- ❌ **Global rules in domain sections**: Rules without `domain` field in `domains[]` array
- ❌ **Domain rules in global sections**: Rules with `domain` field in global `rules[]` array
- ❌ **Missing required fields**: `selector` missing for rule types that require it
- ❌ **Invalid rule types**: Rule types not in allowed list
- ❌ **Missing values array**: `modify-style`/`modify-attr` rules without `values`

### Schema Violations
- **Missing required fields** for element-hiding rules
- **Invalid rule types** or values
- **Malformed JSON structure**
- **TypeScript type mismatches**

## GitHub Error Reporting

### Error Message Format
When validation fails, provide clear, actionable error messages:

```
❌ **Element Hiding Validation Error**
**File**: `features/element-hiding.json`
**Location**: `domains[0].rules[0]`
**Error**: Missing required field 'selector' for rule type 'hide-empty'
**Fix**: Add `"selector": ".your-selector"` to the rule
```

### Common Error Scenarios

#### Missing Required Fields
```
❌ **Missing Selector Field**
**Error**: Rule type 'hide-empty' requires 'selector' field
**Fix**: Add `"selector": ".ad-container"` to the rule
```

#### Invalid Rule Types
```
❌ **Invalid Rule Type**
**Error**: 'hide-forever' is not a valid rule type
**Valid types**: hide-empty, hide, closest-empty, override, modify-style, modify-attr, disable-default
**Fix**: Use one of the valid rule types
```

#### Missing Values Array
```
❌ **Missing Values Array**
**Error**: Rule type 'modify-style' requires 'values' array
**Fix**: Add `"values": [{"property": "display", "value": "none"}]` to the rule
```

#### Wrong Rule Placement
```
❌ **Wrong Rule Placement**
**Error**: Global rule placed in domain-specific section
**Fix**: Move rule to global 'rules[]' array or add 'domain' field to make it domain-specific
```

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
   - Validation error scenarios
   - GitHub error reporting format

4. **Add feature-specific validation criteria** following the element-hiding pattern

### Scalable Architecture
This `BUGBOT.md` is designed to scale:
- **Repository-wide framework** handles general validation
- **Feature-specific sections** handle detailed validation
- **Integration points** work with existing automation
- **Template pattern** makes adding new features straightforward
