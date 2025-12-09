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
 * Defines the structure of the built V5 config output as downloaded by clients.
 */
export type ConfigV5<VersionType> = {
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
    };
    unprotectedTemporary: SiteException[];
};

/**
 * Android:
 *  - Uses integer version numbers for minSupportedVersion
 *  - Adds 'experimentalVariants' top level property
 */
export type AndroidCurrentConfig = ConfigV5<number> & {
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
export type CurrentGenericConfig = ConfigV5<string>;

export type LegacyConfig = CurrentGenericConfig;
export type LegacyAndroidConfig = AndroidCurrentConfig;
