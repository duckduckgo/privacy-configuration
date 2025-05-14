import { Feature, SubFeature } from '../feature';

// Type of the feature `settings` object
type SettingsType = undefined;

// Any subfeatures that have typed `settings` should be defined here.
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
};

export type ImportFeature<VersionType> = Feature<
    SettingsType,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
