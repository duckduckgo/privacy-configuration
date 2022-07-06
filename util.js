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
    return res
}

module.exports = {
    mergeAllowlistedTrackers: mergeAllowlistedTrackers
}
