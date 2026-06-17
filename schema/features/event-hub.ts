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
// Period data params carry a `source` identifying the event stream; immediate-trigger data params
// omit it (the value comes from the triggering event, whose name is the trigger's `source`).
type TelemetryParameterData = TelemetryParameterBase & {
    template: 'data';
    source?: string;
    dataKey: string;
};

type TelemetryParameter = TelemetryParameterCounter | TelemetryParameterData;

// Aggregates events over a recurring window. `type` is optional and defaults to
// 'period' for backward compatibility with entries authored before the discriminator.
type PeriodTrigger = {
    type?: 'period';
    period: {
        seconds?: number;
        minutes?: number;
        hours?: number;
        days?: number;
    };
};

// Fires once per triggering event rather than aggregating, so it carries no `period`.
// `source` names the event that fires the pixel; data params on an immediate trigger forward
// that event's payload and so omit their own `source`.
type ImmediateTrigger = {
    type: 'immediate';
    source: string;
};

type TelemetryTrigger = PeriodTrigger | ImmediateTrigger;

type TelemetryEntry = {
    state: FeatureState;
    trigger: TelemetryTrigger;
    parameters: Record<string, TelemetryParameter>;
};

// intentionally not using CSSInjectFeatureSettings here as this does not
// support conditional changes
export type EventHubSettings = {
    telemetry?: Record<string, TelemetryEntry>;
};

export type EventHubFeature<VersionType> = Feature<EventHubSettings, VersionType>;
