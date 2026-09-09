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
    // Help-page URL for the page-header "Learn more" link on the extensions settings screen.
    learnMoreUrl?: string;
    // Help-page URL for the "Learn more" link on a remotely-disabled extension's notice.
    learnMoreUrlRemoteDisable?: string;
};

// One entry in the curated extensions catalog
type CuratedExtension = {
    id: string;
    name: string;
    publisher: string;
    publisherUri: string;
    iconUri: string;
    cwsUri: string;
    categoryId: string;
};

// Type of the `curatedExtensions` subfeature `settings` object
type CuratedExtensionsSettings = {
    catalog: CuratedExtension[];
    // Catalog for internal builds, read in place of `catalog` rather than added
    // to it, so extensions still being trialled can be offered internally while
    // the public catalog stays narrower. Optional: clients fall back to
    // `catalog` when it is absent.
    catalogInternal?: CuratedExtension[];
};

type SubFeatures<VersionType> = {
    curatedExtensions?: SubFeature<VersionType, CuratedExtensionsSettings>;
};

export type ExtensionManagementFeature<VersionType> = Feature<
    ExtensionManagementSettings,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
