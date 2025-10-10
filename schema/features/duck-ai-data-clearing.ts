import { Feature } from '../feature';

// Type of the feature `settings` object
type SettingsType = {
    chatsLocalStorageKeys: string[];
    chatImagesIndexDbNameObjectStoreNamePairs: string[][];
};

export type DuckAiDataClearingConfig<VersionType> = Feature<SettingsType, VersionType>;
