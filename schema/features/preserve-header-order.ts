import { Feature } from '../feature';

type HeaderPlacement = {
    position: 'first' | 'last' | 'index' | 'before' | 'after';
    index?: number;
    anchor?: string;
};

type PreserveHeaderOrderSettings = {
    cookiePlacement?: HeaderPlacement;
    secGpcPlacement?: HeaderPlacement;
};

export type PreserveHeaderOrderFeature<VersionType> = Feature<PreserveHeaderOrderSettings, VersionType>;
