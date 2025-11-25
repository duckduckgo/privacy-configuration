import { Feature, SubFeature } from '../feature';

export type AttributedMetricsSettings = {
    attributed_metric_retention_week: {
        buckets: number[];
        version: number;
    };
    attributed_metric_retention_month: {
        buckets: number[];
        version: number;
    };
    attributed_metric_active_past_week: {
        buckets: number[];
        version: number;
    };
    attributed_metric_average_searches_past_week_first_month: {
        buckets: number[];
        version: number;
    };
    attributed_metric_average_searches_past_week: {
        buckets: number[];
        version: number;
    };
    attributed_metric_average_ad_clicks_past_week: {
        buckets: number[];
        version: number;
    };
    attributed_metric_average_duck_ai_usage_past_week: {
        buckets: number[];
        version: number;
    };
    attributed_metric_subscribed: {
        buckets: number[];
        version: number;
    };
    attributed_metric_synced_device: {
        buckets: number[];
        version: number;
    };
};

// Any subfeatures that have typed `settings` should be defined here.
// Subfeatures without settings (or just string:string mappings for settings) will be automatically validated.
type SubFeatures<VersionType> = {
    sendOriginParam?: SubFeature<
        VersionType,
        {
            originCampaignSubstrings: string[];
        }
    >;
};

export type AttributedMetricsFeature = Feature<AttributedMetricsSettings, string, SubFeatures<string> & Record<string, SubFeature<string>>>;
