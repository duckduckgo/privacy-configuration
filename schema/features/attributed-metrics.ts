import { Feature, SubFeature } from '../feature';

export type AttributedMetricsSettings = {
    user_retention_week: {
        buckets: number[];
        version: number;
    };
    user_retention_month: {
        buckets: number[];
        version: number;
    };
    user_active_past_week: {
        buckets: number[];
        version: number;
    };
    user_average_searches_past_week_first_month: {
        buckets: number[];
        version: number;
    };
    user_average_ad_clicks_past_week: {
        buckets: number[];
        version: number;
    };
    user_average_duck_ai_usage_past_week: {
        buckets: number[];
        version: number;
    };
    user_subscribed: {
        buckets: number[];
        version: number;
    };
    user_synced_device: {
        buckets: number[];
        version: number;
    };
};

export type AttributedMetricsSubFeatures = {
    emitAllMetrics: SubFeature<string>;
    retention: SubFeature<string>;
    canEmitRetention: SubFeature<string>;
    searchDaysAvg: SubFeature<string>;
    canEmitSearchDaysAvg: SubFeature<string>;
    searchCountAvg: SubFeature<string>;
    canEmitSearchCountAvg: SubFeature<string>;
    adClickCountAvg: SubFeature<string>;
    canEmitAdClickCountAvg: SubFeature<string>;
    aiUsageAvg: SubFeature<string>;
    canEmitAIUsageAvg: SubFeature<string>;
    subscriptionRetention: SubFeature<string>;
    canEmitSubscriptionRetention: SubFeature<string>;
    syncDevices: SubFeature<string>;
    canEmitSyncDevices: SubFeature<string>;
};

export type AttributedMetricsFeature = Feature<AttributedMetricsSettings, string, AttributedMetricsSubFeatures>;
