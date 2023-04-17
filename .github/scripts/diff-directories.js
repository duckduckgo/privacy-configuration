const fs = require('fs')
const path = require('path')
const diff = require('diff')

function readFilesRecursively (directory) {
    const filenames = fs.readdirSync(directory)
    const files = {}

    filenames.forEach((filename) => {
        const filePath = path.join(directory, filename)
        const fileStats = fs.statSync(filePath)

        if (fileStats.isDirectory()) {
            const nestedFiles = readFilesRecursively(filePath)
            for (const [nestedFilePath, nestedFileContent] of Object.entries(nestedFiles)) {
                files[path.join(filename, nestedFilePath)] = nestedFileContent
            }
        } else {
            files[filename] = fs.readFileSync(filePath, 'utf-8')
        }
    })

    return files
}

/**
 * Removes superfluous info from the file contents to improve diff readability
 * @param {string} fileContent
 * @param {string} filePath
 * @returns {string}
 */
function mungeFileContents (fileContent, filePath) {
    if (filePath.endsWith('.json')) {
        const fileJSON = JSON.parse(fileContent)
        delete fileJSON.version
        if ('features' in fileJSON) {
            for (const key of Object.keys(fileJSON.features)) {
                if ('hash' in fileJSON.features[key]) {
                    delete fileJSON.features[key].hash
                }
            }
        }
        return JSON.stringify(fileJSON, null, 4)
    }
    return fileContent
}

function displayDiffs (dir1Files, dir2Files, isOpen) {
    const rollupGrouping = {}
    /**
     * Rolls up multiple files with the same diff into a single entry
     * @param {string} fileName 
     * @param {string} string 
     * @param {string} [summary]
     */
    function add(fileName, string, summary = undefined) {
        if (summary === undefined) {
            summary = string
        }
        if (!(summary in rollupGrouping)) {
            rollupGrouping[summary] = { files: [] }
        }
        rollupGrouping[summary].files.push(fileName)
        rollupGrouping[summary].string = string
    }
    for (const [filePath, fileContent] of Object.entries(dir1Files)) {
        let diffOut = ''
        let compareOut = undefined
        if (filePath in dir2Files) {
            const fileOut = mungeFileContents(fileContent, filePath)
            const file2Out = mungeFileContents(dir2Files[filePath], filePath)
            if (fileOut === file2Out) {
                diffOut = `⚠️ File is identical`
                compareOut = 'identical'
            } else {
                // Slice of file header from diff output
                const fileDiff = diff.createPatch(filePath, fileOut, file2Out).split('\n').slice(2).join('\n')
                // Ignore out lines
                compareOut = fileDiff.split('\n').slice(3).filter(line => line.startsWith('-') || line.startsWith('+')).join('\n')
                if (fileDiff) {
                    fileDiffOut =
                    diffOut = `

\`\`\`diff\n
${fileDiff}
\`\`\`

`
                }
            }

            delete dir2Files[filePath]
        } else {
            diffOut = '❌ File only exists in old changeset'
            compareOut = 'old 1'
        }
        add(filePath, diffOut, compareOut)
    }

    for (const filePath of Object.keys(dir2Files)) {
        add(filePath, '❌ File only exists in new changeset', 'new 2')
    }
    const outString = Object.keys(rollupGrouping).map(key => {
        const rollup = rollupGrouping[key]
        let outString = ''
        let title = rollup.files[0]
        // If there's more than one file in the rollup, list them
        if (rollup.files.length > 1) {
            title += ` (${rollup.files.length - 1} more)`
            outString += '\n'
            for (const file of rollup.files) {
                outString += `- ${file}\n`
            }
        }
        outString += '\n\n' + rollup.string
        return renderDetails(title, outString, isOpen)
    }).join('\n')
    return outString
}

function renderDetails (section, text, isOpen) {
    const open = isOpen ? 'open' : ''
    return `<details ${open}>
<summary>${section}</summary>
${text}
</details>`
}

if (process.argv.length !== 4) {
    console.error('Usage: node diff_directories.js <directory1> <directory2>')
    process.exit(1)
}

const dir1 = process.argv[2]
const dir2 = process.argv[3]

const sections = {
    legacy: {},
    latest: {}
}
function sortFiles (dirFiles, dirName) {
    for (const [filePath, fileContent] of Object.entries(dirFiles)) {
        if (filePath.startsWith('v2')) {
            sections.latest[dirName] = sections.latest[dirName] || {}
            sections.latest[dirName][filePath] = fileContent
        } else {
            sections.legacy[dirName] = sections.legacy[dirName] || {}
            sections.legacy[dirName][filePath] = fileContent
        }
    }
}
sortFiles(readFilesRecursively(dir1), 'dir1')
sortFiles(readFilesRecursively(dir2), 'dir2')

for (const [section, files] of Object.entries(sections)) {
    const isOpen = section === 'latest'
    const fileOut = displayDiffs(files.dir1, files.dir2, isOpen)
    console.log(renderDetails(section, fileOut, isOpen))
}
