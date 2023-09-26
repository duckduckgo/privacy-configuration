const tldts = require('tldts')
const crypto = require('crypto')

function getAllowlistedRule (rules, rulePath) {
    return rules.find(function (x) { return x.rule === rulePath })
}

function addDomainRules (allowlist, domain, rule) {
    const found = allowlist[domain]
    const existing = found || { rules: [] }
    if (!found) {
        allowlist[domain] = existing
    }
    const newRules = rule.rules || []
    newRules.forEach(function (r) { addPathRule(existing.rules, r) })

    // very basic substring checking to order more-specific rules earlier (doesn't deal with regexp rules)
    existing.rules.sort(function (a, b) {
        return a.rule.includes(b.rule) ? -1 : b.rule.includes(a.rule) ? 1 : 0
    })
}

function addAllowlistRule (allowlist, rule) {
    const dom = tldts.getDomain(rule.rule)
    addDomainRules(allowlist, dom, { rules: [rule] })
}

function addPathRule (rules, rule) {
    const found = getAllowlistedRule(rules, rule.rule)
    const existing = found || { rule: rule.rule, domains: [], reason: '' }
    if (!found) {
        rules.push(existing)
    }
    existing.domains = Array.from(new Set(existing.domains.concat(rule.domains).sort()))
    if (existing.domains.includes('<all>')) {
        existing.domains = ['<all>']
    }
    const reasons = existing.reason.split('; ')
    const newReason = rule.reason
    if (!reasons.includes(rule.reason)) {
        existing.reason = reasons.concat([newReason]).filter(function (x) { return x !== '' }).join('; ')
    }
}

function mergeAllowlistedTrackers (t1, t2) {
    const res = {}
    for (const dom in t1) {
        addDomainRules(res, dom, t1[dom])
    }
    for (const dom in t2) {
        addDomainRules(res, dom, t2[dom])
    }
    // Sort the resulting generated object by domain keys.
    // This makes working with the generated config easier and more human-navigable.
    return Object.keys(res).sort().reduce(function (acc, k) { acc[k] = res[k]; return acc }, {})
}

/**
 * Traverse the input (JSON data) and ensure any "reason" fields are strings in the output.
 *
 * This allows specifying reasons as an array of strings, and converts these to
 * strings in the resulting data.
 */
function inlineReasonArrays (data) {
    if (Array.isArray(data)) {
        return data.map(inlineReasonArrays)
    } else if (typeof data === 'object' && data !== null) {
        const res = {}
        for (const [k, v] of Object.entries(data)) {
            if (k === 'reason') {
                // we collapse list 'reason' field values into a single string
                res[k] = Array.isArray(v) ? v.join(' ') : v
            } else {
                res[k] = inlineReasonArrays(v)
            }
        }
        return res
    } else {
        return data
    }
}

/**
 * All domains that may map to the given cnameTarget.
 */
function getCnameSources (tds, cnameTarget) {
    return Object.entries(tds.cnames).filter(([k, v]) => v.endsWith(cnameTarget)).map(kv => kv[0])
}

/**
 * Generate rules which CNAME to the CNAMEd rule.
 */
function generateCnameRules (tds, cnamedRule) {
    const dom = cnamedRule.rule.split('/')[0]
    const sources = getCnameSources(tds, dom)
    const resultRules = []
    for (const source of sources) {
        resultRules.push({
            ...cnamedRule,
            rule: cnamedRule.rule.replace(dom, source),
            reason: 'CNAME ENTRY GENERATED FROM: ' + dom
        })
    }
    return resultRules
}

/**
 * Add CNAME entries to the allowlist to support platforms with incorrect CNAME resolution.
 */
function addCnameEntriesToAllowlist (tds, allowlist) {
    Object.values(allowlist).forEach(ruleSet => ruleSet.rules.forEach(rule => {
        generateCnameRules(tds, rule).forEach(rule => addAllowlistRule(allowlist, rule))
    }))
}

/**
 * Adds a hash of each feature to each feature object of the provided config
 *
 * @param {object} config - the config object to update
 */
function addHashToFeatures (config) {
    for (const key of Object.keys(config.features)) {
        const featureString = JSON.stringify(config.features[key])
        config.features[key].hash = crypto.createHash('md5').update(featureString).digest('hex')
    }
}

/**
 * Removes reason fields from the config object
 *
 * @param {object} config - the config object to update
 */
function stripReasons (config) {
    for (const key of Object.keys(config.features)) {
        for (const exception of config.features[key].exceptions) {
            delete exception.reason
        }

        if (key === 'trackerAllowlist') {
            for (const domain of Object.keys(config.features[key].settings.allowlistedTrackers)) {
                for (const rule of config.features[key].settings.allowlistedTrackers[domain].rules) {
                    delete rule.reason
                }
            }
        }

        if (key === 'customUserAgent') {
            if (config.features[key].settings.omitApplicationSites) {
                for (const exception of config.features[key].settings.omitApplicationSites) {
                    delete exception.reason
                }
            }
            if (config.features[key].settings.omitVersionSites) {
                for (const exception of config.features[key].settings.omitVersionSites) {
                    delete exception.reason
                }
            }
        }
    }
}

module.exports = {
    addAllowlistRule: addAllowlistRule,
    addCnameEntriesToAllowlist: addCnameEntriesToAllowlist,
    inlineReasonArrays: inlineReasonArrays,
    mergeAllowlistedTrackers: mergeAllowlistedTrackers,
    addHashToFeatures: addHashToFeatures,
    stripReasons: stripReasons
}
