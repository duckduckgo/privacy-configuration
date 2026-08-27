import { Feature, CSSInjectFeatureSettings } from '../feature';

type SelectorEntry = {
    type: 'css' | 'xpath';
    value: string;
};

export type ChromeWebstorePatchingSettings = CSSInjectFeatureSettings<{
    /**
     * Execution gate: disabled by default everywhere, flipped to enabled on
     * chromewebstore.google.com via a `domains` patch. The feature early-returns
     * unless this is enabled, so it never runs on unintended sites.
     */
    patchWebstore?: {
        state: 'enabled' | 'disabled';
    };
    /**
     * Ordered fallback list targeting the install/uninstall <button>.
     * The first entry matching at least one element wins.
     */
    installButtonSelectors?: SelectorEntry[];
    /**
     * CSS selectors for Chrome promo banners (e.g. "Switch to Chrome") to hide.
     */
    promoSelectors?: string[];
    /**
     * Replacement button copy. install/remove label the curated pill;
     * unavailable labels the disabled pill on non-curated detail pages, with
     * unavailableDescription as its explanatory tooltip.
     */
    buttonCopy?: {
        install: string;
        remove: string;
        unavailable?: string;
        unavailableDescription?: string;
    };
    /**
     * Max time in ms to wait for the chrome.webstorePrivate API to appear
     * before the feature stays fail-closed (buttons remain hidden).
     */
    apiDetectionTimeoutMs?: number;
}>;

export type ChromeWebstorePatchingFeature<VersionType> = Feature<ChromeWebstorePatchingSettings, VersionType>;
