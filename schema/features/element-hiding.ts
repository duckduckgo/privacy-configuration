import { Operation } from '../json-patch';
import { ConditionBlock, ConditionBlockOrArray, Feature } from '../feature';

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

// Every block names a domain: a condition without one matches every site.
type DomainConditionBlock = ConditionBlock & { domain: string };

type DomainCondition = DomainConditionBlock | DomainConditionBlock[];

// When present, `condition` replaces `domain` for matching.
type ElementHidingDomain =
    | {
          domain: string | string[];
          condition?: DomainCondition;
          rules: ElementHidingRule[];
      }
    | {
          condition: DomainCondition;
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
    conditionalChanges?: {
        condition: ConditionBlockOrArray;
        patchSettings: Operation<number[]>[];
    }[];
}

export type ElementHidingFeature<VersionType> = Feature<ElementHidingConfiguration, VersionType>;
