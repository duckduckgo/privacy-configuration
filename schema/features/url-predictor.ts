import { Feature } from '../feature';

type Settings = {
    allowedSchemes: string[];
};

export type UrlPredictorFeature<VersionType> = Feature<Settings, VersionType>;
