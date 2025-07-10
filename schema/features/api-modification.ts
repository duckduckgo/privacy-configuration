import { Feature, CSSInjectFeatureSettings, CSSConfigSetting } from '../feature';

type RemoveAPIChange = {
    type: 'remove';
};

type DescriptorAPIChange = {
    type: 'descriptor';
    enumerable?: boolean;
    configurable?: boolean;
    getterValue: CSSConfigSetting;
    change?: boolean;
};

type FullAPIModificationOptions = CSSInjectFeatureSettings<{
    apiChanges: Record<string, RemoveAPIChange | DescriptorAPIChange>;
}>;
export type APIModificationSettings = Partial<FullAPIModificationOptions>;

export type APIModificationFeature<VersionType> = Feature<APIModificationSettings, VersionType>;
