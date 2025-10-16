import { Feature } from '../feature';

export type ElementHidingFeature<VersionType> = Feature<
    {
        useStrictHideStyleTag?: boolean;
        rules: Array<{
            selector?: string;
            type: 'hide-empty' | 'hide' | 'closest-empty' | 'override' | 'modify-style' | 'modify-attr' | 'disable-default';
            values?: Array<{
                property: string;
                value: string;
            }>;
        }>;
        domains: Array<{
            domain: string | string[];
            rules: Array<{
                selector?: string;
                type: 'hide-empty' | 'hide' | 'closest-empty' | 'override' | 'modify-style' | 'modify-attr' | 'disable-default';
                values?: Array<{
                    property: string;
                    value: string;
                }>;
            }>;
        }>;
        hideTimeouts?: number[];
        unhideTimeouts?: number[];
        mediaAndFormSelectors?: string;
        adLabelStrings?: string[];
        [key: string]: any;
    },
    VersionType
>;
