import { Feature, SubFeature } from '../feature';

type FileTypeEntry = {
    extension: string;
    method: string;
    fallback: boolean;
};

type SubFeatures<VersionType> = {
    downloadOpenItemMethod?: SubFeature<
        VersionType,
        {
            fileTypes: FileTypeEntry[];
        }
    >;
};

export type DownloadManager<VersionType> = Feature<
    Record<string, never>,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
