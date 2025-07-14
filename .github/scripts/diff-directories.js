import fs from 'fs';
import path from 'path';
import * as diff from 'diff';
import { CURRENT_CONFIG_VERSION } from '../../constants.js';

function readFilesRecursively(directory) {
    const filenames = fs.readdirSync(directory);
    const files = {};

    filenames.forEach((filename) => {
        const filePath = path.join(directory, filename);
        const fileStats = fs.statSync(filePath);

        if (fileStats.isDirectory()) {
            const nestedFiles = readFilesRecursively(filePath);
            for (const [
                nestedFilePath,
                nestedFileContent,
            ] of Object.entries(nestedFiles)) {
                files[path.join(filename, nestedFilePath)] = nestedFileContent;
            }
        } else {
            files[filename] = fs.readFileSync(filePath, 'utf-8');
        }
    });

    return files;
}

/**
 * Removes superfluous info from the file contents to improve diff readability
 * @param {string} fileContent
 * @param {string} filePath
 * @returns {string}
 */
function mungeFileContents(fileContent, filePath) {
    if (filePath.endsWith('.json')) {
        const fileJSON = JSON.parse(fileContent);
        delete fileJSON.version;
        if ('features' in fileJSON) {
            for (const key of Object.keys(fileJSON.features)) {
                if ('hash' in fileJSON.features[key]) {
                    delete fileJSON.features[key].hash;
                }
            }
        }
        return JSON.stringify(fileJSON, null, 4);
    }
    return fileContent;
}

function displayDiffs(dir1Files, dir2Files, isOpen) {
    const rollupGrouping = {};
    /**
     * Rolls up multiple files with the same diff into a single entry
     * @param {string} fileName
     * @param {string} string
     * @param {string} [summary]
     */
    function add(fileName, string, summary = undefined) {
        if (summary === undefined) {
            summary = string;
        }
        if (!(summary in rollupGrouping)) {
            rollupGrouping[summary] = { files: [] };
        }
        rollupGrouping[summary].files.push(fileName);
        rollupGrouping[summary].string = string;
    }
    for (const [
        filePath,
        fileContent,
    ] of Object.entries(dir1Files)) {
        let diffOut = '';
        let compareOut;
        if (filePath in dir2Files) {
            const fileOut = mungeFileContents(fileContent, filePath);
            const file2Out = mungeFileContents(dir2Files[filePath], filePath);
            if (fileOut === file2Out) {
                diffOut = `⚠️ File is identical`;
                compareOut = 'identical';
            } else {
                // Slice of file header from diff output
                const fileDiff = diff.createPatch(filePath, fileOut, file2Out).split('\n').slice(2).join('\n');
                // Ignore out lines
                compareOut = fileDiff
                    .split('\n')
                    .slice(3)
                    .filter((line) => line.startsWith('-') || line.startsWith('+'))
                    .join('\n');
                if (fileDiff) {
                    diffOut = `

\`\`\`diff\n
${fileDiff}
\`\`\`

`;
                }
            }

            delete dir2Files[filePath];
        } else {
            diffOut = '❌ File only exists in old changeset';
            compareOut = 'old 1';
        }
        add(filePath, diffOut, compareOut);
    }

    for (const filePath of Object.keys(dir2Files)) {
        add(filePath, '❌ File only exists in new changeset', 'new 2');
    }
    const outString = Object.keys(rollupGrouping)
        .map((key) => {
            const rollup = rollupGrouping[key];
            let outString = '';
            let title;

            // Create descriptive title based on file count and type
            if (rollup.files.length === 1) {
                title = rollup.files[0];
            } else {
                const fileCount = rollup.files.length;
                if (key === 'identical') {
                    title = `${fileCount} files identical`;
                } else if (key === 'old 1') {
                    title = `${fileCount} files only in old changeset`;
                } else if (key === 'new 2') {
                    title = `${fileCount} files only in new changeset`;
                } else {
                    title = `${fileCount} files changed`;
                }
            }

            // If there's more than one file in the rollup, list them
            if (rollup.files.length > 1) {
                outString += '\n';
                for (const file of rollup.files) {
                    outString += `- ${file}\n`;
                }

                // Simple replacement of the last filename with additional info
                if (rollup.string.includes('```diff')) {
                    const lastFileName = rollup.files[rollup.files.length - 1];
                    const modifiedDiff = rollup.string.replace(
                        `--- ${lastFileName}`,
                        `--- ${lastFileName} (and ${rollup.files.length - 1} other files)`,
                    );
                    outString += '\n\n' + modifiedDiff;
                } else {
                    outString += '\n\n' + rollup.string;
                }
            } else {
                outString += '\n\n' + rollup.string;
            }

            return renderDetails(title, outString, isOpen);
        })
        .join('\n');
    return outString;
}

function renderDetails(section, text, isOpen) {
    const open = isOpen ? 'open' : '';
    return `<details ${open}>
<summary>${section}</summary>
${text}
</details>`;
}

if (process.argv.length !== 4) {
    console.error('Usage: node diff_directories.js <directory1> <directory2>');
    process.exit(1);
}

const dir1 = process.argv[2];
const dir2 = process.argv[3];

const sections = {
    legacy: {},
    latest: {},
};
function sortFiles(dirFiles, dirName) {
    for (const [
        filePath,
        fileContent,
    ] of Object.entries(dirFiles)) {
        if (filePath.startsWith(`v${CURRENT_CONFIG_VERSION}`)) {
            sections.latest[dirName] = sections.latest[dirName] || {};
            sections.latest[dirName][filePath] = fileContent;
        } else {
            sections.legacy[dirName] = sections.legacy[dirName] || {};
            sections.legacy[dirName][filePath] = fileContent;
        }
    }
}

if (!fs.existsSync(`${dir1}/v${CURRENT_CONFIG_VERSION}`)) {
    console.log(`New config version: v${CURRENT_CONFIG_VERSION}`);
    process.exit(0);
}

sortFiles(readFilesRecursively(dir1), 'dir1');
sortFiles(readFilesRecursively(dir2), 'dir2');

for (const [
    section,
    files,
] of Object.entries(sections)) {
    const isOpen = section === 'latest';
    const fileOut = displayDiffs(files.dir1 || {}, files.dir2 || {}, isOpen);
    console.log(renderDetails(section, fileOut, isOpen));
}
