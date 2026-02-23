/**
 * Extract all experiments from remote-config override files.
 *
 * This script reads the platform override files and extracts:
 * - Native experiments (experimentTest.features) — fire experiment.enroll.* / experiment.metrics.* pixels
 * - ContentScope experiments (contentScopeExperiments.features) — patch feature settings via conditionalChanges
 *
 * Usage:
 *   node scripts/extract-experiments.mjs [--output <path>] [--generated]
 *
 * Options:
 *   --output <path>   Write manifest to file instead of stdout
 *   --generated       Read from generated/v5/*.json instead of overrides/ (requires prior `npm run build`)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const OVERRIDE_DIR = path.join(ROOT, 'overrides');
const GENERATED_DIR = path.join(ROOT, 'generated', 'v5');

/**
 * Platform definitions mapping platform keys to their override and generated config files.
 */
const PLATFORMS = {
    android: {
        overrideFile: 'android-override.json',
        generatedFile: 'android-config.json',
        hasNativeExperiments: true,
    },
    ios: {
        overrideFile: 'ios-override.json',
        generatedFile: 'ios-config.json',
        hasNativeExperiments: false,
    },
    macos: {
        overrideFile: 'macos-override.json',
        generatedFile: 'macos-config.json',
        hasNativeExperiments: false,
    },
    windows: {
        overrideFile: 'windows-override.json',
        generatedFile: 'windows-config.json',
        hasNativeExperiments: true,
    },
    extension: {
        overrideFile: 'extension-override.json',
        generatedFile: 'extension-config.json',
        hasNativeExperiments: false,
    },
};

/**
 * @typedef {Object} ExperimentEntry
 * @property {string} name - Experiment name (key in the features object)
 * @property {'enabled'|'disabled'|'internal'} state - Current state
 * @property {number|null} rolloutPercent - Maximum rollout percentage, or null if no rollout
 * @property {string[]} cohorts - List of cohort names
 * @property {string|undefined} minSupportedVersion - Minimum supported version if set
 */

/**
 * @typedef {Object} PlatformExperiments
 * @property {ExperimentEntry[]} nativeExperiments - Experiments from experimentTest feature
 * @property {ExperimentEntry[]} contentScopeExperiments - Experiments from contentScopeExperiments feature
 */

/**
 * @typedef {Object} ExperimentManifest
 * @property {string} extractedAt - ISO timestamp of extraction
 * @property {string} source - 'overrides' or 'generated'
 * @property {Record<string, PlatformExperiments>} platforms
 */

/**
 * Extract experiment details from a feature sub-features object.
 * @param {Record<string, any>} features - The sub-features object
 * @returns {ExperimentEntry[]}
 */
function extractExperimentEntries(features) {
    if (!features || typeof features !== 'object') return [];

    return Object.entries(features).map(([name, def]) => {
        const entry = {
            name,
            state: def.state || 'unknown',
            rolloutPercent: null,
            cohorts: [],
        };

        // Extract max rollout percent
        if (def.rollout?.steps?.length > 0) {
            entry.rolloutPercent = Math.max(...def.rollout.steps.map((s) => s.percent));
        }

        // Extract cohort names
        if (Array.isArray(def.cohorts)) {
            entry.cohorts = def.cohorts.map((c) => c.name);
        }

        if (def.minSupportedVersion !== undefined) {
            entry.minSupportedVersion = String(def.minSupportedVersion);
        }

        return entry;
    });
}

/**
 * Extract experiments from a single config object (either override or generated).
 * @param {object} config - The config object with a `features` property
 * @param {boolean} hasNativeExperiments - Whether this platform uses native experiments
 * @returns {PlatformExperiments}
 */
function extractFromConfig(config, hasNativeExperiments) {
    const features = config.features || {};

    const result = {
        nativeExperiments: [],
        contentScopeExperiments: [],
    };

    // Native experiments (experimentTest)
    if (hasNativeExperiments && features.experimentTest?.features) {
        result.nativeExperiments = extractExperimentEntries(features.experimentTest.features);
    }

    // ContentScope experiments
    if (features.contentScopeExperiments?.features) {
        result.contentScopeExperiments = extractExperimentEntries(features.contentScopeExperiments.features);
    }

    return result;
}

/**
 * Extract experiments from override files (no build required).
 * @returns {ExperimentManifest}
 */
export function extractFromOverrides() {
    const manifest = {
        extractedAt: new Date().toISOString(),
        source: 'overrides',
        platforms: {},
    };

    for (const [platform, def] of Object.entries(PLATFORMS)) {
        const overridePath = path.join(OVERRIDE_DIR, def.overrideFile);
        if (!fs.existsSync(overridePath)) {
            console.warn(`Override file not found: ${overridePath}`);
            continue;
        }
        const config = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
        manifest.platforms[platform] = extractFromConfig(config, def.hasNativeExperiments);
    }

    return manifest;
}

/**
 * Extract experiments from generated config files (requires prior `npm run build`).
 * @returns {ExperimentManifest}
 */
export function extractFromGenerated() {
    if (!fs.existsSync(GENERATED_DIR)) {
        throw new Error(`Generated directory not found: ${GENERATED_DIR}. Run 'npm run build' first.`);
    }

    const manifest = {
        extractedAt: new Date().toISOString(),
        source: 'generated',
        platforms: {},
    };

    for (const [platform, def] of Object.entries(PLATFORMS)) {
        const configPath = path.join(GENERATED_DIR, def.generatedFile);
        if (!fs.existsSync(configPath)) {
            console.warn(`Generated config not found: ${configPath}`);
            continue;
        }
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        manifest.platforms[platform] = extractFromConfig(config, def.hasNativeExperiments);
    }

    return manifest;
}

/**
 * Get a flat summary of all enabled experiments across all platforms.
 * @param {ExperimentManifest} manifest
 * @returns {{ platform: string, type: string, name: string, state: string, rolloutPercent: number|null, cohorts: string[] }[]}
 */
export function getEnabledExperimentsSummary(manifest) {
    const results = [];
    for (const [platform, experiments] of Object.entries(manifest.platforms)) {
        for (const exp of experiments.nativeExperiments) {
            if (exp.state === 'enabled') {
                results.push({ platform, type: 'nativeExperiment', ...exp });
            }
        }
        for (const exp of experiments.contentScopeExperiments) {
            if (exp.state === 'enabled') {
                results.push({ platform, type: 'contentScopeExperiment', ...exp });
            }
        }
    }
    return results;
}

// CLI entrypoint
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node scripts/extract-experiments.mjs [--output <path>] [--generated]`);
    console.log(`  --output <path>   Write manifest to file instead of stdout`);
    console.log(`  --generated       Read from generated/v5/*.json instead of overrides/`);
    process.exit(0);
}

const useGenerated = args.includes('--generated');
const outputIdx = args.indexOf('--output');
const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : null;

try {
    const manifest = useGenerated ? extractFromGenerated() : extractFromOverrides();

    const json = JSON.stringify(manifest, null, 2);

    if (outputPath) {
        fs.writeFileSync(outputPath, json);
        console.log(`Experiment manifest written to ${outputPath}`);
    } else {
        console.log(json);
    }

    // Print summary to stderr
    const enabled = getEnabledExperimentsSummary(manifest);
    console.error(`\nSummary: ${enabled.length} enabled experiments across ${Object.keys(manifest.platforms).length} platforms`);
    for (const exp of enabled) {
        console.error(`  ${exp.platform}/${exp.type}: ${exp.name} (rollout: ${exp.rolloutPercent ?? 'N/A'}%, cohorts: ${exp.cohorts.join(', ')})`);
    }
} catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
}
