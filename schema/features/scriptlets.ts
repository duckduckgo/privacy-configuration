import { Feature, CSSInjectFeatureSettings } from '../feature';

type ScriptletRule = {
    name: string;
    attrs?: Record<string, string>;
    source?: string;
};

type FullScriptletsOptions = CSSInjectFeatureSettings<{
    scriptlets: ScriptletRule[];
}>;

export type ScriptletSettings = Partial<FullScriptletsOptions>;

export type ScriptletsFeature<VersionType> = Feature<ScriptletSettings, VersionType>;
