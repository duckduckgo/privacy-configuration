import { Feature } from '../feature';

type ElementHidingValue = {
    property: string;
    value: string;
};

type ElementHidingRuleWithSelector = {
    selector: string;
    type: 'hide-empty' | 'hide' | 'closest-empty' | 'override' | 'modify-style' | 'modify-attr';
    values?: ElementHidingValue[];
};

type ElementHidingRuleWithoutSelector = {
    type: 'disable-default';
};

type ElementHidingRule = ElementHidingRuleWithSelector | ElementHidingRuleWithoutSelector;

type ElementHidingDomain = {
    domain: string | string[];
    rules: ElementHidingRule[];
};

type StyleTagException = {
    domain: string;
    reason: string;
};

interface ElementHidingConfiguration {
    useStrictHideStyleTag?: boolean;
    rules: ElementHidingRule[];
    domains: ElementHidingDomain[];
    hideTimeouts?: number[];
    unhideTimeouts?: number[];
    mediaAndFormSelectors?: string;
    adLabelStrings?: string[];
    styleTagExceptions?: StyleTagException[];
}

export type ElementHidingFeature<VersionType> = Feature<ElementHidingConfiguration, VersionType>;
