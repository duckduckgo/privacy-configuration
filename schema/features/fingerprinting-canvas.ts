import { Feature, CSSInjectFeatureSettings, CSSConfigSetting, FeatureState } from '../feature';

type FullFingerprintingCanvasOptions = CSSInjectFeatureSettings<{
    additionalEnabledCheck?: FeatureState;
    webGl?: FeatureState;
    safeMethods?: string[];
    unsafeMethods?: string[];
    unsafeGlMethods?: string[];
    canvasMethods?: string[];
}>;

export type FingerprintingCanvasFeature<VersionType> = Feature<Partial<FullFingerprintingCanvasOptions>, VersionType>;
