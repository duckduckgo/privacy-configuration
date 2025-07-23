import fs from 'fs';
import pkg from 'fast-json-patch';
import { CURRENT_CONFIG_VERSION } from '../../constants.js';
import { readFilesRecursively, mungeFileContents, analyzePatchesForApproval, generateChangeSummary, AUTO_APPROVABLE_FEATURES, isPathAllowedForFeature } from '../../automation-utils.js';

const { compare } = pkg;

/**
 * Compares two directories and outputs approval status for changed files
 * @param {string} dir1 - First directory path
 * @param {string} dir2 - Second directory path
 * @param {boolean} isOpen - Whether to render details as open
 * @returns {Object} Object with HTML-formatted output and approval analysis
 */
function displayApprovalStatus(dir1Files, dir2Files, isOpen) {
    const allPatches = [];
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
                const patches = compare(json1, json2);

                allPatches.push(...patches);

                if (patches.length === 0) {
                    // Skip files that are identical after munging
                    delete dir2Files[filePath];
                    continue;
                }

                const analysis = analyzePatchesForApproval(patches);
                const summary = generateChangeSummary(patches);

                // Extract disallowed paths for manual review
                const disallowedPaths = patches.filter((patch) => {
                    // Use the same logic as analyzePatchesForApproval for consistency
                    const featurePath = Object.keys(AUTO_APPROVABLE_FEATURES).find((feature) => patch.path.startsWith(feature));

                    if (featurePath) {
                        return !isPathAllowedForFeature(patch.path, featurePath);
                    }
                    return true; // Any non-auto-approvable feature changes are disallowed
                });

                fileAnalysis[filePath] = {
                    status: analysis.shouldApprove ? 'approved' : 'manual_review',
                    message: analysis.shouldApprove ? '✅ Auto-approved' : '❌ Manual review required',
                    patches,
                    disallowedPaths,
                    summary,
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
        groupedFiles.manual_review.forEach(({ filePath, disallowedPaths, summary }) => {
            outString += `- **${filePath}** (${summary.total} total changes)\n`;

            if (disallowedPaths.length > 0) {
                outString += '  **Disallowed paths that require review:**\n';
                disallowedPaths.forEach((patch) => {
                    const pathDisplay = patch.path.replace(/\//g, '.').replace(/^\./, '');
                    outString += `  - \`${pathDisplay}\` (${patch.op})\n`;
                });
            }

            // Show allowed changes count
            const allowedChanges = summary.total - disallowedPaths.length;
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

    // Analyze overall approval
    const analysis = analyzePatchesForApproval(allPatches);
    const changeSummary = generateChangeSummary(allPatches);

    return {
        html: outString,
        approvalAnalysis: analysis,
        changeSummary,
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

// eslint-disable-next-line prefer-const
let overallApprovalAnalysis = {
    shouldApprove: true,
    reasons: [],
};

for (const [
    section,
    files,
] of Object.entries(sections)) {
    const isOpen = section === 'latest';
    const result = displayApprovalStatus(files.dir1 || {}, files.dir2 || {}, isOpen);

    // Update overall approval analysis
    if (!result.approvalAnalysis.shouldApprove) {
        overallApprovalAnalysis.shouldApprove = false;
        overallApprovalAnalysis.reasons.push(result.approvalAnalysis.reason);
    }

    console.log(renderDetails(section, result.html, isOpen));
}

// Output overall approval status
console.log('\n## 🎯 OVERALL APPROVAL STATUS');
console.log(`**${overallApprovalAnalysis.shouldApprove ? '✅ AUTO-APPROVED' : '❌ MANUAL REVIEW REQUIRED'}**`);

if (overallApprovalAnalysis.reasons.length > 0) {
    console.log('\n**Reasons for manual review:**');
    overallApprovalAnalysis.reasons.forEach((reason) => {
        console.log(`- ${reason}`);
    });
}
