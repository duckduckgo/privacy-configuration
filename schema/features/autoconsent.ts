import { Feature, FeatureState } from '../feature';

export type AutoconsentFeature<VersionType> = Feature<
    {
        disabledCMPs: string[] | undefined;
        filterlistExceptions: string[];
        enableIfMainWorldIsSupported:
            | {
                  state: FeatureState;
                  minSupportedVersion: VersionType;
              }
            | undefined;
        compactRuleList?: {
            v: number;
            s: string[];
            r: any[];
            index?: {
                genericRuleRange: [number, number];
                frameRuleRange: [number, number];
                specificRuleRange: [number, number];
                genericStringEnd: number;
                frameStringEnd: number;
            };
        };
    },
    VersionType
>;
