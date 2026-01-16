import { Feature, SubFeature } from '../feature';

// Type of the feature `settings` object
type PasswordManagerExtensionsSettings = {
    manifestXml: string;
};

// Type of the subfeature `settings` object for each password manager
type PasswordManagerSubFeatureSettings = {
    id: string;
};

// Subfeatures for each password manager
type SubFeatures<VersionType> = {
    bitwarden?: SubFeature<VersionType, PasswordManagerSubFeatureSettings>;
    lastpass?: SubFeature<VersionType, PasswordManagerSubFeatureSettings>;
    onepassword?: SubFeature<VersionType, PasswordManagerSubFeatureSettings>;
    roboform?: SubFeature<VersionType, PasswordManagerSubFeatureSettings>;
};

export type PasswordManagerExtensionsFeature<VersionType> = Feature<
    PasswordManagerExtensionsSettings,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
