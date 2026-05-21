import { Feature, CSSInjectFeatureSettings, CSSConfigSetting, FeatureState } from '../feature';

type RemoveAPIChange = {
    type: 'remove';
};

type DescriptorTarget = 'own' | 'existing' | 'missing';

type DescriptorPlacement =
    | {
          // Defaults to "own" in Content Scope Scripts. Use "existing" to allow shadow-defining
          // inherited DOM APIs; use "missing" to define a new API only when absent from the
          // target and its prototype chain.
          target?: DescriptorTarget;
          define?: never;
      }
    | {
          target?: never;
          // Deprecated compatibility alias for target: "missing". Do not use in new config.
          define?: boolean;
      };

type BaseDescriptorAPIChange = {
    type: 'descriptor';
    enumerable?: boolean;
    configurable?: boolean;
};

type ValueDescriptorAPIChange = BaseDescriptorAPIChange &
    DescriptorPlacement & {
        // Value-style overrides replace the property with a data descriptor. Use this for
        // methods; C-S-S masks function replacements so toString(), name, and length resemble
        // the original DOM API when one exists.
        value: CSSConfigSetting;
        getterValue?: never;
        setterValue?: never;
    };

type GetterDescriptorAPIChange = BaseDescriptorAPIChange &
    DescriptorPlacement & {
        // Accessor-style override. May be combined with setterValue. Mutually exclusive with value.
        getterValue: CSSConfigSetting;
        setterValue?: CSSConfigSetting;
        value?: never;
    };

type SetterDescriptorAPIChange = BaseDescriptorAPIChange &
    DescriptorPlacement & {
        // Setter-only accessor override. The original getter is preserved when one exists.
        setterValue: CSSConfigSetting;
        getterValue?: CSSConfigSetting;
        value?: never;
    };

type DescriptorAPIChange = ValueDescriptorAPIChange | GetterDescriptorAPIChange | SetterDescriptorAPIChange;

type FullAPIManipulationOptions = CSSInjectFeatureSettings<{
    apiChanges: Record<string, RemoveAPIChange | DescriptorAPIChange>;
    additionalCheck?: FeatureState;
}>;
export type APIManipulationSettings = Partial<FullAPIManipulationOptions>;

export type APIManipulationFeature<VersionType> = Feature<APIManipulationSettings, VersionType>;
