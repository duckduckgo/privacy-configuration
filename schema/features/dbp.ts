import { Feature, SubFeature } from '../feature';

/**
 * Lowercase hex SHA-256 of a broker bundle signing public key's SPKI DER bytes.
 * @pattern ^[0-9a-f]{64}$
 */
type BundleSigningKeyHash = string;

type SettingsType = {
    /**
     * Keys clients must stop trusting for PIR broker bundles. Entries must never be removed.
     * @uniqueItems true
     */
    revokedBundleSigningKeys?: BundleSigningKeyHash[];
    daysBeforeSurvey?: number;
    betaEnding?: boolean;
    betaEndingTitle?: string;
    betaEndingDescription?: string;
};

type SubFeatures<VersionType> = {
    challengeSolver?: SubFeature<
        VersionType,
        {
            enabledBrokers: string[];
            autoPassWaitSeconds: number;
            checkboxOffsetPoints: number;
            labelText: string;
        }
    >;
};

export type DbpFeature<VersionType> = Feature<
    SettingsType,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
