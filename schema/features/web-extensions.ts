import { Feature, SubFeature } from '../feature';

export type WebExtensionsConfig<VersionType> = Feature<
    {},
    VersionType,
    {
        embedded?: SubFeature<VersionType>;
        embeddedRollout?: SubFeature<VersionType>;
    }
>;
