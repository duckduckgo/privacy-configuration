import { Feature, SubFeature } from '../feature';

type PaywallEntryPoint = {
    path: string;
};

type PerformanceOptimizedPaywallsSettings = {
    entryPoints?: {
        vpn?: PaywallEntryPoint;
        duckai?: PaywallEntryPoint;
        pir?: PaywallEntryPoint;
    };
};

type SubFeatures<VersionType> = {
    performanceOptimizedPaywalls?: SubFeature<VersionType, PerformanceOptimizedPaywallsSettings>;
};

export type PrivacyProFeature<VersionType> = Feature<any, VersionType, SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>>;
