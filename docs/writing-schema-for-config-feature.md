# Writing a Schema for Your Config Feature

If your feature is shared across platforms or has complex settings, you should write a schema file to prevent mistakes in config maintenance or across platforms.

## Steps

1. **Create a new schema file for your feature**
   - Example: [`schema/features/network-protection.ts`](https://github.com/duckduckgo/privacy-configuration/blob/main/schema/features/network-protection.ts)
2. **Import and hook your schema file into the main config schema**
   - Edit [`schema/config.ts`](https://github.com/duckduckgo/privacy-configuration/blob/main/schema/config.ts#L38) and add your schema as a named "feature".
3. **Add these changes to your commit**
   - Ensure your schema and config changes are committed together.

## Explanation

Feature files comprise one Feature definition:

```typescript
export type NetworkProtection<VersionType> = Feature<
    SettingsType,
    VersionType,
    NetworkProtectionSubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
```

- The first type passed into `Feature` defines the `settings` object typing.
- The `VersionType` is generic, supporting different `minSupportedVersion` string and number formats.
- The third argument validates the `features` object; use the `SubFeature` type here to assist.

In the example above, we're allowing named `SubFeatures` type and any other generic `SubFeature`.
SubFeatures by default ([see here](https://github.com/duckduckgo/privacy-configuration/blob/33681872f6d03a53b08c83b102575ad97e7dcf6a/schema/feature.ts#L24)), so the type above permits anything in the `NetworkProtectionSubFeatures` as well as other subfeatures that are all strings. 

## See Also

- [Config Maintainer Documentation](./config-maintainer-documentation.md)
- [Config Reviewer Documentation](./config-reviewer-documentation.md)
- [Feature Implementer Documentation](./feature-implementer-documentation.md)
- [Privacy Feature Key Mappings](./privacy-feature-key-mappings.md)
- [🛠 Implementation Guidelines: Remote Privacy Configuration/Allowlists](./implementation-guidelines-remote-privacy-configuration-allowlists.md)
- [Incremental Rollout Implementation Guide](./incremental-rollout-implementation-guide.md)
- [Remote Configuration Change Log](./remote-configuration-change-log.md) 