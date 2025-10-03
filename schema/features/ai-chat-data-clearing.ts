import { Feature } from '../feature';

// Type of the feature `settings` object
type SettingsType = {
    chatsLocalStorageKeys: string[];
    chatImagesIndexDbNameObjectStoreNamePairs: string[][];
};

export type AiChatDataClearingConfig<VersionType> = Feature<
    SettingsType,
    VersionType
>;
