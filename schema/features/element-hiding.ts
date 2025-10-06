import { Feature } from '../feature';

// Element hiding rule types as defined in documentation
type ElementHidingRuleType =
    | 'hide-empty' // hide elements that don't don't contain visible content (default)
    | 'hide' // hide elements regardless of contents
    | 'closest-empty' // crawl up DOM tree to hide first ancestor without visible content
    | 'override' // disable global rule on specific domain
    | 'modify-style' // replace CSS style values (domain-specific only)
    | 'modify-attr' // replace attribute values (category-specific only)
    | 'disable-default'; // disable all global rules on domain (domain-specific only)

// Style modification structure for modify-style rules
type StyleValue = {
    property: string; // CSS property name
    value: string; // CSS property value
};

// Attribute modification structure for modify-attr rules
type AttributeValue = {
    attribute: string; // HTML attribute name
    value: string; // HTML attribute value
};

// Base element hiding rule
type BaseElementHidingRule = {
    selector: string;
    type: ElementHidingRuleType;
};

// Rule with style values for modify-style
type StyleRule = BaseElementHidingRule & {
    type: 'modify-style';
    values: StyleValue[];
};

// Rule with attribute values for modify-attr
type AttributeRule = BaseElementHidingRule & {
    type: 'modify-attr';
    values: AttributeValue[];
};

// Disable default rule (no selector needed)
type DisableDefaultRule = {
    type: 'disable-default';
};

// Override rule (no values needed, just disables global rule)
type OverrideRule = BaseElementHidingRule & {
    type: 'override';
};

// Union type for all possible element hiding rules
type ElementHidingRule = BaseElementHidingRule | StyleRule | AttributeRule | DisableDefaultRule | OverrideRule;

// Global rules (rules that apply everywhere)
type GlobalRules = ElementHidingRule[];

// Domain-specific rules with domain targeting (domain can be string or array of strings)
type DomainRules = {
    domain: string | string[];
    rules: ElementHidingRule[];
};

// Element hiding settings structure - focusing only on rule types
// Allow additional properties to accommodate existing configuration with timeouts, etc.
type ElementHidingSettings = {
    rules: GlobalRules;
    domains: DomainRules[];
    // Allow other properties that exist in the JSON but aren't documented as rule types
    // This prevents validation errors while we focus on rule validation
    [key: string]: any;
};

// Element hiding feature type
export type ElementHidingFeature<VersionType> = Feature<ElementHidingSettings, VersionType>;

// Export settings type for external use
export type ElementHidingSettingsType = ElementHidingSettings;
