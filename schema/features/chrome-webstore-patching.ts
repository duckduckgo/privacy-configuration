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
     * Ordered CSS selectors, resolved relative to the matched button,
     * targeting the inner span that holds the button's text label.
     */
    installButtonTextSelectors?: string[];
    /**
     * CSS selectors for Chrome promo banners (e.g. "Switch to Chrome") to hide.
     */
    promoSelectors?: string[];
    /**
     * Replacement button copy for curated extensions.
     */
    buttonCopy?: {
        install: string;
        remove: string;
    };
    /**
     * Max time in ms to wait for the chrome.webstorePrivate API to appear
     * before the feature stays fail-closed (buttons remain hidden).
     */
    apiDetectionTimeoutMs?: number;
}>;

export type ChromeWebstorePatchingFeature<VersionType> = Feature<ChromeWebstorePatchingSettings, VersionType>;
