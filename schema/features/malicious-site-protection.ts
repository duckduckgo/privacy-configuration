import { CSSInjectFeatureSettings } from '../feature';

export type MaliciousSiteProtectionSettings = CSSInjectFeatureSettings<{
    hashPrefixUpdateFrequency: number;
    filterSetUpdateFrequency: number;
}>;
