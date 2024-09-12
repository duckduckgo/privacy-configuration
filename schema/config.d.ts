import { CookieFeature } from "./cookie";
import { Feature, SiteException } from "./feature";

export type V4Config<VersionType> = {
    readme: string;
    version: number
    features: Record<string, Feature<any, VersionType>> & {
        // These features have typed settings
        cookie: CookieFeature<VersionType>
    },
    unprotectedTemporary: SiteException[],
    
}

/**
 * Android:
 *  - Uses integer version numbers for minSupportedVersion
 *  - Adds 'experimentalVariants' top level property
 */
export type AndroidV4Config = V4Config<number> & {
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
export type GenericV4Config = V4Config<string>;
