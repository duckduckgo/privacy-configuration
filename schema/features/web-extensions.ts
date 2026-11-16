import { Feature, SubFeature } from '../feature';

export type WebExtensionsConfig<VersionType> = Feature<
    {},
    VersionType,
    {
        embedded?: SubFeature<VersionType>;
        cpmDiagnosticsRecorder?: SubFeature<VersionType>;
        cpmStableBaseURL?: SubFeature<VersionType>;
    }
>;
