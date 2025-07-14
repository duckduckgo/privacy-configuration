import { Feature, SiteException } from './feature';
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
import { FingerprintingScreenSizeFeature } from './features/fingerprinting-screen-size';
import { NetworkProtection } from './features/network-protection';
import { AiChatConfig } from './features/ai-chat';
import { ScriptletsFeature } from './features/scriptlets';

export { WebCompatSettings } from './features/webcompat';
export { DuckPlayerSettings } from './features/duckplayer';
export { DuckPlayerNativeSettings } from './features/duckplayer-native';

export type ExportedSchemas =
    | 'CurrentGenericConfig'
    | 'AndroidCurrentConfig'
    | 'LegacyConfig'
    | 'LegacyAndroidConfig'
    | 'WebCompatSettings'
    | 'DuckPlayerSettings'
    | 'DuckPlayerNativeSettings';

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
        autoconsent?: AutoconsentFeature<VersionType>;
        autofill?: AutofillFeature<VersionType>;
        import?: ImportFeature<VersionType>;
        cookie?: CookieFeature<VersionType>;
        duckPlayer?: DuckPlayerFeature<VersionType>;
        duckPlayerNative?: DuckPlayerNativeFeature<VersionType>;
        trackerAllowlist?: TrackerAllowlistFeature<VersionType>;
        webCompat?: WebCompatFeature<VersionType>;
        messageBridge?: MessageBridgeFeature<VersionType>;
        androidBrowserConfig?: AndroidBrowserConfig<VersionType>;
        fingerprintingHardware?: FingerprintingHardwareFeature<VersionType>;
        fingerpringtingScreenSize?: FingerprintingScreenSizeFeature<VersionType>;
        networkProtection?: NetworkProtection<VersionType>;
        scriptlets?: ScriptletsFeature<VersionType>;
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
