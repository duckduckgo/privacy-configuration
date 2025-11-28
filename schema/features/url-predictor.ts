import { Feature } from '../feature';

type Settings = {
    allowedSchemas: string[];
};

export type UrlPredictorFeature<VersionType> = Feature<Settings, VersionType>;
