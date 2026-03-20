import { Feature, SubFeature } from '../feature';

type UserAgentOverride = {
    domain: string;
    userAgent: string;
};

type DomainWithReason = {
    domain: string;
    reason: string;
};

type DomainOnly = {
    domain: string;
};

type UserAgentConfig = {
    state?: string;
    versions?: string[];
};

type VersionsOnly = {
    versions: string[];
};

type CustomUserAgentSettings = {
    // Windows properties
    userAgentOverrides?: UserAgentOverride[];
    omitClientHintMutations?: DomainOnly[];

    // Common properties (can be strings for Windows or objects for mobile platforms)
    omitApplicationSites?: string[] | DomainOnly[];
    omitVersionSites?: string[] | DomainOnly[];

    // macOS/iOS/Android properties
    defaultPolicy?: 'brand' | 'closest' | string;
    defaultSites?: DomainWithReason[];
    ddgFixedSites?: DomainWithReason[];
    ddgDefaultSites?: DomainWithReason[];
    webViewDefault?: DomainWithReason[];

    // iOS specific properties
    useUpdatedSafariVersions?: boolean;
    safariVersionMappings?: Record<string, string>;

    // iOS/Android specific user agent configs
    closestUserAgent?: UserAgentConfig | VersionsOnly;
    ddgFixedUserAgent?: UserAgentConfig;
};

// Windows-specific sub-feature: userAgentStrategies
type UserAgentStrategy = {
    strategy: string;
    domain: string;
    pathRegex?: string;
};

type SubFeatures<VersionType> = {
    userAgentStrategies?: SubFeature<
        VersionType,
        {
            strategies: UserAgentStrategy[];
        }
    >;
};

export type CustomUserAgentFeature<VersionType> = Feature<
    CustomUserAgentSettings,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
