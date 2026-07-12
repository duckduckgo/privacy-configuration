#!/usr/bin/env node

/**
 * Safely replace a value at a dot-notation path in a JSONC file.
 *
 * Usage:
 *   echo '"enabled"' | node scripts/set-jsonc-path.mjs features/foo.json state > features/foo.json
 *
 * Paths use dot notation for object properties only (e.g. foo.bar, buckets.0.gte).
 * Array indices are not supported.
 *
 * Comments in the source file outside the modified region are preserved. The
 * result is written to stdout; the input file is not modified.
 */

import { existsSync, readFileSync } from 'fs';
import { modify, parse, parseTree, findNodeAtLocation, applyEdits } from 'jsonc-parser';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const FORMATTING_OPTIONS = {
    tabSize: 4,
    insertSpaces: true,
    eol: '\n',
};

function usage() {
    console.error(`Usage: set-jsonc-path.mjs <filename> <jsonpath>

Replace the JSON value at <jsonpath> in <filename> with JSONC read from stdin.
Paths use dot notation for object properties (e.g. features.autofill.settings).
Array indices are not supported.

Examples:
  echo '"enabled"' | node scripts/set-jsonc-path.mjs features/foo.json state > features/foo.json
  cat patch.jsonc | node scripts/set-jsonc-path.mjs overrides/ios-override.json features.autofill.settings
  echo '"18_7"' | node scripts/set-jsonc-path.mjs overrides/ios-override.json features.customUserAgent.settings.safariVersionMappings.26
`);
}

/**
 * @param {string} dotPath
 * @returns {string[]}
 */
export function parseDotPath(dotPath) {
    if (!dotPath) {
        return [];
    }

    return dotPath.split('.');
}

/**
 * @param {string} text
 * @param {string} label
 * @returns {unknown}
 */
export function parseJsonc(text, label) {
    const errors = [];
    const value = parse(text, errors, { allowTrailingComma: true });
    if (errors.length > 0) {
        throw new Error(`Failed to parse ${label}: ${JSON.stringify(errors)}`);
    }
    return value;
}

/**
 * Replace the value at <jsonpath> in <originalText> with <replacementText>.
 * Comments in originalText outside the replaced span are preserved.
 *
 * @param {string} originalText
 * @param {string} jsonpath
 * @param {string} replacementText
 * @returns {string}
 */
export function setJsoncAtPath(originalText, jsonpath, replacementText) {
    const trimmedReplacement = replacementText.trim();
    if (!trimmedReplacement) {
        throw new Error('No JSONC data provided on stdin');
    }

    const newValue = parseJsonc(trimmedReplacement, 'stdin input');

    const parseErrors = [];
    const tree = parseTree(originalText, parseErrors, { allowTrailingComma: true });

    if (parseErrors.length > 0) {
        throw new Error(`Failed to parse input file: ${JSON.stringify(parseErrors)}`);
    }

    const path = parseDotPath(jsonpath);
    const existingNode = findNodeAtLocation(tree, path);

    if (!existingNode) {
        throw new Error(`Path not found: ${jsonpath || '<root>'}`);
    }

    const edits = modify(originalText, path, newValue, {
        formattingOptions: FORMATTING_OPTIONS,
    });
    const modifiedText = applyEdits(originalText, edits);

    parseJsonc(modifiedText, 'modified output');

    return modifiedText;
}

/**
 * @returns {Promise<string>}
 */
function readStdin() {
    return new Promise((resolve, reject) => {
        const chunks = [];
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => chunks.push(chunk));
        process.stdin.on('end', () => resolve(chunks.join('')));
        process.stdin.on('error', reject);
    });
}

async function main() {
    const [
        filename,
        jsonpath,
    ] = process.argv.slice(2);

    if (!filename || jsonpath === undefined) {
        usage();
        process.exit(1);
    }

    const filePath = resolve(process.cwd(), filename);

    if (!existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
    }

    const stdinText = await readStdin();
    const originalText = readFileSync(filePath, 'utf8');
    const modifiedText = setJsoncAtPath(originalText, jsonpath, stdinText);

    process.stdout.write(modifiedText);
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}
