import { Feature, SubFeature } from '../feature';

export type WebExtensionsConfig<VersionType> = Feature<
    {},
    VersionType,
    {
        embeddedExtension?: SubFeature<VersionType>;
    }
>;
