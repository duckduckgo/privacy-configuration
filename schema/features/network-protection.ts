import { Feature, SubFeature } from '../feature';

// Type of the feature `settings` object
type SettingsType = {
    daysBeforeSurvey?: number;
    betaEnding?: boolean;
    betaEndingTitle?: string;
    betaEndingDescription?: string;
    autoExcludeApps?: {
        packageName: string;
    }[];
};

type DomainInfo = {
    address: string;
    region: string;
};

type DomainsConfig = {
    [domain: string]: DomainInfo[];
};

// Any subfeatures that have typed `settings` should be defined here.
// Subfeatures without settings (or just string:string mappings for settings) will be automatically validated.
type SubFeatures<VersionType> = {
    localVpnControllerDns?: SubFeature<
        VersionType,
        {
            domains: DomainsConfig;
        }
    >;
};

export type NetworkProtection<VersionType> = Feature<
    SettingsType,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
