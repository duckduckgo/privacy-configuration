# Feature Schema Creation

Guide for creating new feature schema files in the privacy-remote-configuration system. Use this when adding new features that need TypeScript type definitions and validation.

## When to Use
- Adding new features to privacy-remote-configuration
- Features that need conditional changes or experiment support
- Features that will be used across multiple platforms
- Features requiring type safety and validation

## Implementation Pattern

### 1. Create Schema File
Create a new file in `schema/features/feature-name.ts`:

```typescript
import { Feature, CSSInjectFeatureSettings, CSSConfigSetting, FeatureState } from '../feature';

type FullFeatureNameOptions = CSSInjectFeatureSettings<{
    // Boolean/state settings
    settingName?: FeatureState;
    
    // Array settings
    arraySetting?: string[];
    
    // Complex settings (use CSSConfigSetting)
    complexSetting?: CSSConfigSetting;
}>;

export type FeatureNameFeature<VersionType> = Feature<Partial<FullFeatureNameOptions>, VersionType>;
```

### 2. Add to Config
Import and add to `schema/config.ts`:

```typescript
// Add import
import { FeatureNameFeature } from './features/feature-name';

// Add to ConfigV5 type
export type ConfigV5<VersionType> = {
    // ... existing code ...
    features: Record<string, Feature<any, VersionType>> & {
        // ... existing features ...
        featureName?: FeatureNameFeature<VersionType>;
    };
};
```

## Key Rules

- **Use CSSInjectFeatureSettings**: If this is a C-S-S feature, provides built-in support for conditional changes and experiments.
- **FeatureState for booleans**: Use `FeatureState` for enabled/disabled settings
- **Arrays for lists**: Use `string[]` for method lists, domain lists, etc.
- **CSSConfigSetting for complex**: Use for complex objects that need type/function definitions
- **Partial wrapper**: Always wrap options in `Partial<>` for flexibility
- **VersionType generic**: Include `<VersionType>` for version compatibility
- **Testing**: Run `npm run test` to validate the output and also `npm lint` to check the formatting.

When writing these rules, check against `features/` and `overrides/` for current usage.
