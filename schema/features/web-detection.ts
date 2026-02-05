import { ConditionBlockOrArray, CSSInjectFeatureSettings, Feature, FeatureState } from '../feature';

type MaybeArray<T> = T | T[];

type TriggerBase = {
    state?: FeatureState;
    runConditions?: ConditionBlockOrArray;
};

/**
 * Auto trigger configuration for automatic detection after page load.
 */
type AutoTrigger = TriggerBase & {
    /**
     * Intervals (in milliseconds) after initialisation to run detection.
     * Multiple intervals allow checking at different points during page load.
     */
    intervalMs: number[];
};

type Triggers = Partial<{
    breakageReport: TriggerBase;
    /**
     * Auto trigger enables automatic execution of detectors after page load.
     */
    auto: AutoTrigger;
}>;

/**
 * Fire telemetry action configuration.
 * Triggers a telemetry event via the web-telemetry feature.
 */
type FireTelemetryAction = {
    state?: FeatureState;
    /**
     * The type of telemetry event to fire (e.g., "adwall").
     */
    type: string;
};

type Actions = Partial<{
    breakageReportData: {
        state?: FeatureState;
        /**
         * When debug is true, detection results include { "debug": { "didRun": boolean } }
         * and are included in breakage reports regardless of whether detection succeeded.
         */
        debug?: boolean;
    };
    /**
     * Fire telemetry action triggers a telemetry event via the web-telemetry feature.
     */
    fireTelemetry: FireTelemetryAction;
}>;

export type ConditionTypes = {
    text: {
        pattern: MaybeArray<string>;
        selector?: MaybeArray<string>;
    };
    element: {
        selector: MaybeArray<string>;
        visibility?: 'visible' | 'hidden' | 'any';
    };
};

type MatchCondition = MaybeArray<{
    [K in keyof ConditionTypes]?: MaybeArray<ConditionTypes[K]>;
}>;

export type DetectorConfig = {
    state?: FeatureState;
    match: MatchCondition;
    triggers?: Triggers;
    actions?: Actions;
};

type DetectorGroup = Record<string, DetectorConfig>;

export type WebDetectionSettings = CSSInjectFeatureSettings<{
    detectors?: Record<string, DetectorGroup>;
}>;

export type WebDetectionFeature<VersionType> = Feature<WebDetectionSettings, VersionType>;
