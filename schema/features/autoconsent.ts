import { Feature } from '../feature';
import { CompactCMPRuleset } from '@duckduckgo/autoconsent/lib/encoding';

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
        compactRuleList?: CompactCMPRuleset;
    },
    VersionType
>;
