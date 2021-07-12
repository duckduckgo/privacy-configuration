const http = require('http');
const fs = require('fs')
const LISTS_DIR = 'exceptionLists';
const legacyCookieConfig = '/useragents/cookie_configuration.json';

function getFile(path, host = 'duckduckgo.com') {
    return new Promise((resolve, reject) => {
        const options = {
            host,
            path
        }
        const request = http.request(options, function (res) {
            let data = ''
            res.on('data', function (chunk) {
                data += chunk
            });
            res.on('end', function () {
                resolve(data)
            });
        });
        request.on('error', function (e) {
            reject(e.message)
        });
        request.end();
    })
}

function missingItems(a, b) {
    for (let item of a) {
        if (!b.includes(item)) {
            return true
        }
    }
    return false
}

function arrayDifference(a, b) {
    return missingItems(a, b) || missingItems(b, a)
}

async function init() {
    const fileData = await getFile('/contentblocking/trackers-unprotected-temporary.txt');
    const listData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/trackersUnprotectedTemporary.json`))
    let newListDomains = listData.tempUnprotectedDomains.map((obj) => obj.domain);
    const oldListDomains = fileData.split('\n');
    if (arrayDifference(newListDomains, oldListDomains)) {
        console.log("Unprotected items differ, updating...");
        listData.tempUnprotectedDomains = oldListDomains.map((domain) => {
            return {
                domain,
                reason: "site breakage"
            }
        });
        fs.writeFileSync(`${LISTS_DIR}/trackersUnprotectedTemporary.json`, JSON.stringify(listData, null, 4))
    }

    const protectionsData = JSON.parse(await getFile('/contentblocking/protections.json'));
    const defaultConfig = JSON.parse(fs.readFileSync(`defaultConfig.json`))
    let updateNeeded = false
    const legacyNaming = {
       fingerprintingCanvas: 'canvas',
       trackingCookies: 'cookie',
       fingerprintingAudio: 'audio',
       fingerprintingTemporaryStorage: 'temporary-storage',
       referrer: 'referrer',
       fingerprintingBattery: 'battery',
       fingerprintingScreenSize: 'screen-size',
       fingerprintingHardware: 'hardware',
       floc: 'floc',
       gpc: 'gpc',
       autofill: 'autofill',
    }
    function getNewName(legacyName) {
        for (let newName in legacyNaming) {
            if (legacyNaming[newName] == legacyName) {
                return newName;
            }
        }
        console.warn("New name mapping not found!");
    }
    function findKey(listData) {
        for (let key in listData) {
            if (Array.isArray(listData[key])) {
                return key
            }
        }
        console.warn("Invalid list data, missing array shape!", listData)
    }
    let legacyCookieData = null;
    for (legacyName in protectionsData) {
        let legacyData = protectionsData[legacyName]
        // Known deprecated items we are removing
        if (legacyName === 'do-not-track') {
            continue;
        }
        if (!Object.values(legacyNaming).includes(legacyName)) {
            console.debug("mapping name missing!", key);
        }
        let newName = getNewName(legacyName)
        let newStateNaming = legacyData.enabled ? 'enabled' : 'disabled'
        if (defaultConfig.features[newName].state !== newStateNaming) {
            updateNeeded = true
            console.log(`${newName} feature state didn't match legacy file: ${newStateNaming}`)
            defaultConfig.features[newName].state = newStateNaming
        }
        try {
            let exceptionListData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/${newName}Sites.json`))
            const listKey = findKey(exceptionListData);
            const listData = exceptionListData[listKey];
            // Merge multiple data sources
            if (legacyName == 'cookie') {
                legacyCookieData = JSON.parse(await getFile(legacyCookieConfig, 'staticcdn.duckduckgo.com'))
                legacyData.sites = legacyData.sites.concat(legacyCookieData.excludedDomains.map(obj => obj.domain))
            }
            if (arrayDifference(listData.map(obj => obj.domain), legacyData.sites)) {
                console.warn(`${newName} sites lists are different...`);
                exceptionListData[listKey] = legacyData.sites.map(domain => {
                    return {
                        domain,
                        reason: 'site breakage'
                    }
                })
                // Merge multiple data sources
                if (legacyName == 'cookie') {
                    for (let obj of legacyCookieData.excludedDomains) {
                        let found = false
                        for (let item of exceptionListData[listKey]) {
                            if (item.domain == obj.domain) {
                                item.reason = obj.reason;
                                found = true
                                break;
                            }
                        }
                        if (!found) {
                            exceptionListData[listKey].push(obj)
                        }
                    }
                }
                fs.writeFileSync(`${LISTS_DIR}/${newName}Sites.json`, JSON.stringify(exceptionListData, null, 4))
            }
        } catch {
            if (legacyData.sites.length) {
                console.warn(`We have a missing file: ${LISTS_DIR}/${newName}Sites.json as the legacy feature has sites to import`);
            }
        }
    }
    // We need to flush the default config as an update has happened on the legacy files
    if (updateNeeded) {
        fs.writeFileSync(`defaultConfig.json`, JSON.stringify(defaultConfig, null, 4))
    }
}

init()
