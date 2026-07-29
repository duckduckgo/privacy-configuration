import { Feature, SubFeature } from '../feature';

// Per-extension special-behavior overrides, keyed by extension id in the feature `settings`.
type ExtensionSpecialBehavior = {
    overridesInternalAutofill?: boolean;
};

// Type of the feature `settings` object
type ExtensionManagementSettings = {
    hiddenExtensionIds: string[];
    disabledExtensionIds: string[];
    specialBehavior: Record<string, ExtensionSpecialBehavior>;
};

// One entry in the curated extensions catalog
type CuratedExtension = {
    id: string;
    name: string;
    description: string;
    publisher: string;
    publisherUri: string;
    iconUri: string;
    cwsUri: string;
    categoryId: string;
};

// Type of the `curatedExtensions` subfeature `settings` object
type CuratedExtensionsSettings = {
    catalog: CuratedExtension[];
};

type SubFeatures<VersionType> = {
    curatedExtensions?: SubFeature<VersionType, CuratedExtensionsSettings>;
};

export type ExtensionManagementFeature<VersionType> = Feature<
    ExtensionManagementSettings,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
