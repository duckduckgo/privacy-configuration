import { Feature } from '../feature';

// A placement rule for one header. The shape enforces the fields each position
// needs: 'before'/'after' require `anchor`, matched against header NAMES
// (case-insensitive): `^name$` = exact, `^name` = prefix, otherwise substring.
// This is NOT a regex engine.
type HeaderPlacement = { header: string; position: 'first' | 'last' } | { header: string; position: 'before' | 'after'; anchor: string };

// A per-site override keyed by eTLD+1 (e.g. "example.com"). An empty `placements`
// array means "no reordering for this domain" (natural order) — distinct from
// omitting the domain, which falls back to the default `placements`.
type DomainOverride = { domain: string; placements: HeaderPlacement[] };

// `placements` is the default rule set, applied in declaration order (each
// repositions one header). `domainOverrides` lets specific eTLD+1s use a different
// rule set (or opt out of reordering via an empty list).
type PreserveHeaderOrderSettings = {
    placements?: HeaderPlacement[];
    domainOverrides?: DomainOverride[];
};

export type PreserveHeaderOrderFeature<VersionType> = Feature<PreserveHeaderOrderSettings, VersionType>;
