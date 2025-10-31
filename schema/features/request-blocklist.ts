import { Feature } from '../feature';

type RuleType = {
    rule: string;
    domains: string[];
    reason: string[] | string;
};

type SettingsType = {
    blockedRequests: {
        [domain: string]: {
            rules: RuleType[];
        };
    };
};

export type RequestBlocklistFeature<VersionType> = Feature<SettingsType, VersionType>;
