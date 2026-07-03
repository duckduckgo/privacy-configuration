import tldts from 'tldts';
import crypto from 'crypto';
import fs from 'fs';
import { parse as parseJsonc } from 'jsonc-parser';
import { LISTS_DIR, UNPROTECTED_LIST_NAME } from './constants.js';

/**
 * Read and parse a JSONC file (JSON with comments).
 * Comments are stripped and regular JSON object is returned.
 *
 * @param {string} filePath - path to the JSONC file
 * @returns {object} parsed JSON object
 */
export function readJsoncFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const errors = [];
    const result = parseJsonc(content, errors);
    if (errors.length > 0) {
        throw new Error(`Failed to parse JSONC in ${filePath}: ${JSON.stringify(errors)}`);
    }
    return result;
}

function getAllowlistedRule(rules, rulePath) {
    return rules.find(function (x) {
        return x.rule === rulePath;
    });
}

function addDomainRules(allowlist, domain, rule) {
    const found = allowlist[domain];
    const existing = found || { rules: [] };
    if (!found) {
        allowlist[domain] = existing;
    }
    const newRules = rule.rules || [];
    newRules.forEach(function (r) {
        addPathRule(existing.rules, r);
    });

    // very basic substring checking to order more-specific rules earlier (doesn't deal with regexp rules)
    existing.rules.sort(function (a, b) {
        return a.rule.includes(b.rule) ? -1 : b.rule.includes(a.rule) ? 1 : 0;
    });
}

export function addAllowlistRule(allowlist, rule) {
    const dom = tldts.getDomain(rule.rule);
    addDomainRules(allowlist, dom, {
        rules: [
            rule,
        ],
    });
}

function addPathRule(rules, rule) {
    const found = getAllowlistedRule(rules, rule.rule);
    const existing = found || { rule: rule.rule, domains: [], reason: '' };
    if (!found) {
        rules.push(existing);
    }
    existing.domains = Array.from(new Set(existing.domains.concat(rule.domains).sort()));
    if (existing.domains.includes('<all>')) {
        existing.domains = [
            '<all>',
        ];
    }

    if (existing.reason === undefined) {
        return;
    }

    const reasons = existing.reason.split('; ');
    const newReason = rule.reason;
    if (!reasons.includes(rule.reason)) {
        existing.reason = reasons
            .concat([
                newReason,
            ])
            .filter(function (x) {
                return x !== '';
            })
            .join('; ');
    }
}

export function getBaseFeatureConfigs() {
    const features = {};
    // Grab all exception lists
    const jsonListNames = fs.readdirSync(LISTS_DIR).filter((listName) => {
        return listName !== UNPROTECTED_LIST_NAME && listName !== '_template.json';
    });
    for (const jsonList of jsonListNames) {
        const listData = readJsoncFile(`${LISTS_DIR}/${jsonList}`);
        const configKey = jsonList.replace(/[.]json$/, '').replace(/-([a-z0-9])/g, function (g) {
            return g[1].toUpperCase();
        });

        delete listData._meta;
        features[configKey] = listData;
    }
    return features;
}

export function mergeAllowlistedTrackers(t1, t2) {
    const res = {};
    for (const dom in t1) {
        addDomainRules(res, dom, t1[dom]);
    }
    for (const dom in t2) {
        addDomainRules(res, dom, t2[dom]);
    }
    // Sort the resulting generated object by domain keys.
    // This makes working with the generated config easier and more human-navigable.
    return Object.keys(res)
        .sort()
        .reduce(function (acc, k) {
            acc[k] = res[k];
            return acc;
        }, {});
}

/**
 * Merge a platform's eventHub telemetry overrides onto the base telemetry.
 *
 * Telemetry entries are merged per key: a platform override only needs to declare the
 * entries it changes or adds, and inherits every other entry from the base event-hub
 * config. This keeps platforms from drifting out of date as base entries change, and
 * ensures they pick up newly-added entries automatically. An entry present in both is
 * replaced wholesale by the override (no deep merge within an entry).
 *
 * @param {object} base - base telemetry record (entry name -> entry)
 * @param {object} override - platform override telemetry record
 */
export function mergeEventHubTelemetry(base, override) {
    return { ...base, ...override };
}

/**
 * Merge a platform's webInterferenceDetection interferenceTypes overrides onto the base.
 *
 * Interference types are merged per key: a platform override only needs to declare the
 * types it changes or adds, and inherits every other type from the base config. This keeps
 * platforms from drifting out of date as base types change, and ensures they pick up
 * newly-added types automatically. A type present in both is replaced wholesale by the
 * override (no deep merge within a type).
 *
 * @param {object} base - base interferenceTypes record (type name -> type)
 * @param {object} override - platform override interferenceTypes record
 */
export function mergeInterferenceTypes(base, override) {
    return { ...base, ...override };
}

function getEntryDomain(entry) {
    return typeof entry === 'string' ? entry : entry.domain;
}

function appendMissingDomainEntries(items, exceptions, createEntry) {
    if (!Array.isArray(items)) {
        return;
    }

    const domains = new Set(items.map(getEntryDomain));
    for (const exception of exceptions) {
        if (domains.has(exception.domain)) {
            continue;
        }
        items.push(createEntry(exception));
        domains.add(exception.domain);
    }
}

function removeDomainEntries(items, exceptions) {
    if (!Array.isArray(items)) {
        return;
    }

    const domains = new Set(exceptions.map(({ domain }) => domain));
    for (let i = items.length - 1; i >= 0; i--) {
        if (domains.has(getEntryDomain(items[i]))) {
            items.splice(i, 1);
        }
    }
}

function conditionMatchesDomain(condition, domain) {
    if (Array.isArray(condition)) {
        return condition.some((entry) => conditionMatchesDomain(entry, domain));
    }
    return condition?.domain === domain;
}

function addClientBrandHintDomains(config, exceptions, brand) {
    const domains = config.features.clientBrandHint?.settings?.domains;
    appendMissingDomainEntries(domains, exceptions, ({ domain }) => ({ domain, brand }));
}

function addWindowsChromeUserAgentStrategies(config, exceptions) {
    const strategies = config.features.customUserAgent?.features?.userAgentStrategies?.settings?.strategies;
    appendMissingDomainEntries(strategies, exceptions, ({ domain }) => ({ strategy: 'ChromeUA', domain }));
}

function addWindowsUaChBrands(config, exceptions) {
    const feature = config.features.uaChBrands;
    const conditionalChanges = feature?.settings?.conditionalChanges;
    if (!Array.isArray(conditionalChanges)) {
        return;
    }

    removeDomainEntries(feature.exceptions, exceptions);
    for (const exception of exceptions) {
        if (conditionalChanges.some((change) => conditionMatchesDomain(change.condition, exception.domain))) {
            continue;
        }
        conditionalChanges.push({
            condition: {
                domain: exception.domain,
            },
            patchSettings: [
                {
                    op: 'add',
                    path: '/brandName',
                    value: 'Google Chrome',
                },
            ],
        });
    }
}

export function addUnprotectedTemporaryUserAgentMitigations(platform, config, exceptions) {
    if (!exceptions.length) {
        return;
    }

    const customUserAgentSettings = config.features.customUserAgent?.settings;
    if (platform === 'ios') {
        appendMissingDomainEntries(customUserAgentSettings?.ddgFixedSites, exceptions, (entry) => ({ ...entry }));
        appendMissingDomainEntries(customUserAgentSettings?.omitApplicationSites, exceptions, (entry) => ({ ...entry }));
    } else if (platform === 'macos') {
        appendMissingDomainEntries(customUserAgentSettings?.defaultSites, exceptions, (entry) => ({ ...entry }));
    } else if (platform === 'android') {
        addClientBrandHintDomains(config, exceptions, 'CHROME');
    } else if (platform === 'windows') {
        addWindowsChromeUserAgentStrategies(config, exceptions);
        addClientBrandHintDomains(config, exceptions, 'Google Chrome');
        addWindowsUaChBrands(config, exceptions);
    }
}

/**
 * Traverse the input (JSON data) and ensure any "reason" fields are strings in the output.
 *
 * This allows specifying reasons as an array of strings, and converts these to
 * strings in the resulting data.
 */
export function inlineReasonArrays(data) {
    if (Array.isArray(data)) {
        return data.map(inlineReasonArrays);
    } else if (typeof data === 'object' && data !== null) {
        const res = {};
        for (const [
            k,
            v,
        ] of Object.entries(data)) {
            if (k === 'reason') {
                // we collapse list 'reason' field values into a single string
                res[k] = Array.isArray(v) ? v.join(' ') : v;
            } else {
                res[k] = inlineReasonArrays(v);
            }
        }
        return res;
    } else {
        return data;
    }
}

const PERIOD_UNIT_SECONDS = {
    seconds: 1,
    minutes: 60,
    hours: 3600,
    days: 86400,
};

/**
 * Collapse each eventHub telemetry entry's `trigger.period` into a single integer `{ seconds }`.
 *
 * Authors may express a period in any unit (`days` / `hours` / `minutes` / `seconds`, per the
 * schema). Clients only read `trigger.period.seconds` and ignore the other units, so a period
 * authored as e.g. `{ "days": 1 }` would parse as 0 seconds and the pixel would be silently
 * dropped. Summing the units to seconds here is what fulfils that delivery contract.
 *
 * Mutates the config in place; no-ops when the feature, telemetry, or a period is absent.
 *
 * @param {object} config - a fully-merged platform config
 */
export function collapseEventHubTelemetryPeriods(config) {
    const telemetry = config?.features?.eventHub?.settings?.telemetry;
    if (!telemetry) {
        return;
    }

    for (const entry of Object.values(telemetry)) {
        const period = entry?.trigger?.period;
        if (!period || typeof period !== 'object') {
            continue;
        }

        let totalSeconds = 0;
        for (const [
            unit,
            multiplier,
        ] of Object.entries(PERIOD_UNIT_SECONDS)) {
            if (typeof period[unit] === 'number') {
                totalSeconds += period[unit] * multiplier;
            }
        }

        entry.trigger.period = { seconds: Math.round(totalSeconds) };
    }
}

/**
 * All domains that may map to the given cnameTarget.
 */
function getCnameSources(tds, cnameTarget) {
    return Object.entries(tds.cnames)
        .filter(
            ([
                k,
                v,
            ]) => v.endsWith(cnameTarget),
        )
        .map((kv) => kv[0]);
}

/**
 * Generate rules which CNAME to the CNAMEd rule.
 */
function generateCnameRules(tds, cnamedRule) {
    const dom = cnamedRule.rule.split('/')[0];
    const sources = getCnameSources(tds, dom);
    const resultRules = [];
    for (const source of sources) {
        resultRules.push({
            ...cnamedRule,
            rule: cnamedRule.rule.replace(dom, source),
            reason: 'CNAME ENTRY GENERATED FROM: ' + dom,
        });
    }
    return resultRules;
}

/**
 * Add CNAME entries to the allowlist to support platforms with incorrect CNAME resolution.
 */
export function addCnameEntriesToAllowlist(tds, allowlist) {
    Object.values(allowlist).forEach((ruleSet) =>
        ruleSet.rules.forEach((rule) => {
            generateCnameRules(tds, rule).forEach((rule) => addAllowlistRule(allowlist, rule));
        }),
    );
}

/**
 * Adds a hash of each feature to each feature object of the provided config
 *
 * @param {object} config - the config object to update
 */
export function addHashToFeatures(config) {
    for (const key of Object.keys(config.features)) {
        const featureString = JSON.stringify(config.features[key]);
        config.features[key].hash = crypto.createHash('md5').update(featureString).digest('hex');
    }
}

/**
 * Removes reason fields from the config object
 *
 * @param {object} config - the config object to update
 */
export function stripReasons(config) {
    for (const key of Object.keys(config.features)) {
        if (!config.features[key].exceptions) {
            continue;
        }
        for (const exception of config.features[key].exceptions) {
            delete exception.reason;
        }

        if (key === 'trackerAllowlist') {
            for (const domain of Object.keys(config.features[key].settings.allowlistedTrackers)) {
                for (const rule of config.features[key].settings.allowlistedTrackers[domain].rules) {
                    delete rule.reason;
                }
            }
        }

        if (key === 'customUserAgent') {
            if (config.features[key].settings.omitApplicationSites) {
                for (const exception of config.features[key].settings.omitApplicationSites) {
                    delete exception.reason;
                }
            }
            if (config.features[key].settings.omitVersionSites) {
                for (const exception of config.features[key].settings.omitVersionSites) {
                    delete exception.reason;
                }
            }
        }
    }
}
