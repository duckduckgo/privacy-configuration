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

// Sorting utilities from compare-branches-sorted.js
function isObject(x) {
    return x && typeof x === 'object' && !Array.isArray(x);
}

/**
 * Stringifies a JSON object in a stable order, preserving array order and object key order.
 *
 * @param {*} obj - The JSON object to stringify.
 * @returns {string} - The stringified JSON object.
 */
function stableJsonStringify(obj) {
    if (Array.isArray(obj)) {
        return `[${obj.map(stableJsonStringify).join(',')}]`;
    } else if (isObject(obj)) {
        const keys = Object.keys(obj).sort();
        return `{${keys.map((k) => `"${k}":${stableJsonStringify(obj[k])}`).join(',')}`;
    }
    return JSON.stringify(obj);
}

/**
 * Aligns the structure of two objects for diffing.
 *
 * Preserves the key order from the base object, aligning values from both base and update.
 * Any extra keys present only in the update object are appended in sorted order.
 *
 * @param {Object} base - The base object to align from.
 * @param {Object} update - The updated object to align to.
 * @returns {[Object, Object]} - Tuple of aligned base and update objects.
 */
function alignObjectStructure(base, update) {
    const alignedBase = {};
    const alignedUpdate = {};
    const baseKeys = Object.keys(base);
    const updateKeys = Object.keys(update);
    const seen = new Set();

    // Keep keys from base first, in order
    for (const key of baseKeys) {
        if (key in update) {
            const [
                b,
                u,
            ] = alignJsonStructure(base[key], update[key]);
            alignedBase[key] = b;
            alignedUpdate[key] = u;
            seen.add(key);
        }
    }

    // Add remaining keys from update, sorted
    const extraKeys = updateKeys.filter((k) => !seen.has(k)).sort();
    for (const key of extraKeys) {
        const [
            // eslint-disable-next-line no-unused-vars
            _,
            u,
        ] = alignJsonStructure(undefined, update[key]);
        alignedUpdate[key] = u;
    }

    return [
        alignedBase,
        alignedUpdate,
    ];
}

/**
 * Aligns two arrays by matching items using a stable JSON hash, preserving base context.
 * Uses a simplified form of LCS (Longest Common Subsequence)
 * LCS finds the longest sequence of items that appear in the same order in both arrays, not necessarily contiguously.
 * Here, we use hashes to identify matching objects and align them, which helps make diffs more readable by grouping similar objects together.
 *
 * @param {Array} baseArr - The base array to align from.
 * @param {Array} updateArr - The updated array to align to.
 * @returns {[Array, Array]} - Tuple of aligned base and update arrays.
 */
function alignArrayByLCSWithBaseContext(baseArr, updateArr) {
    const baseHashes = baseArr.map(stableJsonStringify);
    const updateHashes = updateArr.map(stableJsonStringify);

    const common = baseHashes.filter((h) => updateHashes.includes(h));
    const dedupedCommon = [...new Set(common)];

    const seenUpdateHashes = new Set();

    const alignedBase = [];
    const alignedUpdate = [];

    for (let i = 0; i < baseArr.length; i++) {
        const baseItem = baseArr[i];
        const baseHash = baseHashes[i];
        if (dedupedCommon.includes(baseHash)) {
            const updateIndex = updateHashes.findIndex((h, idx) => h === baseHash && !seenUpdateHashes.has(idx));
            if (updateIndex !== -1) {
                alignedBase.push(baseItem);
                alignedUpdate.push(updateArr[updateIndex]);
                seenUpdateHashes.add(updateIndex);
            }
        }
    }

    // Append remaining items from update that were not matched
    for (let i = 0; i < updateArr.length; i++) {
        if (!seenUpdateHashes.has(i)) {
            alignedBase.push(undefined);
            alignedUpdate.push(updateArr[i]);
        }
    }

    return [
        alignedBase,
        alignedUpdate,
    ];
}

/**
 * Recursively aligns the structure of two JSON values (objects, arrays, or primitives)
 * to facilitate meaningful diffing. Arrays are aligned using LCS-based matching,
 * objects are aligned by keys, and primitives are returned as-is.
 *
 * @param {*} base - The base JSON value to align from.
 * @param {*} update - The updated JSON value to align to.
 * @returns {[*, *]} - Tuple of aligned base and update values.
 */
function alignJsonStructure(base, update) {
    if (Array.isArray(update)) {
        if (Array.isArray(base)) {
            const [
                alignedBaseArr,
                alignedUpdateArr,
            ] = alignArrayByLCSWithBaseContext(base, update);
            const alignedBase = [];
            const alignedUpdate = [];

            for (let i = 0; i < alignedUpdateArr.length; i++) {
                const [
                    b,
                    u,
                ] = alignJsonStructure(alignedBaseArr[i], alignedUpdateArr[i]);
                alignedBase.push(b);
                alignedUpdate.push(u);
            }

            return [
                alignedBase,
                alignedUpdate,
            ];
        } else {
            // No matching base array: return update as-is
            return [
                [],
                update,
            ];
        }
    }

    if (isObject(update)) {
        return alignObjectStructure(base || {}, update);
    }

    // primitive
    return [
        base,
        update,
    ];
}

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

                // Align structure of both objects for stable comparison
                const [
                    sortedJson1,
                    sortedJson2,
                ] = alignJsonStructure(patchedJson1, patchedJson2);

                // Compare the aligned configs
                const patches = compare(sortedJson1, sortedJson2);

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

    // Only show non-'latest' sections if failing
    if (isOpen || !result.approvalAnalysis) {
        console.log(renderDetails(section, result.html, isOpen));
    }
}

// Output overall approval status
console.log('\n## 🎯 OVERALL APPROVAL STATUS');
console.log(`**${overallApprovalAnalysis ? '✅ AUTO-APPROVED' : '❌ MANUAL REVIEW REQUIRED'}**`);
