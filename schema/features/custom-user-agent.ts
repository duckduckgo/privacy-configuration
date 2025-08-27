import { Feature, CSSInjectFeatureSettings } from '../feature';

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

type FullCustomUserAgentOptions = CSSInjectFeatureSettings<{
    // Windows properties
    userAgentOverrides?: UserAgentOverride[];
    omitClientHintMutations?: string[];

    // Common properties (can be strings for Windows or objects for mobile platforms)
    omitApplicationSites?: string[] | DomainOnly[];
    omitVersionSites?: string[] | DomainOnly[];

    // macOS/iOS/Android properties
    defaultPolicy?: 'brand' | 'closest' | string;
    defaultSites?: DomainWithReason[];
    ddgFixedSites?: DomainWithReason[];
    ddgDefaultSites?: DomainWithReason[];
    webViewDefault?: DomainWithReason[];

    // iOS/Android specific user agent configs
    closestUserAgent?: UserAgentConfig | VersionsOnly;
    ddgFixedUserAgent?: UserAgentConfig;
}>;

export type CustomUserAgentSettings = Partial<FullCustomUserAgentOptions>;

export type CustomUserAgentFeature<VersionType> = Feature<CustomUserAgentSettings, VersionType>;
