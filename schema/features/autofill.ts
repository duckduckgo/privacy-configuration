import { Feature, SubFeature } from '../feature';
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

type FormBoundarySetting = {
    selector: string;
    inputs: string[];
};

type FormTypeSetting = {
    selector: string;
    type: 'credentials.username.new' | 'credentials.password.new';
    inputs: {
        selector: string;
        type: 'credentials.username.new' | 'credentials.password.new';
    }[];
};

type SiteSpecificFixes = {
    formBoundarySettings: FormBoundarySetting[];
    formTypeSettings: FormTypeSetting[];
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
    siteSpecificFixes?: SubFeature<
        VersionType,
        {
            javascriptConfig: {
                domains: {
                    domain: string | string[];
                    patchSettings: Operation<SiteSpecificFixes>[];
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
