import { Feature } from '../feature';

type ElementHidingRuleType = 'hide-empty' | 'hide' | 'closest-empty' | 'override' | 'modify-style' | 'modify-attr' | 'disable-default';

type StyleValue = {
    property: string;
    value: string;
};

type AttributeValue = {
    attribute: string;
    value: string;
};

type BaseElementHidingRule = {
    selector: string;
    type: ElementHidingRuleType;
};

type StyleRule = BaseElementHidingRule & {
    type: 'modify-style';
    values: StyleValue[];
};

type AttributeRule = BaseElementHidingRule & {
    type: 'modify-attr';
    values: AttributeValue[];
};

type DisableDefaultRule = {
    type: 'disable-default';
};

type OverrideRule = BaseElementHidingRule & {
    type: 'override';
};

type ElementHidingRule = BaseElementHidingRule | StyleRule | AttributeRule | DisableDefaultRule | OverrideRule;

type GlobalRules = ElementHidingRule[];

type DomainRules = {
    domain: string | string[];
    rules: ElementHidingRule[];
};

type ElementHidingSettings = {
    rules: GlobalRules;
    domains: DomainRules[];
    [key: string]: any;
};

export type ElementHidingFeature<VersionType> = Feature<ElementHidingSettings, VersionType>;

export type ElementHidingSettingsType = ElementHidingSettings;
