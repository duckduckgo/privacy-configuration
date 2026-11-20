#!/usr/bin/env node

/**
 * Format the repository's JSON files: oxfmt, then one item per line in every non-empty array.
 * oxfmt has no option for that array layout (https://github.com/oxc-project/oxc/issues/20007),
 * so .oxfmtrc.json ignores JSON and this script formats it.
 * A property after a `// prettier-ignore` comment keeps its layout.
 *
 * Usage: node scripts/format-json.mjs [--check] [file ...]
 * With no files, it formats every tracked JSON file except the ones in IGNORED.
 */

import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { applyEdits, findNodeAtOffset, parseTree, visit } from 'jsonc-parser';
import { format } from 'oxfmt';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** package.json files are npm's, and features/autoconsent.json is generated. */
const IGNORED = /(^|\/)package(-lock)?\.json$|^features\/autoconsent\.json$/;

// The oxfmt API does not read config files, so pass it the repository settings.
const { $schema, ignorePatterns, ...OXFMT_OPTIONS } = JSON.parse(readFileSync(resolve(ROOT, '.oxfmtrc.json'), 'utf8'));

/**
 * @typedef {import('jsonc-parser').Node} Node
 */

/**
 * @param {string} file - path relative to the repository root
 */
export function isFormattedJsonFile(file) {
    return file.endsWith('.json') && !IGNORED.test(file);
}

/**
 * Ranges of the properties that follow a `// prettier-ignore` comment.
 *
 * @param {string} text
 * @param {Node} tree
 * @returns {[number, number][]}
 */
function ignoredRanges(text, tree) {
    /** @type {[number, number][]} */
    const ranges = [];
    visit(text, {
        onComment(offset, length) {
            if (text.slice(offset, offset + length).trim() !== '// prettier-ignore') return;
            const start = offset + length + (text.slice(offset + length).match(/^\s*/)?.[0].length ?? 0);
            const node = findNodeAtOffset(tree, start, true);
            const property = node?.parent?.type === 'property' ? node.parent : node;
            if (property) ranges.push([property.offset, property.offset + property.length]);
        },
    });
    return ranges;
}

/**
 * @param {Node} node
 * @returns {boolean}
 */
function hasNonEmptyArray(node) {
    if (node.type === 'array' && (node.children?.length ?? 0) > 0) return true;
    return (node.children ?? []).some(hasNonEmptyArray);
}

/**
 * Put each item of every non-empty array on its own line.
 * oxfmt output only puts several items on one line when they all fit on that line,
 * so the arrays to rewrite hold single-line items, and so do the objects that contain them.
 *
 * @param {string} text - oxfmt output
 * @returns {string}
 */
function expandArrays(text) {
    const tree = parseTree(text);
    if (!tree) return text;
    const ignored = ignoredRanges(text, tree);
    const lineStarts = [0];
    for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) lineStarts.push(i + 1);
    const lineOf = (/** @type {number} */ offset) => {
        let [low, high] = [0, lineStarts.length - 1];
        while (low < high) {
            const mid = (low + high + 1) >> 1;
            if (lineStarts[mid] <= offset) low = mid;
            else high = mid - 1;
        }
        return low;
    };
    const indentAt = (/** @type {number} */ offset) => text.slice(text.lastIndexOf('\n', offset - 1) + 1).match(/^ */)?.[0] ?? '';
    const source = (/** @type {Node} */ node) => text.slice(node.offset, node.offset + node.length);

    /**
     * @param {Node} node - a node whose text is on one line
     * @param {string} indent - indentation of the line the node starts on
     * @returns {string}
     */
    const print = (node, indent) => {
        const inner = indent + '    ';
        if (node.type === 'array' && node.children?.length) {
            return `[\n${node.children.map((child) => inner + print(child, inner)).join(',\n')}\n${indent}]`;
        }
        if (node.type === 'object' && hasNonEmptyArray(node)) {
            const properties = (node.children ?? []).map((property) => {
                const [key, value] = /** @type {Node[]} */ (property.children);
                return `${inner}${source(key)}: ${print(value, inner)}`;
            });
            return `{\n${properties.join(',\n')}\n${indent}}`;
        }
        return source(node);
    };

    /**
     * Whether the array has an item that does not start on its own line, or a closing bracket that does not.
     *
     * @param {Node} node
     */
    const needsExpanding = (node) => {
        const items = node.children ?? [];
        if (items.length === 0) return false;
        const ends = [node.offset, ...items.map((item) => item.offset + item.length)];
        return (
            items.some((item, i) => lineOf(item.offset) === lineOf(ends[i])) ||
            lineOf(node.offset + node.length) === lineOf(ends.at(-1) ?? 0)
        );
    };

    /** @type {import('jsonc-parser').Edit[]} */
    const edits = [];
    /** @param {Node} node */
    const walk = (node) => {
        if (ignored.some(([start, end]) => node.offset >= start && node.offset < end)) return;
        const isArrayToExpand = node.type === 'array' && needsExpanding(node);
        const isInlineObject =
            node.type === 'object' && lineOf(node.offset) === lineOf(node.offset + node.length) && hasNonEmptyArray(node);
        if (isArrayToExpand || isInlineObject) {
            if (lineOf(node.offset) !== lineOf(node.offset + node.length)) {
                throw new Error(`Cannot put each item on its own line in the array at line ${lineOf(node.offset)}: it spans several lines`);
            }
            if (/\/[/*]/.test(source(node).replace(/"(?:[^"\\]|\\.)*"/g, '""'))) {
                throw new Error(`Cannot put each item on its own line in the array at line ${lineOf(node.offset)}: it holds a comment`);
            }
            edits.push({ offset: node.offset, length: node.length, content: print(node, indentAt(node.offset)) });
            return;
        }
        (node.children ?? []).forEach(walk);
    };
    walk(tree);
    return applyEdits(text, edits);
}

/**
 * @param {string} file - path of the file, used to pick the parser
 * @param {string} text - JSON, comments allowed
 * @returns {Promise<string>}
 */
export async function formatJson(file, text) {
    const { code, errors } = await format(file, text, OXFMT_OPTIONS);
    if (errors.length > 0) throw new Error(`oxfmt could not format ${file}: ${errors.map((e) => e.message).join('; ')}`);
    return expandArrays(code);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const check = args.includes('--check');
    const named = args.filter((arg) => arg !== '--check').map((file) => relative(ROOT, resolve(file)));
    const files = (
        named.length > 0 ? named : execFileSync('git', ['ls-files', '*.json'], { cwd: ROOT, encoding: 'utf8' }).split('\n')
    ).filter(isFormattedJsonFile);
    const unformatted = [];
    for (const file of files) {
        const path = resolve(ROOT, file);
        const text = readFileSync(path, 'utf8');
        const formatted = await formatJson(path, text);
        if (formatted === text) continue;
        unformatted.push(file);
        if (!check) writeFileSync(path, formatted);
    }
    if (check && unformatted.length > 0) {
        console.error(`These JSON files are not formatted. Run npm run format.\n${unformatted.join('\n')}`);
        process.exit(1);
    }
    console.log(`${check ? 'Checked' : 'Formatted'} ${files.length} JSON files${check ? '' : `, ${unformatted.length} changed`}.`);
}
