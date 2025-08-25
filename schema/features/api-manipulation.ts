import { Feature, CSSInjectFeatureSettings, CSSConfigSetting, FeatureState } from '../feature';

type RemoveAPIChange = {
    type: 'remove';
};

type DescriptorAPIChange = {
    type: 'descriptor';
    enumerable?: boolean;
    configurable?: boolean;
    getterValue: CSSConfigSetting;
    define?: boolean; // If this is true, it permits defining new properties on the object. Otherwise, it only permits modifying existing properties.
};

type FullAPIManipulationOptions = CSSInjectFeatureSettings<{
    apiChanges: Record<string, RemoveAPIChange | DescriptorAPIChange>;
    additionalCheck?: FeatureState;
}>;
export type APIManipulationSettings = Partial<FullAPIManipulationOptions>;

export type APIManipulationFeature<VersionType> = Feature<APIManipulationSettings, VersionType>;
