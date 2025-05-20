import { Feature } from '../feature';

export type AutoconsentFeature<VersionType> = Feature<
    {
        disabledCMPs: string[] | undefined;
        filterlistExceptions: string[];
        enableIfMainWorldIsSupported:
            | {
                  state: 'enabled' | 'disabled';
                  minSupportedVersion: VersionType;
              }
            | undefined;
        compactRuleList?: {
            v: number;
            s: string[];
            r: any[];
        };
    },
    VersionType
>;
