import { Feature } from '../feature';

// A placement rule for one header. The shape enforces the fields each position
// needs: 'index' requires `index`; 'before'/'after' require `anchor` (a regex
// matched against header NAMES — the native layer splits position/anchor on the
// first ':', so a ':' inside the regex, e.g. a non-capturing group, is preserved).
type HeaderPlacement =
    | { header: string; position: 'first' | 'last' }
    | { header: string; position: 'index'; index: number }
    | { header: string; position: 'before' | 'after'; anchor: string };

// Placements are applied in declaration order (each repositions one header).
type PreserveHeaderOrderSettings = {
    placements?: HeaderPlacement[];
};

export type PreserveHeaderOrderFeature<VersionType> = Feature<PreserveHeaderOrderSettings, VersionType>;
