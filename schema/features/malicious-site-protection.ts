import { Feature, CSSInjectFeatureSettings } from '../feature';

type State = 'enabled' | 'disabled' | 'internal';
type StateObject = {
    state: State;
};

export type MaliciousSiteProtectionSettings = CSSInjectFeatureSettings<{
    hashPrefixUpdateFrequency: number;
    filterSetUpdateFrequency: number;
}>;
