import { Feature, SubFeature } from '../feature';
import { CuratedExtension } from './extension-management';

// Settings of one extensionsCatalog sub-feature: the extension's catalog listing
export type CatalogExtension = CuratedExtension & {
    // Position in the catalog, ascending. Entries without one sort last.
    order?: number;
};

// Sub-feature keys are extension names (e.g. `bitwarden`). Clients only read the keys they know about.
export type ExtensionsCatalogFeature<VersionType> = Feature<never, VersionType, Record<string, SubFeature<VersionType, CatalogExtension>>>;
