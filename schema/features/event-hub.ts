import { CSSInjectFeatureSettings, Feature, FeatureState } from '../feature';

/**
 * Counter parameter: increments when its source event fires.
 */
type CounterParameter = {
    template: 'counter';
    source: string;
    buckets: string[];
};

// Future parameter types would be added as union members
type TelemetryParameter = CounterParameter;

/**
 * Period trigger: fires the pixel on a regular cadence.
 */
type PeriodTrigger = {
    period: {
        minutes?: number;
        hours?: number;
        days?: number;
        maxStaggerMins?: number;
    };
};

/**
 * A telemetry pixel definition.
 */
type TelemetryPixel = {
    state: FeatureState;
    trigger: PeriodTrigger;
    parameters: Record<string, TelemetryParameter>;
};

type EventHubSettings = CSSInjectFeatureSettings<{
    telemetry?: Record<string, TelemetryPixel>;
}>;

export type EventHubFeature<VersionType> = Feature<EventHubSettings, VersionType>;
