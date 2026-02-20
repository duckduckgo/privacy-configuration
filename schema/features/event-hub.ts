import { CSSInjectFeatureSettings, Feature, FeatureState } from '../feature';

type BucketDefinition = {
    minInclusive: number;
    maxExclusive?: number;
    name: string;
};

type CounterParameter = {
    template: 'counter';
    source: string;
    buckets: BucketDefinition[];
};

// Future parameter types would be added as union members
type TelemetryParameter = CounterParameter;

type PeriodTrigger = {
    period: {
        seconds?: number;
        minutes?: number;
        hours?: number;
        days?: number;
    };
};

type TelemetryPixel = {
    state: FeatureState;
    trigger: PeriodTrigger;
    parameters: Record<string, TelemetryParameter>;
};

type EventHubSettings = CSSInjectFeatureSettings<{
    telemetry?: Record<string, TelemetryPixel>;
}>;

export type EventHubFeature<VersionType> = Feature<EventHubSettings, VersionType>;
