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
// On a period trigger the param carries a `source` identifying the event stream it aggregates.
type TelemetryParameterData = TelemetryParameterBase & {
    template: 'data';
    source: string;
    dataKey: string;
};

// On an immediate trigger the value comes from the triggering event itself (named by the
// trigger's `source`), so a data param forwards that payload and omits its own `source`.
type ImmediateTelemetryParameterData = TelemetryParameterBase & {
    template: 'data';
    dataKey: string;
};

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

// Period entries aggregate over a window; their data params must identify a `source` stream.
type PeriodTelemetryEntry = {
    state: FeatureState;
    trigger: PeriodTrigger;
    parameters: Record<string, TelemetryParameterCounter | TelemetryParameterData>;
};

// Immediate entries fire per event; their data params omit `source`. (That counter params are
// not currently meaningful on immediate triggers is enforced by the config tests, not the type.)
type ImmediateTelemetryEntry = {
    state: FeatureState;
    trigger: ImmediateTrigger;
    parameters: Record<string, TelemetryParameterCounter | ImmediateTelemetryParameterData>;
};

type TelemetryEntry = PeriodTelemetryEntry | ImmediateTelemetryEntry;

// intentionally not using CSSInjectFeatureSettings here as this does not
// support conditional changes
export type EventHubSettings = {
    telemetry?: Record<string, TelemetryEntry>;
};

export type EventHubFeature<VersionType> = Feature<EventHubSettings, VersionType>;
