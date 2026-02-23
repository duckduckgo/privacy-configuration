/**
 * Diff two experiment manifests to identify changes.
 *
 * Compares a "base" manifest (e.g., main branch) against a "head" manifest (e.g., PR branch)
 * to detect experiment additions, state changes, and rollout changes.
 *
 * Usage:
 *   node scripts/diff-experiments.mjs <base-manifest.json> <head-manifest.json> [--output <path>]
 *
 * Can also be used as a library:
 *   import { diffManifests } from './diff-experiments.mjs';
 */

import fs from 'fs';

/**
 * @typedef {'added'|'removed'|'state_changed'|'rollout_increased'|'rollout_decreased'|'cohorts_changed'} ChangeType
 */

/**
 * @typedef {Object} ExperimentChange
 * @property {string} platform
 * @property {'nativeExperiment'|'contentScopeExperiment'} type
 * @property {string} name
 * @property {ChangeType} changeType
 * @property {object} [before] - Previous state (for changes/removals)
 * @property {object} [after] - New state (for additions/changes)
 */

/**
 * @typedef {Object} DiffResult
 * @property {string} diffedAt - ISO timestamp
 * @property {ExperimentChange[]} changes
 * @property {{ added: number, removed: number, modified: number }} summary
 */

/**
 * Build a lookup map from experiment entries.
 * @param {Array<{ name: string, state: string, rolloutPercent: number|null, cohorts: string[] }>} entries
 * @returns {Map<string, object>}
 */
function buildLookup(entries) {
    const map = new Map();
    for (const entry of entries) {
        map.set(entry.name, entry);
    }
    return map;
}

/**
 * Diff experiment entries of a specific type for a single platform.
 * @param {string} platform
 * @param {'nativeExperiment'|'contentScopeExperiment'} type
 * @param {Array} baseEntries
 * @param {Array} headEntries
 * @returns {ExperimentChange[]}
 */
function diffEntries(platform, type, baseEntries, headEntries) {
    const changes = [];
    const baseLookup = buildLookup(baseEntries);
    const headLookup = buildLookup(headEntries);

    // Check for additions and modifications
    for (const [name, headEntry] of headLookup) {
        const baseEntry = baseLookup.get(name);

        if (!baseEntry) {
            changes.push({
                platform,
                type,
                name,
                changeType: 'added',
                after: headEntry,
            });
            continue;
        }

        // Check state changes
        if (baseEntry.state !== headEntry.state) {
            changes.push({
                platform,
                type,
                name,
                changeType: 'state_changed',
                before: baseEntry,
                after: headEntry,
            });
        }

        // Check rollout changes
        if (baseEntry.rolloutPercent !== headEntry.rolloutPercent) {
            const increased = (headEntry.rolloutPercent ?? 0) > (baseEntry.rolloutPercent ?? 0);
            changes.push({
                platform,
                type,
                name,
                changeType: increased ? 'rollout_increased' : 'rollout_decreased',
                before: baseEntry,
                after: headEntry,
            });
        }

        // Check cohort changes
        const baseCohorts = JSON.stringify([...(baseEntry.cohorts || [])].sort());
        const headCohorts = JSON.stringify([...(headEntry.cohorts || [])].sort());
        if (baseCohorts !== headCohorts) {
            changes.push({
                platform,
                type,
                name,
                changeType: 'cohorts_changed',
                before: baseEntry,
                after: headEntry,
            });
        }
    }

    // Check for removals
    for (const [name, baseEntry] of baseLookup) {
        if (!headLookup.has(name)) {
            changes.push({
                platform,
                type,
                name,
                changeType: 'removed',
                before: baseEntry,
            });
        }
    }

    return changes;
}

/**
 * Diff two experiment manifests.
 * @param {import('./extract-experiments.mjs').ExperimentManifest} baseManifest
 * @param {import('./extract-experiments.mjs').ExperimentManifest} headManifest
 * @returns {DiffResult}
 */
export function diffManifests(baseManifest, headManifest) {
    const allChanges = [];

    // Get all platforms from both manifests
    const allPlatforms = new Set([...Object.keys(baseManifest.platforms || {}), ...Object.keys(headManifest.platforms || {})]);

    for (const platform of allPlatforms) {
        const basePlatform = baseManifest.platforms?.[platform] || { nativeExperiments: [], contentScopeExperiments: [] };
        const headPlatform = headManifest.platforms?.[platform] || { nativeExperiments: [], contentScopeExperiments: [] };

        allChanges.push(
            ...diffEntries(platform, 'nativeExperiment', basePlatform.nativeExperiments, headPlatform.nativeExperiments),
        );
        allChanges.push(
            ...diffEntries(
                platform,
                'contentScopeExperiment',
                basePlatform.contentScopeExperiments,
                headPlatform.contentScopeExperiments,
            ),
        );
    }

    const summary = {
        added: allChanges.filter((c) => c.changeType === 'added').length,
        removed: allChanges.filter((c) => c.changeType === 'removed').length,
        modified: allChanges.filter((c) => !['added', 'removed'].includes(c.changeType)).length,
    };

    return {
        diffedAt: new Date().toISOString(),
        changes: allChanges,
        summary,
    };
}

/**
 * Identify changes that require pixel validation attention.
 * These are changes that could introduce new undocumented pixels.
 * @param {DiffResult} diff
 * @returns {ExperimentChange[]}
 */
export function getPixelRelevantChanges(diff) {
    return diff.changes.filter((change) => {
        // New experiments always need pixel definitions
        if (change.changeType === 'added') return true;

        // State changed to enabled — pixels will start firing
        if (change.changeType === 'state_changed' && change.after?.state === 'enabled') return true;

        // Rollout increased — more pixel volume, worth checking
        if (change.changeType === 'rollout_increased') return true;

        // Cohorts changed — may need new experiment pixel definitions
        if (change.changeType === 'cohorts_changed') return true;

        return false;
    });
}

// CLI entrypoint
if (process.argv[1]?.endsWith('diff-experiments.mjs')) {
    const args = process.argv.slice(2);

    if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
        console.log('Usage: node scripts/diff-experiments.mjs <base-manifest.json> <head-manifest.json> [--output <path>]');
        process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
    }

    const basePath = args[0];
    const headPath = args[1];
    const outputIdx = args.indexOf('--output');
    const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : null;

    try {
        const baseManifest = JSON.parse(fs.readFileSync(basePath, 'utf8'));
        const headManifest = JSON.parse(fs.readFileSync(headPath, 'utf8'));

        const diff = diffManifests(baseManifest, headManifest);
        const json = JSON.stringify(diff, null, 2);

        if (outputPath) {
            fs.writeFileSync(outputPath, json);
            console.log(`Diff written to ${outputPath}`);
        } else {
            console.log(json);
        }

        // Print summary to stderr
        console.error(`\nDiff summary: ${diff.summary.added} added, ${diff.summary.removed} removed, ${diff.summary.modified} modified`);

        const pixelRelevant = getPixelRelevantChanges(diff);
        if (pixelRelevant.length > 0) {
            console.error(`\n⚠️  ${pixelRelevant.length} change(s) require pixel validation:`);
            for (const change of pixelRelevant) {
                console.error(`  ${change.platform}/${change.type}: ${change.name} (${change.changeType})`);
            }
        }
    } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }
}
