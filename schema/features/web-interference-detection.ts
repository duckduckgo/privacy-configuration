import { Feature, CSSInjectFeatureSettings, FeatureState } from '../feature';

type StatusSelector = {
    status: string;
    selectors: string[];
};

type BotDetector = {
    state: FeatureState;
    vendor: string;
    selectors: string[];
    windowProperties?: string[];
    statusSelectors?: StatusSelector[];
};

type FraudDetector = {
    state: FeatureState;
    type: string;
    selectors: string[];
    textPatterns?: string[];
    textSources?: string[];
};
type AdwallDetector = {
    state: FeatureState;
    textPatterns?: string[];
    textSources?: string[];
};

type YoutubeAdsDetector = {
    state: FeatureState;
    sweepIntervalMs?: number;
    slowLoadThresholdMs?: number;
    playerSelectors?: string[];
    adClasses?: string[];
    adTextPatterns?: string[];
    staticAdSelectors?: {
        background?: string;
        thumbnail?: string;
        image?: string;
    };
    playabilityErrorSelectors?: string[];
    playabilityErrorPatterns?: string[];
    adBlockerDetectionSelectors?: string[];
    adBlockerDetectionPatterns?: string[];
    loginStateSelectors?: {
        signInButton?: string;
        avatarButton?: string;
        premiumLogo?: string;
    };
};

type WebInterferenceDetectionSettings = CSSInjectFeatureSettings<{
    autoRunDelayMs?: number;
    interferenceTypes?: {
        botDetection?: Record<string, BotDetector>;
        fraudDetection?: Record<string, FraudDetector>;
        adwallDetection?: Record<string, AdwallDetector>;
        youtubeAds?: YoutubeAdsDetector;
    };
}>;

export type WebInterferenceDetectionFeature<VersionType> = Feature<WebInterferenceDetectionSettings, VersionType>;
