import { Feature } from '../feature';

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
    revokedBundleSigningKeys: BundleSigningKeyHash[];
    daysBeforeSurvey?: number;
    betaEnding?: boolean;
    betaEndingTitle?: string;
    betaEndingDescription?: string;
};

export type DbpFeature<VersionType> = Feature<SettingsType, VersionType>;
