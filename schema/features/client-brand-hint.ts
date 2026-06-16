import { Feature } from '../feature';

type ClientBrandHintDomain = {
    domain: string;
    // 'Google Chrome' is a temporary Windows-only literal: older Windows clients have no
    // CHROME -> 'Google Chrome' mapping and would emit 'CHROME' verbatim. Remove once they age out.
    brand: 'DDG' | 'CHROME' | 'WEBVIEW' | 'Google Chrome';
};

type ClientBrandHintSettings = {
    domains: ClientBrandHintDomain[];
};

export type ClientBrandHintFeature<VersionType> = Feature<ClientBrandHintSettings, VersionType>;
