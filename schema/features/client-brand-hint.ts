import { Feature } from '../feature';

type ClientBrandHintDomain = {
    domain: string;
    brand: 'DDG' | 'CHROME' | 'WEBVIEW';
};

type ClientBrandHintSettings = {
    domains: ClientBrandHintDomain[];
};

export type ClientBrandHintFeature<VersionType> = Feature<ClientBrandHintSettings, VersionType>;
