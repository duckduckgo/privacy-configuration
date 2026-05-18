import { Feature, CSSInjectFeatureSettings, CSSConfigSetting, FeatureState } from '../feature';

type RemoveAPIChange = {
    type: 'remove';
};

type BaseDescriptorAPIChange = {
    type: 'descriptor';
    enumerable?: boolean;
    configurable?: boolean;
    define?: boolean; // If this is true, it permits defining new properties on the object. Otherwise, it only permits modifying existing properties.
};

type GetterDescriptorAPIChange = BaseDescriptorAPIChange & {
    getterValue: CSSConfigSetting;
    value?: never;
};

type ValueDescriptorAPIChange = BaseDescriptorAPIChange & {
    value: CSSConfigSetting;
    getterValue?: never;
};

type FullAPIManipulationOptions = CSSInjectFeatureSettings<{
    apiChanges: Record<string, RemoveAPIChange | GetterDescriptorAPIChange | ValueDescriptorAPIChange>;
    additionalCheck?: FeatureState;
}>;
export type APIManipulationSettings = Partial<FullAPIManipulationOptions>;

export type APIManipulationFeature<VersionType> = Feature<APIManipulationSettings, VersionType>;
