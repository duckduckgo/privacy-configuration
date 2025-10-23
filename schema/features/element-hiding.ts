import { Feature } from '../feature';

type ElementHidingValue = {
    property: string;
    value: string;
};

type ElementHidingRuleHide = {
    selector: string;
    type: 'hide-empty' | 'hide' | 'closest-empty' | 'override';
    // No values field allowed for hide rules
};

type ElementHidingRuleModify = {
    selector: string;
    type: 'modify-style' | 'modify-attr';
    values: ElementHidingValue[]; // Required for modify rules
};

type ElementHidingRuleWithoutSelector = {
    type: 'disable-default';
};

type ElementHidingRule = ElementHidingRuleHide | ElementHidingRuleModify | ElementHidingRuleWithoutSelector;

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
