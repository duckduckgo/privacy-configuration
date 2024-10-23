import { Feature, SiteException } from "./feature";
import { AutoconsentFeature } from "./features/autoconsent";
import { CookieFeature } from "./features/cookie";
import { TrackerAllowlistFeature } from "./features/tracker-allowlist";
import { WebCompatFeature } from "./features/webcompat";

/**
 * Defines the structure of the built V4 config output as downloaded by clients.
 */
export type ConfigV4<VersionType> = {
    readme: string;
    version: number
    features: Record<string, Feature<any, VersionType>> & {
        // These features have typed settings
        autoconsent: AutoconsentFeature<VersionType>
        cookie: CookieFeature<VersionType>
        trackerAllowlist: TrackerAllowlistFeature<VersionType>
        webCompat: WebCompatFeature<VersionType>
    },
    unprotectedTemporary: SiteException[],

}

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
        }[]
    }
}

/**
 * Generic spec: covers mac, iOS, windows and extension configs
 *  - Use string version numbers for minSupportedVersion
 */
export type GenericV4Config = ConfigV4<string>;
