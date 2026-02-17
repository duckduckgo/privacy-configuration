import { CSSInjectFeatureSettings, Feature, FeatureState } from '../feature';

/**
 * A telemetry type is a stateless router. When triggered, it maps events to pixel parameters.
 * The `template` determines how the type's config is interpreted.
 */
type TelemetryTarget = {
    pixel: string;
    param: string;
};

type CounterTelemetryType = {
    state: FeatureState;
    template: 'counter';
    targets: TelemetryTarget[];
};

// Future templates would be added here as union members
type TelemetryType = CounterTelemetryType;

/**
 * Pixel parameter definition. The `type` determines how values are built (must match the
 * telemetry type template that feeds into this parameter).
 */
type CounterPixelParameter = {
    type: 'counter';
    buckets: string[];
};

// Future parameter types would be added here as union members
type PixelParameter = CounterPixelParameter;

/**
 * Trigger defines when a pixel fires.
 */
type PixelTrigger = {
    period: {
        days: number;
        jitterMaxPercent: number;
    };
};

/**
 * A pixel definition. Owns the firing schedule and parameter definitions.
 */
type PixelConfig = {
    trigger: PixelTrigger;
    parameters: Record<string, PixelParameter>;
};

type WebTelemetrySettings = CSSInjectFeatureSettings<{
    /** CSS-level toggle for video playback telemetry */
    videoPlayback?: FeatureState;
    /** CSS-level toggle for URL change telemetry */
    urlChanged?: FeatureState;
    /** Telemetry types: stateless routers that map events to pixel parameters */
    telemetryTypes?: Record<string, TelemetryType>;
    /** Pixel definitions: own the firing schedule, jitter, and parameter state */
    pixels?: Record<string, PixelConfig>;
}>;

export type WebTelemetryFeature<VersionType> = Feature<WebTelemetrySettings, VersionType>;
