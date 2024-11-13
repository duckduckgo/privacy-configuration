import { Feature, SubFeature } from '../feature';

// Type of the feature `settings` object
type SettingsType = undefined;

// Any subfeatures that have typed `settings` should be defined here.
// Subfeatures without settings (or just string:string mappings for settings) will be automatically validated.
type SubFeatures<VersionType> = {
    canImportFromGooglePasswordManager?: SubFeature<
        VersionType,
        {
            launchUrl: string;
            javascriptConfig: string;
        }
    >;
};

export type AutofillFeature<VersionType> = Feature<
    SettingsType,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
