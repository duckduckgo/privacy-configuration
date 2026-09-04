import { Feature, CSSInjectFeatureSettings } from '../feature';

/**
 * Threshold bin edges in milliseconds, ascending. These are discovery bins,
 * not performance budgets. Edges are encoded into emitted event-type names
 * (e.g. `detectorPerf_bot_over16ms`), which must have matching eventHub
 * telemetry parameter sources — enforced by tests/detector-perf-tests.js.
 */
type DetectorThresholds = {
    singleRunThresholdsMs?: number[];
    totalPerPageThresholdsMs?: number[];
};

type DetectorPerfSettings = CSSInjectFeatureSettings<{
    /** Threshold edges applied to every detector unless overridden. */
    defaults?: DetectorThresholds;
    /** Threshold edges for the combined all-detector total per page. */
    combinedThresholdsMs?: number[];
    /** Per-detector threshold overrides, keyed by detector label (e.g. `bot`). */
    detectorOverrides?: Record<string, DetectorThresholds>;
    /**
     * Cap on severe (immediate) emissions per page. Each (detector, kind) pair
     * still fires at most once; the cap bounds fleet-wide pixel volume if a
     * bad config push makes every detector cross. Client default: 10.
     */
    maxSeverePerPage?: number;
}>;

export type DetectorPerfFeature<VersionType> = Feature<DetectorPerfSettings, VersionType>;
