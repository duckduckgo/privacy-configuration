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
     * Selectors targeting the install/uninstall <button>. Every entry applies
     * together: each gets its own hide rule and the matches are unioned, so a
     * too-broad selector hides extra buttons wherever it sits in the list.
     *
     * Only `css` entries are consumed today. `xpath` is accepted by the schema
     * so it can be added without a schema change, but it is not implemented:
     * xpath entries are dropped at runtime. The hide has to be a stylesheet
     * rule to cover buttons the store has not rendered yet, and xpath cannot
     * appear in a stylesheet, so it needs a separate JS-driven hide path first.
     */
    installButtonSelectors?: SelectorEntry[];
    /**
     * CSS selectors for Chrome promo banners (e.g. "Switch to Chrome") to hide.
     * Plain strings, not SelectorEntry: promo hiding is CSS-only (the selectors
     * go straight into the injected stylesheet, which is what hides the banner
     * before it paints), so xpath is not representable here by design.
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
