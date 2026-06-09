import { Feature, SubFeature } from '../feature';

type SubFeatures<VersionType> = {
    reportMsixLogs?: SubFeature<
        VersionType,
        {
            ErrorCodes?: number[];
            AllowList?: string[];
            DenyList?: string[];
            LogLevelExceptions?: number[];
            DeploymentLogsCount?: number;
            OtherLogsCount?: number;
        }
    >;
    sendIncidentCrashReports?: SubFeature<
        VersionType,
        {
            ExceptionTypes?: string[];
            Redaction?: {
                IncludePackageLogs?: boolean;
                IncludeSha256Hashes?: boolean;
                IncludeLaunchFlags?: boolean;
                UseStrictSqliteErrorPattern?: boolean;
                IncludeStackTraces?: boolean;
                IncludeRenderFailureProbe?: boolean;
                IncludeZombieBeacon?: boolean;
            };
        }
    >;
};

export type ExtendedCrashReporting<VersionType> = Feature<
    Record<string, never>,
    VersionType,
    SubFeatures<VersionType> & Record<string, SubFeature<VersionType>>
>;
