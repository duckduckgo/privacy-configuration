import { CSSInjectFeatureSettings, Feature, SubFeature } from '../feature';
import { Operation } from '../json-patch';

// Type of the feature `settings` object
type SettingsType = undefined;

type ButtonConfig = {
    shouldAutotap: boolean;
    path: string;
    selectors: string[];
    labelTexts: string[];
};

type ImportFromGooglePasswordManager = {
    settingsButton: ButtonConfig;
    exportButton: ButtonConfig;
    signInButton: ButtonConfig;
};

// Any subfeatures that have typed `settings` should be defined here.
// Subfeatures without settings (or just string:string mappings for settings) will be automatically validated.
type SubFeatures<VersionType> = {
    canImportFromGooglePasswordManager?: SubFeature<
        VersionType,
        {
            launchUrl: string;
            javascriptConfig: {
                domains: {
                    domain: string | string[];
                    patchSettings: Operation<ImportFromGooglePasswordManager>[];
                }[];
            };
        }
    >;
};

export type AutofillFeature<VersionType> = Feature<
    SettingsType,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
