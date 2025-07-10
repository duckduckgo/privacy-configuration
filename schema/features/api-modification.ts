import { Feature, CSSInjectFeatureSettings, CSSConfigSetting } from '../feature';

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

type FullAPIModificationOptions = CSSInjectFeatureSettings<{
    apiChanges: Record<string, RemoveAPIChange | DescriptorAPIChange>;
}>;
export type APIModificationSettings = Partial<FullAPIModificationOptions>;

export type APIModificationFeature<VersionType> = Feature<APIModificationSettings, VersionType>;
