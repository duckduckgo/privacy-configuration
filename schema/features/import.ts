import { Feature, SubFeature } from '../feature';

type SettingsType = Record<string, never>;

type SubFeatures<VersionType> = {
    browserMultiStepImport?: SubFeature<
        VersionType,
        {
            chrome: 'enabled' | 'disabled';
            brave: 'enabled' | 'disabled';
            edge: 'enabled' | 'disabled';
            vivaldi: 'enabled' | 'disabled';
        }
    >;
    improvedErrorPixels?: SubFeature<VersionType, SettingsType>;
};

export type ImportFeature<VersionType> = Feature<
    SettingsType,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
