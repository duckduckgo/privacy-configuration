import { Feature, SubFeature } from '../feature';

/*
 * Native Apps experiment framework metrics, declared in the `settings` of the experiment
 * subfeatures they measure and converted by events flowing through the eventHub.
 *
 * Only content scope experiments and TDS experiments carry these. The shape is defined once
 * here and imported by both parents so the contract cannot drift between them and platforms
 * can share a single parser.
 */

// Windows are inclusive [low, high] day bounds from the enrollment day and may overlap.
// windows x thresholds form a product within one group; several groups express a partial
// product (e.g. per-day windows at threshold 1, range windows at higher thresholds).
type MetricConversion = {
    windows: [
        number,
        number,
    ][];
    // Convert on the Nth in-window occurrence. Sent as the pixel's `value` param.
    thresholds: number[];
};

type ExperimentMetric = {
    // The hub event type that converts this metric. Keying by metric name means one event
    // per metric name within an experiment. Names are scoped to their experiment, so two
    // experiments may bind the same metric name to different events.
    event: string;
    conversions: MetricConversion[];
};

// Keyed by metric name, sent as the pixel's `metric` param. No `.` in names.
export type ExperimentMetrics = Record<string, ExperimentMetric>;

export type ExperimentMetricsSettings = {
    metrics?: ExperimentMetrics;
};

export type ContentScopeExperimentsFeature<VersionType> = Feature<
    unknown,
    VersionType,
    Record<string, SubFeature<VersionType, ExperimentMetricsSettings>>
>;

// TDS experiment subfeatures already carry the blocklist URLs for each cohort.
type TdsExperimentSettings = ExperimentMetricsSettings & {
    controlUrl?: string;
    treatmentUrl?: string;
    nextUrl?: string;
};

// The TDS experiment parent feature is `blockList` on Android and `contentBlocking` on the
// other platforms.
export type TdsExperimentsFeature<VersionType> = Feature<
    unknown,
    VersionType,
    Record<string, SubFeature<VersionType, TdsExperimentSettings>>
>;
