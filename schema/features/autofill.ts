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

export type FormTypeSetting = {
    selector: string;
    type: 'login' | 'signup';
};

export type InputTypeSetting = {
    selector: string;
    type: string;
};

export type FailsafeSettings = {
    maxInputsPerPage?: number;
    maxInputsPerForm?: number;
    maxFormsPerPage?: number;
};

export type FormBoundarySelector = string;

export type SiteSpecificFixes = {
    formBoundarySelector?: FormBoundarySelector;
    formTypeSettings?: FormTypeSetting[];
    inputTypeSettings?: InputTypeSetting[];
    failsafeSettings?: FailsafeSettings;
};

// Any subfeatures that have typed `settings` should be defined here.
// Subfeatures without settings (or just string:string mappings for settings) will be automatically validated.
type SubFeatures<VersionType> = {
    // Do not copy this schema, it's not standard. Use siteSpecificFixes instead.
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
    siteSpecificFixes?: SubFeature<VersionType, CSSInjectFeatureSettings<SiteSpecificFixes>>;
};

export type AutofillFeature<VersionType> = Feature<
    SettingsType,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
