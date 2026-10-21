import { Feature, CSSInjectFeatureSettings, FeatureState } from '../feature';

type FullFingerprintingCanvasOptions = CSSInjectFeatureSettings<{
    // Codebase change
    additionalEnabledCheck?: FeatureState;
    // Generic change used elsewhere.
    additionalCheck?: FeatureState;
    webGl?: FeatureState;
    safeMethods?: string[];
    unsafeMethods?: string[];
    unsafeGlMethods?: string[];
    canvasMethods?: string[];
}>;

export type FingerprintingCanvasFeature<VersionType> = Feature<Partial<FullFingerprintingCanvasOptions>, VersionType>;
