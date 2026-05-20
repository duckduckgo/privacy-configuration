import { Feature, CSSInjectFeatureSettings, CSSConfigSetting, FeatureState } from '../feature';

type RemoveAPIChange = {
    type: 'remove';
};

type DescriptorAPIChange = {
    type: 'descriptor';
    enumerable?: boolean;
    configurable?: boolean;
    // If true and the property is not already an own property of the target, defines a new own
    // property (shadowing any inherited one from the prototype chain - e.g. set this when
    // targeting `MediaDevices.prototype.addEventListener` which is inherited from
    // `EventTarget.prototype`). When false or omitted, the change is merged with any existing
    // own descriptor; changes whose target property exists only via the prototype chain are
    // silently skipped.
    define?: boolean;
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
};

type FullAPIManipulationOptions = CSSInjectFeatureSettings<{
    apiChanges: Record<string, RemoveAPIChange | DescriptorAPIChange>;
    additionalCheck?: FeatureState;
}>;
export type APIManipulationSettings = Partial<FullAPIManipulationOptions>;

export type APIManipulationFeature<VersionType> = Feature<APIManipulationSettings, VersionType>;
