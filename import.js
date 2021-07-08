const http = require('http');
const fs = require('fs')
const LISTS_DIR = 'exception-lists';

function getFile(path) {
    return new Promise((resolve, reject) => {
        const options = {
            host: 'duckduckgo.com',
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

async function init() {
    const fileData = await getFile('/contentblocking/trackers-unprotected-temporary.txt');
    const listData = JSON.parse(fs.readFileSync(`${LISTS_DIR}/trackers-unprotected-temporary.json`))
    let newListDomains = listData.tempUnprotectedDomains.map((obj) => obj.domain);
    const oldListDomains = fileData.split('\n');
    if (missingItems(newListDomains, oldListDomains) || missingItems(oldListDomains, newListDomains)) {
        console.log("Unprotected items differ, updating...");
        listData.tempUnprotectedDomains = oldListDomains.map((domain) => {
            return {
                domain,
                reason: "site breakage"
            }
        });
        fs.writeFileSync(`${LISTS_DIR}/trackers-unprotected-temporary.json`, JSON.stringify(listData, null, 4))
    }
}

init()
