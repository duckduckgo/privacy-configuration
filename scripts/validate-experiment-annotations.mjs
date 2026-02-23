/**
 * Validate experiment annotations against the privacy config.
 *
 * For each platform, this script:
 * 1. Extracts enabled contentScopeExperiments from override files
 * 2. Reads the annotation file from experiment-annotations/
 * 3. Analyzes feature impact from conditionalChanges in override files
 * 4. Checks every enabled experiment has an annotation with required fields
 * 5. Checks for orphan annotations (experiment removed/disabled but annotation remains)
 *
 * Usage:
 *   node scripts/validate-experiment-annotations.mjs [--output <path>] [--require-privacy-review]
 */

import fs from 'fs';
import path from 'path';
import Ajv from 'ajv/dist/2020.js';
import { fileURLToPath } from 'url';
import { extractFromOverrides } from './extract-experiments.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ANNOTATIONS_DIR = path.join(ROOT, 'experiment-annotations');
const OVERRIDES_DIR = path.join(ROOT, 'overrides');
const SCHEMA_PATH = path.join(ROOT, 'schema', 'experiment-annotations.schema.json');

/**
 * @typedef {Object} ValidationIssue
 * @property {'error'|'warning'} severity
 * @property {string} platform
 * @property {string} experiment
 * @property {string} issue - category key
 * @property {string} detail
 */

/**
 * @typedef {Object} FeatureImpact
 * @property {string} platform
 * @property {string} experiment
 * @property {string[]} affectedFeatures
 * @property {string[]} patchPaths
 */

/**
 * @typedef {Object} ValidationResult
 * @property {string} validatedAt
 * @property {ValidationIssue[]} errors
 * @property {ValidationIssue[]} warnings
 * @property {FeatureImpact[]} impacts
 * @property {{ errors: number, warnings: number }} summary
 */

/**
 * Extract experiment-driven conditionalChanges from an override config.
 * Identifies which features each contentScopeExperiment modifies.
 *
 * @param {object} overrideConfig - The override JSON (has .features)
 * @returns {Map<string, { features: Set<string>, paths: Set<string> }>}
 */
function extractExperimentImpacts(overrideConfig) {
    const impacts = new Map();
    const features = overrideConfig.features || {};

    for (const [featureName, featureDef] of Object.entries(features)) {
        const conditionalChanges = featureDef?.settings?.conditionalChanges;
        if (!Array.isArray(conditionalChanges)) continue;

        for (const change of conditionalChanges) {
            const condition = change.condition;
            if (!condition) continue;

            const conditions = Array.isArray(condition) ? condition : [condition];
            for (const cond of conditions) {
                if (!cond.experiment) continue;

                const expName = cond.experiment.experimentName;
                if (!impacts.has(expName)) {
                    impacts.set(expName, { features: new Set(), paths: new Set() });
                }
                const impact = impacts.get(expName);
                impact.features.add(featureName);

                for (const patch of change.patchSettings || []) {
                    impact.paths.add(`${featureName}${patch.path}`);
                }
            }
        }
    }

    return impacts;
}

/**
 * Read and validate an annotation file for a platform.
 * @param {string} platform
 * @returns {{ annotations: object|null, schemaErrors: string[] }}
 */
function readAnnotations(platform) {
    const filePath = path.join(ANNOTATIONS_DIR, `${platform}.json`);
    if (!fs.existsSync(filePath)) {
        return { annotations: null, schemaErrors: [] };
    }

    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Validate against schema
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    // eslint-disable-next-line new-cap
    const ajv = new Ajv.default({ allErrors: true });
    const validate = ajv.compile(schema);
    validate(content);

    const schemaErrors = (validate.errors || []).map(
        (e) => `${e.instancePath}: ${e.message}`,
    );

    return { annotations: content, schemaErrors };
}

const PLATFORM_OVERRIDE_MAP = {
    android: 'android-override.json',
    ios: 'ios-override.json',
    macos: 'macos-override.json',
    windows: 'windows-override.json',
    extension: 'extension-override.json',
};

/**
 * Run full validation of experiment annotations against the config.
 * @param {object} options
 * @param {boolean} [options.requirePrivacyReview=false]
 * @returns {ValidationResult}
 */
export function validateAnnotations(options = {}) {
    const { requirePrivacyReview = false } = options;
    const manifest = extractFromOverrides();

    const errors = [];
    const warnings = [];
    const impacts = [];

    for (const [platform, experiments] of Object.entries(manifest.platforms)) {
        const cssExperiments = experiments.contentScopeExperiments || [];
        if (cssExperiments.length === 0 && !fs.existsSync(path.join(ANNOTATIONS_DIR, `${platform}.json`))) {
            continue;
        }

        // Read annotations
        const { annotations, schemaErrors } = readAnnotations(platform);

        if (schemaErrors.length > 0) {
            for (const err of schemaErrors) {
                errors.push({
                    severity: 'error',
                    platform,
                    experiment: '*',
                    issue: 'schema_error',
                    detail: `Annotation schema error: ${err}`,
                });
            }
        }

        if (!annotations) {
            if (cssExperiments.length > 0) {
                errors.push({
                    severity: 'error',
                    platform,
                    experiment: '*',
                    issue: 'missing_annotation_file',
                    detail: `No annotation file at experiment-annotations/${platform}.json but ${cssExperiments.length} experiment(s) configured`,
                });
            }
            continue;
        }

        const annotatedExperiments = annotations.contentScopeExperiments || {};

        // Read override for impact analysis
        const overridePath = path.join(OVERRIDES_DIR, PLATFORM_OVERRIDE_MAP[platform]);
        let impactMap = new Map();
        if (fs.existsSync(overridePath)) {
            const overrideConfig = JSON.parse(fs.readFileSync(overridePath, 'utf8'));
            impactMap = extractExperimentImpacts(overrideConfig);
        }

        // Check enabled experiments have annotations
        for (const exp of cssExperiments) {
            if (exp.state !== 'enabled') continue;

            const annotation = annotatedExperiments[exp.name];
            if (!annotation) {
                errors.push({
                    severity: 'error',
                    platform,
                    experiment: exp.name,
                    issue: 'missing_annotation',
                    detail: `Enabled experiment "${exp.name}" has no annotation. Add it to experiment-annotations/${platform}.json`,
                });
                continue;
            }

            // Check required fields
            if (!annotation.description) {
                errors.push({
                    severity: 'error',
                    platform,
                    experiment: exp.name,
                    issue: 'missing_description',
                    detail: 'Annotation is missing a description',
                });
            }

            if (!annotation.owners || annotation.owners.length === 0) {
                warnings.push({
                    severity: 'warning',
                    platform,
                    experiment: exp.name,
                    issue: 'missing_owners',
                    detail: 'Annotation has no owners — add GitHub usernames',
                });
            }

            if (requirePrivacyReview && !annotation.privacyReview) {
                errors.push({
                    severity: 'error',
                    platform,
                    experiment: exp.name,
                    issue: 'missing_privacy_review',
                    detail: 'Enabled experiment requires a privacyReview link',
                });
            } else if (!annotation.privacyReview) {
                warnings.push({
                    severity: 'warning',
                    platform,
                    experiment: exp.name,
                    issue: 'missing_privacy_review',
                    detail: 'Consider adding a privacyReview link for audit tracking',
                });
            }

            // Record impact
            const impact = impactMap.get(exp.name);
            if (impact) {
                impacts.push({
                    platform,
                    experiment: exp.name,
                    affectedFeatures: [...impact.features],
                    patchPaths: [...impact.paths],
                });
            }
        }

        // Check for orphan annotations
        const configExperimentNames = new Set(cssExperiments.map((e) => e.name));
        for (const annotatedName of Object.keys(annotatedExperiments)) {
            if (!configExperimentNames.has(annotatedName)) {
                warnings.push({
                    severity: 'warning',
                    platform,
                    experiment: annotatedName,
                    issue: 'orphan_annotation',
                    detail: `Annotation exists but experiment "${annotatedName}" not found in ${platform} config. Remove if no longer needed.`,
                });
            }
        }
    }

    return {
        validatedAt: new Date().toISOString(),
        errors,
        warnings,
        impacts,
        summary: {
            errors: errors.length,
            warnings: warnings.length,
        },
    };
}

/**
 * Format validation results as a human-readable report.
 * @param {ValidationResult} result
 * @returns {string}
 */
export function formatValidationReport(result) {
    const lines = [];
    lines.push('# ContentScope Experiment Annotation Validation');
    lines.push(`Validated at: ${result.validatedAt}`);
    lines.push(`Errors: ${result.summary.errors}, Warnings: ${result.summary.warnings}\n`);

    if (result.errors.length === 0 && result.warnings.length === 0) {
        lines.push('✅ All experiment annotations are valid.\n');
    }

    if (result.errors.length > 0) {
        lines.push('## Errors');
        for (const e of result.errors) {
            lines.push(`  ❌ [${e.platform}] ${e.experiment}: ${e.detail}`);
        }
        lines.push('');
    }

    if (result.warnings.length > 0) {
        lines.push('## Warnings');
        for (const w of result.warnings) {
            lines.push(`  ⚠️  [${w.platform}] ${w.experiment}: ${w.detail}`);
        }
        lines.push('');
    }

    if (result.impacts.length > 0) {
        lines.push('## Feature Impact');
        for (const impact of result.impacts) {
            lines.push(`  ${impact.platform}/${impact.experiment}:`);
            lines.push(`    Affected features: ${impact.affectedFeatures.join(', ')}`);
            lines.push(`    Patch paths: ${impact.patchPaths.join(', ')}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

// CLI entrypoint
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node scripts/validate-experiment-annotations.mjs [--output <path>] [--require-privacy-review]');
    process.exit(0);
}

const requirePrivacyReview = args.includes('--require-privacy-review');
const outputIdx = args.indexOf('--output');
const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : null;

const result = validateAnnotations({ requirePrivacyReview });

if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.error(`Results written to ${outputPath}`);
}

console.log(formatValidationReport(result));

if (result.summary.errors > 0) {
    process.exit(1);
}
