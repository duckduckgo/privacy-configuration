import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import platforms from '../platforms.js';

const OVERRIDE_DIR = './overrides';
const FEATURES_DIR = './features';
const GENERATED_DIR = './generated';

/**
 * Helper to load JSON file
 */
function loadJSON(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Recursively find all feature objects with rollout configurations
 */
function findRolloutConfigs(obj, path = '') {
    const results = [];
    if (!obj || typeof obj !== 'object') return results;

    if (obj.rollout?.steps) {
        results.push({ path, rollout: obj.rollout });
    }

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null) {
            results.push(...findRolloutConfigs(value, path ? `${path}.${key}` : key));
        }
    }
    return results;
}

/**
 * Recursively find all CSS selectors in element hiding config
 */
function findSelectors(obj, path = '') {
    const results = [];
    if (!obj || typeof obj !== 'object') return results;

    if (obj.selector) {
        results.push({ path, selector: obj.selector });
    }

    for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                results.push(...findSelectors(item, `${path}[${index}]`));
            });
        } else if (typeof value === 'object' && value !== null) {
            results.push(...findSelectors(value, path ? `${path}.${key}` : key));
        }
    }
    return results;
}

/**
 * Check for contradictory CSS selectors like input[checked]:not(:checked)
 */
function isContradictorySelector(selector) {
    // Pattern: attribute selector followed by :not() with the same pseudo-class
    const contradictions = [
        { attr: /\[checked\]/i, notPseudo: /:not\(:checked\)/i },
        { attr: /\[disabled\]/i, notPseudo: /:not\(:disabled\)/i },
        { attr: /\[selected\]/i, notPseudo: /:not\(:selected\)/i },
        { attr: /\[readonly\]/i, notPseudo: /:not\(:read-only\)/i },
    ];

    for (const { attr, notPseudo } of contradictions) {
        if (attr.test(selector) && notPseudo.test(selector)) {
            return true;
        }
    }
    return false;
}

/**
 * Find all domain entries in exceptions
 */
function findExceptionDomains(obj, path = '') {
    const results = [];
    if (!obj || typeof obj !== 'object') return results;

    if (obj.domain !== undefined && typeof obj.domain === 'string') {
        results.push({ path, domain: obj.domain });
    }

    for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                results.push(...findExceptionDomains(item, `${path}.${key}[${index}]`));
            });
        } else if (typeof value === 'object' && value !== null) {
            results.push(...findExceptionDomains(value, path ? `${path}.${key}` : key));
        }
    }
    return results;
}


/**
 * Find disable-default rules without accompanying replacement rules
 */
function findOrphanedDisableDefault(domains) {
    const results = [];
    if (!Array.isArray(domains)) return results;

    for (const domainConfig of domains) {
        if (!domainConfig.rules || !Array.isArray(domainConfig.rules)) continue;

        const hasDisableDefault = domainConfig.rules.some(r => r.type === 'disable-default');
        const hasReplacementRules = domainConfig.rules.some(r =>
            r.type && r.type !== 'disable-default' && r.selector
        );

        if (hasDisableDefault && !hasReplacementRules) {
            results.push({
                domain: domainConfig.domain,
                message: 'disable-default without accompanying replacement rules'
            });
        }
    }
    return results;
}

/**
 * Check for invalid regex patterns (using * instead of .*)
 */
function hasInvalidWildcard(pattern) {
    // Match standalone * that's not preceded by . (which would make it .*)
    // This catches patterns like "example.com/*/path" instead of "example.com/.*/path"
    // But allows patterns like "example.*" or ".*pattern"
    const invalidPattern = /(?<!\.)(?<!\[)\*(?!\])/;
    return invalidPattern.test(pattern) && !pattern.includes('.*');
}

/**
 * Find all tracker allowlist rules
 */
function findAllowlistRules(allowlistedTrackers) {
    const results = [];
    if (!allowlistedTrackers || typeof allowlistedTrackers !== 'object') return results;

    for (const [domain, config] of Object.entries(allowlistedTrackers)) {
        if (config.rules && Array.isArray(config.rules)) {
            config.rules.forEach((rule, index) => {
                results.push({
                    baseDomain: domain,
                    rule: rule.rule,
                    index,
                    domains: rule.domains
                });
            });
        }
    }
    return results;
}

describe('Code Review Validation Tests', () => {
    describe('Rollout Configuration Validation', () => {
        const overrideFiles = [
            ...platforms.map(p => `${OVERRIDE_DIR}/${p}-override.json`),
        ];

        for (const overrideFile of overrideFiles) {
            if (!fs.existsSync(overrideFile)) continue;

            describe(`${path.basename(overrideFile)}`, () => {
                const config = loadJSON(overrideFile);

                it('should not have rollout steps with conflicting percentages', () => {
                    const rollouts = findRolloutConfigs(config);
                    const issues = [];

                    for (const { path, rollout } of rollouts) {
                        if (rollout.steps && rollout.steps.length > 1) {
                            // Steps should be in increasing order
                            const percentages = rollout.steps.map(s => s.percent);
                            for (let i = 1; i < percentages.length; i++) {
                                if (percentages[i] <= percentages[i - 1]) {
                                    issues.push(`${path}: rollout steps not in increasing order [${percentages.join(', ')}]`);
                                }
                            }
                        }
                    }

                    expect(issues).to.deep.equal([], `Found conflicting rollout steps:\n${issues.join('\n')}`);
                });

                it('should have minSupportedVersion for features with rollout', () => {
                    const rollouts = findRolloutConfigs(config);
                    const issues = [];

                    for (const { path } of rollouts) {
                        // Navigate to the parent feature object
                        const pathParts = path.split('.');
                        let obj = config;
                        for (const part of pathParts.slice(0, -1)) {
                            if (part.includes('[')) {
                                const [key, indexStr] = part.split('[');
                                const index = parseInt(indexStr.replace(']', ''));
                                obj = obj[key]?.[index];
                            } else {
                                obj = obj[part];
                            }
                            if (!obj) break;
                        }

                        // Check if minSupportedVersion exists at the same level as rollout
                        if (obj && obj.rollout && obj.minSupportedVersion === undefined) {
                            issues.push(`${path}: feature with rollout should have minSupportedVersion`);
                        }
                    }

                    expect(issues).to.deep.equal([], `Missing minSupportedVersion:\n${issues.join('\n')}`);
                });
            });
        }
    });

    describe('CSS Selector Validation', () => {
        const elementHidingPath = `${FEATURES_DIR}/element-hiding.json`;
        if (fs.existsSync(elementHidingPath)) {
            const elementHidingConfig = loadJSON(elementHidingPath);

            it('should not contain logically contradictory CSS selectors', () => {
                const selectors = findSelectors(elementHidingConfig);
                const contradictory = selectors.filter(s => isContradictorySelector(s.selector));

                expect(contradictory).to.deep.equal(
                    [],
                    `Found contradictory selectors:\n${contradictory.map(s => `  ${s.path}: ${s.selector}`).join('\n')}`
                );
            });
        }
    });

    describe('Domain Format Validation', () => {
        const overrideFiles = platforms.map(p => `${OVERRIDE_DIR}/${p}-override.json`);

        for (const overrideFile of overrideFiles) {
            if (!fs.existsSync(overrideFile)) continue;

            describe(`${path.basename(overrideFile)}`, () => {
                const config = loadJSON(overrideFile);

                it('exception domains should not contain protocol or path patterns', () => {
                    const domains = findExceptionDomains(config);
                    const invalid = domains.filter(d => {
                        const domain = d.domain;
                        return (
                            domain.startsWith('http://') ||
                            domain.startsWith('https://') ||
                            domain.includes('/*') ||
                            domain.includes('/') && !domain.includes('.')
                        );
                    });

                    expect(invalid).to.deep.equal(
                        [],
                        `Found invalid domain formats (should be domain only, no protocol/path):\n${invalid.map(d => `  ${d.path}: ${d.domain}`).join('\n')}`
                    );
                });
            });
        }
    });

    // Note: The conditionalChanges "condition" array is interpreted as OR (match any), not AND.
    // Multiple ConditionBlock items in the array match if ANY condition is satisfied.
    // This test validates that multiple domain conditions with different constraint types
    // (like domain + urlPattern) are intentional, since mixing may have unintended effects.
    describe('Conditional Changes Mixed Constraint Validation', () => {
        const overrideFiles = platforms.map(p => `${OVERRIDE_DIR}/${p}-override.json`);

        function findMixedConstraintConditions(obj, path = '') {
            const results = [];
            if (!obj || typeof obj !== 'object') return results;

            if (obj.conditionalChanges && Array.isArray(obj.conditionalChanges)) {
                obj.conditionalChanges.forEach((change, index) => {
                    if (change.condition && Array.isArray(change.condition)) {
                        // Check if we have mixed constraint types (both domain and urlPattern)
                        const hasDomain = change.condition.some(c => c.domain);
                        const hasUrlPattern = change.condition.some(c => c.urlPattern);
                        const hasExperiment = change.condition.some(c => c.experiment);

                        // Mixing domain with urlPattern or experiment in the same condition array
                        // could be confusing - flag for review
                        if ((hasDomain && hasUrlPattern) || (hasDomain && hasExperiment)) {
                            results.push({
                                path: `${path}.conditionalChanges[${index}]`,
                                constraints: [
                                    hasDomain ? 'domain' : null,
                                    hasUrlPattern ? 'urlPattern' : null,
                                    hasExperiment ? 'experiment' : null,
                                ].filter(Boolean)
                            });
                        }
                    }
                });
            }

            for (const [key, value] of Object.entries(obj)) {
                if (key === 'conditionalChanges') continue;
                if (typeof value === 'object' && value !== null) {
                    results.push(...findMixedConstraintConditions(value, path ? `${path}.${key}` : key));
                }
            }
            return results;
        }

        for (const overrideFile of overrideFiles) {
            if (!fs.existsSync(overrideFile)) continue;

            describe(`${path.basename(overrideFile)}`, () => {
                const config = loadJSON(overrideFile);

                it('should not mix different constraint types in conditionalChanges (unless intentional)', () => {
                    const mixedConstraints = findMixedConstraintConditions(config);

                    expect(mixedConstraints).to.deep.equal(
                        [],
                        `Found mixed constraint types in conditionalChanges (review for clarity):\n${mixedConstraints.map(c => `  ${c.path}: uses ${c.constraints.join(' + ')}`).join('\n')}`
                    );
                });
            });
        }
    });

    describe('Element Hiding disable-default Validation', () => {
        /**
         * Known domains intentionally using disable-default without replacement rules.
         * These sites have been reviewed and determined to not need element hiding
         * (e.g., sites with very aggressive adblock detection where element hiding
         * would cause more breakage than it fixes).
         *
         * WARNING: Adding new entries here requires manual review and documentation.
         */
        const allowedOrphanedDisableDefault = [
            'blackhatworld.com',
            'expressnews.com',
            'prajwaldesai.com',
            'snopes.com',
            'soranews24.com',
            'statesman.com',
            'tumblr.com',
            'tvtropes.org',
        ];

        const elementHidingPath = `${FEATURES_DIR}/element-hiding.json`;
        if (fs.existsSync(elementHidingPath)) {
            const elementHidingConfig = loadJSON(elementHidingPath);

            it('disable-default rules should have accompanying replacement rules (unless explicitly allowed)', () => {
                const domains = elementHidingConfig?.settings?.domains || [];
                const orphaned = findOrphanedDisableDefault(domains);
                const unexpected = orphaned.filter(o => {
                    const domain = Array.isArray(o.domain) ? o.domain[0] : o.domain;
                    return !allowedOrphanedDisableDefault.includes(domain);
                });

                expect(unexpected).to.deep.equal(
                    [],
                    `Found NEW disable-default without replacement rules (leaves sites unprotected):\n${unexpected.map(o => `  domain: ${o.domain} - ${o.message}`).join('\n')}\n\nIf intentional, add to allowedOrphanedDisableDefault list with documentation.`
                );
            });
        }

        // Also check override files
        const overrideFiles = platforms.map(p => `${OVERRIDE_DIR}/${p}-override.json`);

        for (const overrideFile of overrideFiles) {
            if (!fs.existsSync(overrideFile)) continue;

            describe(`${path.basename(overrideFile)}`, () => {
                const config = loadJSON(overrideFile);
                const elementHiding = config?.features?.elementHiding;

                if (elementHiding?.settings?.domains) {
                    it('disable-default rules should have accompanying replacement rules', () => {
                        const orphaned = findOrphanedDisableDefault(elementHiding.settings.domains);
                        const unexpected = orphaned.filter(o => {
                            const domain = Array.isArray(o.domain) ? o.domain[0] : o.domain;
                            return !allowedOrphanedDisableDefault.includes(domain);
                        });

                        expect(unexpected).to.deep.equal(
                            [],
                            `Found disable-default without replacement rules:\n${unexpected.map(o => `  domain: ${o.domain} - ${o.message}`).join('\n')}`
                        );
                    });
                }
            });
        }
    });

    describe('Tracker Allowlist Validation', () => {
        const trackerAllowlistPath = `${FEATURES_DIR}/tracker-allowlist.json`;
        if (fs.existsSync(trackerAllowlistPath)) {
            const trackerAllowlistConfig = loadJSON(trackerAllowlistPath);

            it('should use correct regex wildcards (.* instead of standalone *)', () => {
                const allowlistedTrackers = trackerAllowlistConfig?.settings?.allowlistedTrackers || {};
                const rules = findAllowlistRules(allowlistedTrackers);
                const invalidRules = rules.filter(r => hasInvalidWildcard(r.rule));

                expect(invalidRules).to.deep.equal(
                    [],
                    `Found rules with invalid wildcard (* should be .* for regex):\n${invalidRules.map(r => `  ${r.baseDomain}: ${r.rule}`).join('\n')}`
                );
            });

            it('should have specific rules before generic rules within the same domain', () => {
                const allowlistedTrackers = trackerAllowlistConfig?.settings?.allowlistedTrackers || {};
                const issues = [];

                for (const [domain, config] of Object.entries(allowlistedTrackers)) {
                    if (!config.rules || config.rules.length < 2) continue;

                    for (let i = 0; i < config.rules.length - 1; i++) {
                        const currentRule = config.rules[i].rule;
                        const nextRule = config.rules[i + 1].rule;

                        // A rule is more specific if it's a strict prefix of another
                        // (the other rule adds more path segments after).
                        // e.g., "domain.com/path" is generic compared to "domain.com/path/subpath"
                        //
                        // Important: "domain.com/path/a" and "domain.com/path/b" are NOT in a generic/specific
                        // relationship - they are sibling rules.
                        //
                        // Check if currentRule is a strict prefix of nextRule (meaning nextRule is more specific)
                        const currentIsPrefix = nextRule.startsWith(currentRule) &&
                            nextRule !== currentRule &&
                            // Ensure it's a path boundary (not substring match like "iframe" vs "iframerpc")
                            (nextRule[currentRule.length] === '/' || currentRule.endsWith('/'));

                        if (currentIsPrefix) {
                            issues.push(`${domain}: generic rule "${currentRule}" should come after specific rule "${nextRule}"`);
                        }
                    }
                }

                expect(issues).to.deep.equal(
                    [],
                    `Found rule ordering issues (specific rules should come before generic):\n${issues.join('\n')}`
                );
            });

            it('should use "rule" key not "rules" for individual rules', () => {
                const allowlistedTrackers = trackerAllowlistConfig?.settings?.allowlistedTrackers || {};
                const issues = [];

                for (const [domain, config] of Object.entries(allowlistedTrackers)) {
                    if (!config.rules) continue;
                    for (const rule of config.rules) {
                        if ('rules' in rule && !('rule' in rule)) {
                            issues.push(`${domain}: uses "rules" instead of "rule" key`);
                        }
                    }
                }

                expect(issues).to.deep.equal(
                    [],
                    `Found typos in rule keys:\n${issues.join('\n')}`
                );
            });
        }
    });

    describe('Test Feature Flag Validation', () => {
        const overrideFiles = platforms.map(p => `${OVERRIDE_DIR}/${p}-override.json`);

        for (const overrideFile of overrideFiles) {
            if (!fs.existsSync(overrideFile)) continue;

            describe(`${path.basename(overrideFile)}`, () => {
                const config = loadJSON(overrideFile);

                it('should not have a "test" feature enabled in production', () => {
                    const features = config?.features || {};
                    const testFeatures = [];

                    for (const [name, feature] of Object.entries(features)) {
                        // Check for features named exactly "test" (not allowed) that are enabled
                        if (name.toLowerCase() === 'test' && feature?.state === 'enabled') {
                            testFeatures.push(name);
                        }
                    }

                    expect(testFeatures).to.deep.equal(
                        [],
                        `Found enabled test features (should be disabled or removed):\n${testFeatures.join('\n')}`
                    );
                });
            });
        }
    });

    describe('Feature State Consistency Validation', () => {
        const generatedConfigFiles = fs.existsSync(`${GENERATED_DIR}/v5`)
            ? fs.readdirSync(`${GENERATED_DIR}/v5`).filter(f => f.endsWith('.json'))
            : [];

        for (const configFile of generatedConfigFiles) {
            describe(`${configFile}`, () => {
                const config = loadJSON(`${GENERATED_DIR}/v5/${configFile}`);

                it('all features should have a state property', () => {
                    const features = config?.features || {};
                    const missingState = [];

                    for (const [name, feature] of Object.entries(features)) {
                        if (!feature.state) {
                            missingState.push(name);
                        }
                    }

                    expect(missingState).to.deep.equal(
                        [],
                        `Features missing state property:\n${missingState.join('\n')}`
                    );
                });
            });
        }
    });

    describe('JSON Patch Actions Validation', () => {
        const overrideFiles = platforms.map(p => `${OVERRIDE_DIR}/${p}-override.json`);

        function findNestedArrayActions(obj, path = '') {
            const results = [];
            if (!obj || typeof obj !== 'object') return results;

            if (obj.patchSettings && Array.isArray(obj.patchSettings)) {
                for (const patch of obj.patchSettings) {
                    if (patch.value && Array.isArray(patch.value) && patch.value.some(Array.isArray)) {
                        results.push({
                            path: `${path}.patchSettings`,
                            issue: 'Nested arrays in patch value (should be flat array)'
                        });
                    }
                }
            }

            for (const [key, value] of Object.entries(obj)) {
                if (typeof value === 'object' && value !== null) {
                    if (Array.isArray(value)) {
                        value.forEach((item, index) => {
                            results.push(...findNestedArrayActions(item, `${path}.${key}[${index}]`));
                        });
                    } else {
                        results.push(...findNestedArrayActions(value, path ? `${path}.${key}` : key));
                    }
                }
            }
            return results;
        }

        for (const overrideFile of overrideFiles) {
            if (!fs.existsSync(overrideFile)) continue;

            describe(`${path.basename(overrideFile)}`, () => {
                const config = loadJSON(overrideFile);

                it('JSON patch actions should not create nested arrays', () => {
                    const nestedArrays = findNestedArrayActions(config);

                    expect(nestedArrays).to.deep.equal(
                        [],
                        `Found nested arrays in JSON patch operations:\n${nestedArrays.map(n => `  ${n.path}: ${n.issue}`).join('\n')}`
                    );
                });
            });
        }
    });

    describe('Version Format Validation', () => {
        const overrideFiles = platforms.map(p => `${OVERRIDE_DIR}/${p}-override.json`);
        const androidOverride = `${OVERRIDE_DIR}/android-override.json`;
        const nonAndroidOverrides = overrideFiles.filter(f => f !== androidOverride);

        // Android uses integer versions
        if (fs.existsSync(androidOverride)) {
            describe('android-override.json', () => {
                const config = loadJSON(androidOverride);

                it('minSupportedVersion should be integers', () => {
                    const issues = [];

                    function checkVersions(obj, path) {
                        if (!obj || typeof obj !== 'object') return;

                        if (obj.minSupportedVersion !== undefined) {
                            if (typeof obj.minSupportedVersion !== 'number' || !Number.isInteger(obj.minSupportedVersion)) {
                                issues.push(`${path}: minSupportedVersion should be integer, got ${typeof obj.minSupportedVersion}`);
                            }
                        }

                        for (const [key, value] of Object.entries(obj)) {
                            if (typeof value === 'object' && value !== null) {
                                checkVersions(value, path ? `${path}.${key}` : key);
                            }
                        }
                    }

                    checkVersions(config, '');
                    expect(issues).to.deep.equal([], `Version format issues:\n${issues.join('\n')}`);
                });
            });
        }

        // Other platforms use string versions
        for (const overrideFile of nonAndroidOverrides) {
            if (!fs.existsSync(overrideFile)) continue;

            describe(`${path.basename(overrideFile)}`, () => {
                const config = loadJSON(overrideFile);

                it('minSupportedVersion should be strings (semver format)', () => {
                    const issues = [];

                    function checkVersions(obj, path) {
                        if (!obj || typeof obj !== 'object') return;

                        if (obj.minSupportedVersion !== undefined) {
                            if (typeof obj.minSupportedVersion !== 'string') {
                                issues.push(`${path}: minSupportedVersion should be string, got ${typeof obj.minSupportedVersion}`);
                            }
                        }

                        for (const [key, value] of Object.entries(obj)) {
                            if (typeof value === 'object' && value !== null) {
                                checkVersions(value, path ? `${path}.${key}` : key);
                            }
                        }
                    }

                    checkVersions(config, '');
                    expect(issues).to.deep.equal([], `Version format issues:\n${issues.join('\n')}`);
                });
            });
        }
    });

    describe('A/A Experiment Configuration Validation', () => {
        const overrideFiles = platforms.map(p => `${OVERRIDE_DIR}/${p}-override.json`);

        /**
         * True A/A experiments have:
         * 1. "AA" in the name (naming convention)
         * 2. Identical control and treatment URLs
         *
         * This test catches A/A experiments that mistakenly have different URLs
         */
        function findMisconfiguredAAExperiments(obj, path = '') {
            const results = [];
            if (!obj || typeof obj !== 'object') return results;

            // Look for features/subfeatures with "AA" in name (true A/A experiment naming)
            const pathParts = path.split('.');
            const featureName = pathParts[pathParts.length - 1] || '';
            const isAAExperiment = /AA/i.test(featureName);

            if (isAAExperiment && obj.settings) {
                if (obj.settings.controlUrl && obj.settings.treatmentUrl) {
                    if (obj.settings.controlUrl !== obj.settings.treatmentUrl) {
                        results.push({
                            path,
                            controlUrl: obj.settings.controlUrl,
                            treatmentUrl: obj.settings.treatmentUrl,
                            issue: 'A/A experiment should have identical control and treatment URLs'
                        });
                    }
                }
            }

            for (const [key, value] of Object.entries(obj)) {
                if (typeof value === 'object' && value !== null) {
                    if (Array.isArray(value)) {
                        value.forEach((item, index) => {
                            results.push(...findMisconfiguredAAExperiments(item, `${path}.${key}[${index}]`));
                        });
                    } else {
                        results.push(...findMisconfiguredAAExperiments(value, path ? `${path}.${key}` : key));
                    }
                }
            }
            return results;
        }

        for (const overrideFile of overrideFiles) {
            if (!fs.existsSync(overrideFile)) continue;

            describe(`${path.basename(overrideFile)}`, () => {
                const config = loadJSON(overrideFile);

                it('A/A experiments (with AA in name) should have identical control and treatment URLs', () => {
                    const issues = findMisconfiguredAAExperiments(config);

                    expect(issues).to.deep.equal(
                        [],
                        `Found A/A experiments with mismatched configurations:\n${issues.map(i => `  ${i.path}: controlUrl="${i.controlUrl}" treatmentUrl="${i.treatmentUrl}"`).join('\n')}`
                    );
                });
            });
        }
    });
});

