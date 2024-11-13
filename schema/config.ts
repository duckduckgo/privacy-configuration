import { Feature, SiteException } from './feature';
import { AutoconsentFeature } from './features/autoconsent';
import { CookieFeature } from './features/cookie';
import { TrackerAllowlistFeature } from './features/tracker-allowlist';
import { WebCompatFeature } from './features/webcompat';
import { DuckPlayerFeature } from './features/duckplayer';

export { WebCompatSettings } from './features/webcompat';
export { DuckPlayerSettings } from './features/duckplayer';

export type ExportedSchemas =
    | 'GenericV4Config'
    | 'AndroidV4Config'
    | 'LegacyConfig'
    | 'LegacyAndroidConfig'
    | 'WebCompatSettings'
    | 'DuckPlayerSettings';

/**
 * Defines the structure of the built V4 config output as downloaded by clients.
 */
export type ConfigV4<VersionType> = {
    readme: string;
    version: number;
    features: Record<string, Feature<any, VersionType>> & {
        // These features have typed settings
        autoconsent: AutoconsentFeature<VersionType>;
        cookie: CookieFeature<VersionType>;
        duckPlayer: DuckPlayerFeature<VersionType>;
        trackerAllowlist: TrackerAllowlistFeature<VersionType>;
        webCompat: WebCompatFeature<VersionType>;
    };
    unprotectedTemporary: SiteException[];
};

/**
 * Android:
 *  - Uses integer version numbers for minSupportedVersion
 *  - Adds 'experimentalVariants' top level property
 */
export type AndroidV4Config = ConfigV4<number> & {
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
export type GenericV4Config = ConfigV4<string>;

export type LegacyConfig = GenericV4Config;
export type LegacyAndroidConfig = AndroidV4Config;
