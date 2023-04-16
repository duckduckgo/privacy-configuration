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
 * Removes the version from the file contents to imrpove diff readability
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
    const out = []
    for (const [filePath, fileContent] of Object.entries(dir1Files)) {
        let diffOut = ''
        if (filePath in dir2Files) {
            const fileOut = mungeFileContents(fileContent, filePath)
            const file2Out = mungeFileContents(dir2Files[filePath], filePath)
            if (fileOut === file2Out) {
                diffOut = `⚠️ File ${filePath} is identical`
            } else {
                // Slice of file header from diff output
                const fileDiff = diff.createPatch(filePath, fileOut, file2Out).split('\n').slice(2).join('\n')
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
            diffOut = `❌ File ${filePath} only exists in old changeset`
        }
        out.push(renderDetails(filePath, diffOut, isOpen))
    }

    for (const filePath of Object.keys(dir2Files)) {
        out.push(`❌ File ${filePath} only exists in new changeset`)
    }
    return out
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
    const fileOut = displayDiffs(files.dir1, files.dir2, isOpen).join('\n')
    console.log(renderDetails(section, fileOut, isOpen))
}
