import { Feature } from '../feature';

// Also referenced in tests/tracker-allowlist-tests.js — keep in sync
type AllowlistRule = {
    rule: string;
    domains: string[];
    reason?: string | string[];
};

type TrackerAllowlist = {
    allowlistedTrackers: {
        [domain: string]: {
            rules: AllowlistRule[];
        };
    };
};

export type TrackerAllowlistFeature<VersionType> = Feature<TrackerAllowlist, VersionType>;
