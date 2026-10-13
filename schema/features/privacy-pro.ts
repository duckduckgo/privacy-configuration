import { Cohort, Feature, SubFeature } from '../feature';

type PaywallEntryPoint = {
    path: string;
};

type PerfPaywall = {
    entryPoints?: {
        vpn?: PaywallEntryPoint;
        duckai?: PaywallEntryPoint;
        pir?: PaywallEntryPoint;
    };
};

// The apps only read these names; any other cohort would silently enrol nobody.
interface PerfPaywallCohorts extends Cohort {
    name: 'control' | 'treatment';
}

interface PerfPaywallSubFeature<VersionType> extends SubFeature<VersionType, PerfPaywall> {
    cohorts?: PerfPaywallCohorts[];
}

// Add more privacy-pro subfeatures here
type SubFeatures<VersionType> = {
    performanceOptimizedPaywalls?: PerfPaywallSubFeature<VersionType>;
};

export type PrivacyProFeature<VersionType> = Feature<any, VersionType, SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>>;
