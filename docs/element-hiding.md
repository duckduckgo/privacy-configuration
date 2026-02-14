# Element Hiding Mitigation Rules

## Schema & Configuration References

- **Schema**: `schema/features/element-hiding.ts` — TypeScript type definitions
- **Configuration**: `features/element-hiding.json` — Rule definitions and domain-specific overrides

## Mitigation Decision Tree

```
Blank spaces? → hide-empty (try first)
↓
Target has content but parent empty? → closest-empty
↓
Content must be hidden? → hide (only if necessary — may trigger detection)
↓
Global rule conflict? → override the selector
↓
Adblock detection? → disable-default + add working rules
↓
Layout/visual issues? → modify-style
↓
Attribute issues? → modify-attr
```

## Rule Type Reference

| Rule Type | Use Case | Values Field | Notes |
|-----------|----------|--------------|-------|
| `hide-empty` | Empty ad containers or blank placeholders | Forbidden | Default rule. Hides only if empty. |
| `closest-empty` | Empty parent container remains | Forbidden | Crawls up DOM tree to hide the empty parent. |
| `hide` | Always hide, even if visible content | Forbidden | Use sparingly — can cause detection. |
| `override` | Cancel specific global rules | Forbidden | Domain-specific only. Fixes global breakage. |
| `disable-default` | Defuse adblock detection | Forbidden | Domain-specific only. Never alone; rebuild safe rules. |
| `modify-style` | Layout or visibility tweaks | Required | Replace CSS values (e.g., height → 0px). |
| `modify-attr` | Attribute corrections | Required | Replace element attributes (e.g., src/class). |

## Type Definitions

```typescript
// Hide rules (no values field allowed)
type ElementHidingRuleHide = {
  selector: string;
  type: 'hide-empty' | 'hide' | 'closest-empty' | 'override';
}

// Modify rules (values field required)
type ElementHidingRuleModify = {
  selector: string;
  type: 'modify-style' | 'modify-attr';
  values: ElementHidingValue[];
}

// Disable rules (no selector field allowed)
type ElementHidingRuleDisable = {
  type: 'disable-default';
}

type ElementHidingValue = {
  property: string;
  value: string;
}
```

## Configuration Structure

- **Domain-specific rules**: Go in `domains[]` array
- **Global rules**: Go in top-level `rules[]` array
- **Global settings**: `useStrictHideStyleTag`, `hideTimeouts`, `unhideTimeouts`
- **Media selectors**: `mediaAndFormSelectors` for form/media element targeting
- **Ad labels**: `adLabelStrings` for identifying ad containers
- **Exceptions**: `styleTagExceptions` for domains with special handling
