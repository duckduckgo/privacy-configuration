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

// Forwards a value from the event payload (under `dataKey`) as the parameter, rather than counting.
// Aggregate-period data params carry a `source`; immediate-trigger ones may omit it.
type TelemetryParameterData = TelemetryParameterBase & {
    template: 'data';
    source?: string;
    dataKey: string;
};

type TelemetryParameter = TelemetryParameterCounter | TelemetryParameterData;

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
