function getAllowlistedRule (rules, rulePath) {
    return rules.find(function (x) { return x.rule === rulePath })
}

function addDomainRule (allowlist, domain, rule) {
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

function addPathRule (rules, rule) {
    const found = getAllowlistedRule(rules, rule.rule)
    const existing = found || { rule: rule.rule, domains: [], reason: '' }
    if (!found) {
        rules.push(existing)
    }
    existing.domains = Array.from(new Set(existing.domains.concat(rule.domains).sort()))
    existing.reason = [existing.reason, rule.reason].filter(function (x) { return x !== '' }).join('; ')
}

function mergeAllowlistedTrackers (t1, t2) {
    const res = {}
    for (const dom in t1) {
        addDomainRule(res, dom, t1[dom])
    }
    for (const dom in t2) {
        addDomainRule(res, dom, t2[dom])
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
function fixReasons (data) {
    if (Array.isArray(data)) {
        return data.map(fixReasons)
    } else if (typeof data === 'object' && data !== null) {
        const res = {}
        for (const [k, v] of Object.entries(data)) {
            if (k === 'reason') {
                // we collapse list 'reason' field values into a single string
                res[k] = Array.isArray(v) ? v.join(' ') : v
            } else {
                res[k] = fixReasons(v)
            }
        }
        return res
    } else {
        return data
    }
}

module.exports = {
    fixReasons: fixReasons,
    mergeAllowlistedTrackers: mergeAllowlistedTrackers
}
