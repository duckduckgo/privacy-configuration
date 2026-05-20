import { Feature, CSSInjectFeatureSettings, CSSConfigSetting, FeatureState } from '../feature';

type RemoveAPIChange = {
    type: 'remove';
};

type DescriptorAPIChange = {
    type: 'descriptor';
    enumerable?: boolean;
    configurable?: boolean;
    // Accessor-style overrides: supply `getterValue` to override the property's getter, and/or
    // `setterValue` to override its setter (each invoked on access/assignment respectively).
    // Either or both may be supplied; mutually exclusive with `value`.
    getterValue?: CSSConfigSetting;
    setterValue?: CSSConfigSetting;
    // Value-style overrides: supply `value` to replace the property with a data descriptor
    // (also used to replace methods, including DOM methods - the runtime masks the replacement
    // so `toString()`, `name`, and `length` continue to resemble the original).
    // Mutually exclusive with `getterValue`/`setterValue`. At least one of `getterValue`,
    // `setterValue`, or `value` must be supplied; this is enforced at runtime.
    value?: CSSConfigSetting;
    define?: boolean; // If this is true, it permits defining new properties on the object. Otherwise, it only permits modifying existing properties.
};

type FullAPIManipulationOptions = CSSInjectFeatureSettings<{
    apiChanges: Record<string, RemoveAPIChange | DescriptorAPIChange>;
    additionalCheck?: FeatureState;
}>;
export type APIManipulationSettings = Partial<FullAPIManipulationOptions>;

export type APIManipulationFeature<VersionType> = Feature<APIManipulationSettings, VersionType>;
