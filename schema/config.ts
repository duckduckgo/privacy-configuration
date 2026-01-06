import { Feature, SiteException } from './feature';
import { AttributedMetricsFeature } from './features/attributed-metrics';
import { AutoconsentFeature } from './features/autoconsent';
import { CookieFeature } from './features/cookie';
import { TrackerAllowlistFeature } from './features/tracker-allowlist';
import { WebCompatFeature } from './features/webcompat';
import { DuckPlayerFeature } from './features/duckplayer';
import { DuckPlayerNativeFeature } from './features/duckplayer-native';
import { AutofillFeature } from './features/autofill';
import { ImportFeature } from './features/import';
import { MessageBridgeFeature } from './features/message-bridge';
import { AndroidBrowserConfig } from './features/android-browser-config';
import { APIManipulationFeature } from './features/api-manipulation';
import { FingerprintingHardwareFeature } from './features/fingerprinting-hardware';
import { FingerprintingCanvasFeature } from './features/fingerprinting-canvas';
import { FingerprintingScreenSizeFeature } from './features/fingerprinting-screen-size';
import { NetworkProtection } from './features/network-protection';
import { AiChatConfig } from './features/ai-chat';
import { ScriptletsFeature } from './features/scriptlets';
import { WindowsWebViewFailures } from './features/windows-webview-failures';
import { CustomUserAgentFeature } from './features/custom-user-agent';
import { BurnFeature } from './features/burn';
import { Taskbar } from './features/taskbar';
import { AppHealth } from './features/appHealth';
import { ElementHidingFeature } from './features/element-hiding';
import { RequestBlocklistFeature } from './features/request-blocklist';
import { UaChBrandsFeature } from './features/ua-ch-brands';
import { UrlPredictorFeature } from './features/url-predictor';
import { WebInterferenceDetectionFeature } from './features/web-interference-detection';

export { WebCompatSettings } from './features/webcompat';
export { DuckPlayerSettings } from './features/duckplayer';

export type ExportedSchemas =
    | 'CurrentGenericConfig'
    | 'AndroidCurrentConfig'
    | 'LegacyConfig'
    | 'LegacyAndroidConfig'
    | 'WebCompatSettings'
    | 'DuckPlayerSettings'
    | 'DuckPlayerNativeSettings'
    | 'AttributedMetricsFeature';

/**
 * Defines the structure of the built V6 config output as downloaded by clients.
 *
 * V6 changes:
 * - Added exceptions to sub-features for per-domain exception control
 * - Added rollout, targets, description, cohorts to parent features
 *   (cohorts at parent level won't be functionally supported, but shouldn't cause parse errors)
 */
export type ConfigV6<VersionType> = {
    readme: string;
    version: number;
    features: Record<string, Feature<any, VersionType>> & {
        // These features have typed settings
        aiChat?: AiChatConfig<VersionType>;
        apiManipulation?: APIManipulationFeature<VersionType>;
        appHealth?: AppHealth<VersionType>;
        attributedMetrics?: AttributedMetricsFeature<VersionType>;
        autoconsent?: AutoconsentFeature<VersionType>;
        autofill?: AutofillFeature<VersionType>;
        burn?: BurnFeature<VersionType>;
        taskbar?: Taskbar<VersionType>;
        import?: ImportFeature<VersionType>;
        cookie?: CookieFeature<VersionType>;
        duckPlayer?: DuckPlayerFeature<VersionType>;
        duckPlayerNative?: DuckPlayerNativeFeature<VersionType>;
        trackerAllowlist?: TrackerAllowlistFeature<VersionType>;
        webCompat?: WebCompatFeature<VersionType>;
        messageBridge?: MessageBridgeFeature<VersionType>;
        androidBrowserConfig?: AndroidBrowserConfig<VersionType>;
        fingerprintingHardware?: FingerprintingHardwareFeature<VersionType>;
        fingerprintingCanvas?: FingerprintingCanvasFeature<VersionType>;
        fingerprintingScreenSize?: FingerprintingScreenSizeFeature<VersionType>;
        networkProtection?: NetworkProtection<VersionType>;
        scriptlets?: ScriptletsFeature<VersionType>;
        windowsWebviewFailures?: WindowsWebViewFailures<VersionType>;
        windowsWebviewFailures_DDGWV?: WindowsWebViewFailures<VersionType>;
        customUserAgent?: CustomUserAgentFeature<VersionType>;
        elementHiding?: ElementHidingFeature<VersionType>;
        requestBlocklist?: RequestBlocklistFeature<VersionType>;
        uaChBrands?: UaChBrandsFeature<VersionType>;
        urlPredictor?: UrlPredictorFeature<VersionType>;
        webInterferenceDetection?: WebInterferenceDetectionFeature<VersionType>;
    };
    unprotectedTemporary: SiteException[];
};

/**
 * Legacy V5 config type - maintains backwards compatibility.
 * @deprecated Use ConfigV6 for new implementations
 */
export type ConfigV5<VersionType> = ConfigV6<VersionType>;

/**
 * Android:
 *  - Uses integer version numbers for minSupportedVersion
 *  - Adds 'experimentalVariants' top level property
 */
export type AndroidCurrentConfig = ConfigV6<number> & {
    experimentalVariants: {
        variants: {
            desc: string;
            variantKey: string;
            weight: number;
            filters?: {
                privacyProEligible?: boolean;
            };
        }[];
    };
};

/**
 * Generic spec: covers mac, iOS, windows and extension configs
 *  - Use string version numbers for minSupportedVersion
 */
export type CurrentGenericConfig = ConfigV6<string>;

/**
 * Legacy config types for backwards compatibility with v5 clients
 */
export type LegacyConfig = CurrentGenericConfig;
export type LegacyAndroidConfig = AndroidCurrentConfig;
