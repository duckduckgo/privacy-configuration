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

type TelemetryParameter = TelemetryParameterCounter;

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
