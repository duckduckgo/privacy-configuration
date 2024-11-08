import { Feature } from '../feature';

type AllowlistRule = {
    rule: string;
    domains: string[];
};

type TrackerAllowlist = {
    allowlistedTrackers: {
        [domain: string]: {
            rules: AllowlistRule[];
        };
    };
};

export type TrackerAllowlistFeature<VersionType> = Feature<TrackerAllowlist, VersionType>;
