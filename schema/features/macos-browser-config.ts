import { Feature, SubFeature } from '../feature';

type SettingsType = undefined;

type SubFeatures<VersionType> = {
    controlClickFix?: SubFeature<
        VersionType,
        {
            domains: string[];
        }
    >;
    autoplayPolicy?: SubFeature<
        VersionType,
        {
            domainsAllowList: string[];
        }
    >;
};

export type MacOSBrowserConfig<VersionType> = Feature<
    SettingsType,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
