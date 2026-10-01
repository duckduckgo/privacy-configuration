import { Cohort, Feature, SubFeature } from '../feature';

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

// The apps only read these names; any other cohort would silently enrol nobody.
type PerformanceOptimizedPaywallsCohort = Cohort & {
    name: 'control' | 'treatment';
};

type SubFeatures<VersionType> = {
    performanceOptimizedPaywalls?: Omit<SubFeature<VersionType, PerformanceOptimizedPaywallsSettings>, 'cohorts'> & {
        cohorts?: PerformanceOptimizedPaywallsCohort[];
    };
};

export type PrivacyProFeature<VersionType> = Feature<any, VersionType, SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>>;
