# Incremental Rollout Implementation Guide

The remote config supports incremental rollouts for sub-features. Follow these steps to add a rollout to your sub-feature.

## Steps

1. **Ensure your sub-feature is set up**
   - Rollouts are not currently supported on top-level features. Your feature must have a sub-feature to attach the rollout to.
   - Example:
     ```json
     "history": { // top level feature
         "features": {
             "onByDefault": { ... } // sub-feature
         }
     }
     ```
2. **Add the `rollout` object to the sub-feature**
   - This can be done in the feature's base file or a platform override.
   - The `rollout` object contains an array called `steps` with one or more entries for the rollout.
   - Example:
     ```json
     "history": {
         "state": "enabled",
         "features": {
             "onByDefault": {
                 "state": "enabled",
                 "rollout": {
                     "steps": [
                         {
                             "percent": 25.0
                         }
                     ]
                 }
             }
         }
     }
     ```

## Notes
- The `percent` value of a rollout should be a double with a value of 0-100.
- Rollbacks are supported on Android if you need to lower the rollout percentage.
- Supported clients will handle the rollout automatically and persist their inclusion between rollout updates.
- No additional support beyond supporting your sub-feature is needed on the client side to handle a rollout.
- Setting a sub-feature's state to `disabled` will effectively halt a rollout and will disable the feature for anyone who was enrolled.

For technical details about how rollouts work, see [this Asana task](https://app.asana.com/0/1198194956794324/1204934761241565/f).

## See Also

- [Config Maintainer Documentation](./config-maintainer-documentation.md)
- [Config Reviewer Documentation](./config-reviewer-documentation.md)
- [Feature Implementer Documentation](./feature-implementer-documentation.md)
- [Privacy Feature Key Mappings](./privacy-feature-key-mappings.md)
- [🛠 Implementation Guidelines: Remote Privacy Configuration/Allowlists](./implementation-guidelines-remote-privacy-configuration-allowlists.md)
- [Writing a Schema for Your Config Feature](./writing-schema-for-config-feature.md)
- [Remote Configuration Change Log](./remote-configuration-change-log.md) 