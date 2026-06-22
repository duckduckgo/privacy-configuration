import { Feature } from '../feature';

// A placement rule for one header. The shape enforces the fields each position
// needs: 'before'/'after' require `anchor`, matched against header NAMES
// (case-insensitive): `^name$` = exact, `^name` = prefix, otherwise substring.
// This is NOT a regex engine.
type HeaderPlacement = { header: string; position: 'first' | 'last' } | { header: string; position: 'before' | 'after'; anchor: string };

// Placements are applied in declaration order (each repositions one header).
type PreserveHeaderOrderSettings = {
    placements?: HeaderPlacement[];
};

export type PreserveHeaderOrderFeature<VersionType> = Feature<PreserveHeaderOrderSettings, VersionType>;
