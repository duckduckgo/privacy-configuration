// Pipes all .json files through a JSON.parse -> JSON.stringify loop to apply standard formatting.
const fs = require('fs')
const path = require('path')

const inputDirs = ['features', 'overrides', 'overrides/browsers']

function formatJSON (jsonString) {
    // JSON formatting: 4 spaces per tab, trailing newline
    return JSON.stringify(JSON.parse(jsonString), undefined, 4) + '\n'
}

for (const dir of inputDirs) {
    for (const file of fs.readdirSync(path.join(__dirname, dir))) {
        if (!file.endsWith('.json')) {
            continue
        }
        const filePath = path.join(__dirname, dir, file)
        fs.writeFileSync(filePath, formatJSON(fs.readFileSync(filePath, 'utf-8')), 'utf-8')
    }
}
