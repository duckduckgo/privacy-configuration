import fs from 'fs';
import path from 'path';
import * as diff from 'diff';
import { pathToFileURL } from 'url';
import { CURRENT_CONFIG_VERSION } from '../../constants.js';
import { readFilesRecursively, mungeFileContents } from '../../automation-utils.js';

const versionDir = `v${CURRENT_CONFIG_VERSION}`;

function mungedConfig(generatedDir, filename) {
    const filePath = path.join(generatedDir, versionDir, filename);
    if (!fs.existsSync(filePath)) {
        return null;
    }
    return mungeFileContents(fs.readFileSync(filePath, 'utf-8'), filePath);
}

function compiledConfigFilenames(generatedDir) {
    const directory = path.join(generatedDir, versionDir);
    return fs.existsSync(directory) ? fs.readdirSync(directory).filter((filename) => filename.endsWith('-config.json')) : [];
}

export function detectChangedConfigs(baseDir, headDir) {
    const compiledConfigs = [
        ...new Set([
            ...compiledConfigFilenames(baseDir),
            ...compiledConfigFilenames(headDir),
        ]),
    ].sort();

    return compiledConfigs.filter((filename) => mungedConfig(baseDir, filename) !== mungedConfig(headDir, filename));
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

function displayDirectoryDiffs(dir1, dir2) {
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
        return;
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [
        dir1,
        dir2,
        outputMode,
    ] = process.argv.slice(2);

    if (!dir1 || !dir2 || (outputMode && outputMode !== '--changed-configs')) {
        console.error('Usage: node diff-directories.js <directory1> <directory2> [--changed-configs]');
        process.exit(1);
    }

    if (outputMode === '--changed-configs') {
        process.stdout.write(JSON.stringify(detectChangedConfigs(dir1, dir2)));
    } else {
        displayDirectoryDiffs(dir1, dir2);
    }
}
