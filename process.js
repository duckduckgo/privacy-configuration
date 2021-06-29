const fs = require('fs')
const listNames = [
    'audioSites.txt',
    'autofillSites.txt',
    'canvasSites.txt',
    'hardwareSites.txt',
]

for (let filename of listNames) {
    const list = fs.readFileSync(`content-blocking-lists/${filename}`).toString().trim().split('\n')

    const objList = list.map(domain => { return { domain }})
    fs.writeFileSync(`content-blocking-lists/${filename.split('.')[0] + '.json'}`, JSON.stringify({ [filename.split('.')[0]]: objList }, null, 4))
}

