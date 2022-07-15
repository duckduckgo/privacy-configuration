const fs = require('fs')
const crypto = require('crypto')

const GENERATED_DIR = 'generated'

let output = ''

// List directories in the GENERATED_DIR
const dirs = fs.readdirSync(GENERATED_DIR)
// For each directory
for (const dir of dirs) {
    // skip if not a directory
    if (!fs.statSync(`${GENERATED_DIR}/${dir}`).isDirectory()) {
        continue
    }

    // Get the files in the directory
    const files = fs.readdirSync(`${GENERATED_DIR}/${dir}`)

    output += `
**${dir}**

|Filename|etag|
|---|---|
`

    // For each file
    for (const file of files) {
        // Get the file content
        const content = fs.readFileSync(`${GENERATED_DIR}/${dir}/${file}`, 'utf8')
        // Compute the etag
        const etag = crypto.createHash('md5').update(content)

        // Add the etag to the output
        output += `|${file}|${etag.digest('hex')}|\n`
    }
}

// Write the output to the file
fs.writeFileSync('etags.md', output)
