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
    pageSignals?: SubFeature<
        VersionType,
        {
            // Max entries per Page Signals list in the breakage report
            maxEntries: number;
        }
    >;
};

export type MacOSBrowserConfig<VersionType> = Feature<
    SettingsType,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
