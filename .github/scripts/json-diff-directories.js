import fs from 'fs';
import pkg from 'fast-json-patch';
import { CURRENT_CONFIG_VERSION } from '../../constants.js';
import {
    readFilesRecursively,
    mungeFileContents,
    analyzePatchesForApproval,
    generateChangeSummary,
    applyConditionalChangesToConfig,
} from '../../automation-utils.js';

const { compare } = pkg;

/**
 * Compares two directories and outputs approval status for changed files
 * @param {string} dir1 - First directory path
 * @param {string} dir2 - Second directory path
 * @param {boolean} isOpen - Whether to render details as open
 * @returns {Object} Object with HTML-formatted output and approval analysis
 */
function displayApprovalStatus(dir1Files, dir2Files, isOpen) {
    const fileAnalysis = {};

    for (const [
        filePath,
        fileContent,
    ] of Object.entries(dir1Files)) {
        if (filePath in dir2Files) {
            const fileOut = mungeFileContents(fileContent, filePath);
            const file2Out = mungeFileContents(dir2Files[filePath], filePath);

            // Skip identical files entirely
            if (fileOut === file2Out) {
                delete dir2Files[filePath];
                continue;
            }

            try {
                const json1 = JSON.parse(fileOut);
                const json2 = JSON.parse(file2Out);

                // Apply all conditionalChanges patches to both configs if they have features
                const patchedJson1 = applyConditionalChangesToConfig(json1);
                const patchedJson2 = applyConditionalChangesToConfig(json2);

                if (!patchedJson1 || !patchedJson2) {
                    // This might happen if the conditionalChanges collide with each other
                    // We may need to handle this case better if it happens.
                    // For now the safe thing is to just fail.
                    fileAnalysis[filePath] = {
                        status: 'error',
                        message: '❌ Conditional changes patch failed',
                    };
                    continue;
                }

                // Compare the patched configs
                const patches = compare(patchedJson1, patchedJson2);

                if (patches.length === 0) {
                    // Skip files that are identical after munging and patching
                    delete dir2Files[filePath];
                    continue;
                }

                const analysis = analyzePatchesForApproval(patches);
                const summary = generateChangeSummary(patches);

                fileAnalysis[filePath] = {
                    status: analysis.shouldApprove ? 'approved' : 'manual_review',
                    message: analysis.shouldApprove ? '✅ Auto-approved' : '❌ Manual review required',
                    patches,
                    disallowedPatches: analysis.disallowedPatches || [],
                    summary,
                    approvalAnalysis: analysis,
                };
            } catch (error) {
                fileAnalysis[filePath] = {
                    status: 'error',
                    message: `❌ JSON parsing error: ${error.message}`,
                };
            }

            delete dir2Files[filePath];
        } else {
            fileAnalysis[filePath] = {
                status: 'removed',
                message: '❌ File only exists in old changeset',
            };
        }
    }

    for (const filePath of Object.keys(dir2Files)) {
        fileAnalysis[filePath] = {
            status: 'added',
            message: '❌ File only exists in new changeset',
        };
    }

    // Group files by status
    const groupedFiles = {
        approved: [],
        manual_review: [],
        added: [],
        removed: [],
        error: [],
    };

    for (const [
        filePath,
        analysis,
    ] of Object.entries(fileAnalysis)) {
        groupedFiles[analysis.status].push({ filePath, ...analysis });
    }

    // Generate output
    let outString = '';

    // Auto-approved files
    if (groupedFiles.approved.length > 0) {
        outString += '\n## ✅ Auto-Approved Files\n';
        groupedFiles.approved.forEach(({ filePath, summary }) => {
            outString += `- **${filePath}** (${summary.total} changes)\n`;
        });
    }

    // Manual review files
    if (groupedFiles.manual_review.length > 0) {
        outString += '\n## ❌ Manual Review Required\n';
        groupedFiles.manual_review.forEach(({ filePath, disallowedPatches, summary }) => {
            outString += `- **${filePath}** (${summary.total} total changes)\n`;

            if (disallowedPatches.length > 0) {
                outString += '  **Disallowed paths that require review:**\n';
                disallowedPatches.forEach((patch) => {
                    outString += `  - \`${patch.path}\` (${patch.op})\n`;
                });
            }

            // Show allowed changes count
            const allowedChanges = summary.total - disallowedPatches.length;
            if (allowedChanges > 0) {
                outString += `  *${allowedChanges} auto-approvable changes*\n`;
            }
        });
    }

    // Other status files
    if (groupedFiles.added.length > 0) {
        outString += '\n## 📁 New Files\n';
        groupedFiles.added.forEach(({ filePath }) => {
            outString += `- **${filePath}**\n`;
        });
    }

    if (groupedFiles.removed.length > 0) {
        outString += '\n## 🗑️ Removed Files\n';
        groupedFiles.removed.forEach(({ filePath }) => {
            outString += `- **${filePath}**\n`;
        });
    }

    if (groupedFiles.error.length > 0) {
        outString += '\n## ⚠️ Files with Errors\n';
        groupedFiles.error.forEach(({ filePath, message }) => {
            outString += `- **${filePath}**: ${message}\n`;
        });
    }

    // Aggregate overall approval analysis from individual file analyses
    let approvalAnalysis = true;

    for (const analysis of Object.values(fileAnalysis)) {
        if (analysis.status !== 'approved') {
            approvalAnalysis = false;
        }
    }

    return {
        html: outString,
        approvalAnalysis,
        fileAnalysis,
    };
}

function renderDetails(section, text, isOpen) {
    const open = isOpen ? 'open' : '';
    return `<details ${open}>
<summary>${section}</summary>
${text}
</details>`;
}

if (process.argv.length !== 4) {
    console.error('Usage: node json-diff-directories.js <directory1> <directory2>');
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

let overallApprovalAnalysis = true;

for (const [
    section,
    files,
] of Object.entries(sections)) {
    const isOpen = section === 'latest';
    const result = displayApprovalStatus(files.dir1 || {}, files.dir2 || {}, isOpen);

    // Update overall approval analysis
    if (!result.approvalAnalysis) {
        overallApprovalAnalysis = false;
    }

    // Only show non-'latest' sections if 'latest' is empty
    if (isOpen || Object.keys(sections.latest).length === 0) {
        console.log(renderDetails(section, result.html, isOpen));
    }
}

// Output overall approval status
console.log('\n## 🎯 OVERALL APPROVAL STATUS');
console.log(`**${overallApprovalAnalysis ? '✅ AUTO-APPROVED' : '❌ MANUAL REVIEW REQUIRED'}**`);
