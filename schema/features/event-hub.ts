import { Feature, FeatureState } from '../feature';

type TelemetryParameterBase = {
    template: string;
};

type CounterBucket = {
    gte: number;
    lt?: number;
};

type TelemetryParameterCounter = TelemetryParameterBase & {
    template: 'counter';
    source: string;
    buckets: Record<string, CounterBucket>;
};

/**
 * Adds experiment cohort information to the pixel.
 *
 * The fired parameter value is a percent-encoded JSON object keyed by experiment
 * name, e.g. `{"tdsNextExperiment008":{"cohort":"treatment","changedInPeriod":true}}`.
 * When the client belongs to no (matching) experiment the value is the empty object `{}`.
 *
 * `matchExperiments`, when set, is a regular expression matched against the experiment
 * name. Only experiments whose name matches are included. When omitted, all known
 * supported experiments are included.
 */
type TelemetryParameterExperiments = TelemetryParameterBase & {
    template: 'experiments';
    matchExperiments?: string;
};

type TelemetryParameter = TelemetryParameterCounter | TelemetryParameterExperiments;

type TelemetryEntry = {
    state: FeatureState;
    trigger: {
        period: {
            seconds?: number;
            minutes?: number;
            hours?: number;
            days?: number;
        };
    };
    parameters: Record<string, TelemetryParameter>;
};

// intentionally not using CSSInjectFeatureSettings here as this does not
// support conditional changes
export type EventHubSettings = {
    telemetry?: Record<string, TelemetryEntry>;
};

export type EventHubFeature<VersionType> = Feature<EventHubSettings, VersionType>;
