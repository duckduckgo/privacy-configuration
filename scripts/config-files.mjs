/**
 * Read and edit the JSONC feature and override files, keeping comments and repository formatting.
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { applyEdits, modify } from 'jsonc-parser';
import * as prettier from 'prettier';
import { parseJsonc } from './set-jsonc-path.mjs';

/**
 * @typedef {import('./config-conditions.mjs').Platform} Platform
 * @typedef {(string | number)[]} JsonPath
 */

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {Platform} platform
 */
export function overrideFile(platform) {
    return `overrides/${platform}-override.json`;
}

/**
 * Feature keys mapped to their base files, named as the build names them.
 *
 * @returns {Record<string, string>}
 */
export function listFeatureFiles() {
    /** @type {Record<string, string>} */
    const files = {};
    for (const name of readdirSync(resolve(ROOT, 'features'))) {
        if (!name.endsWith('.json')) continue;
        const key = name.replace(/[.]json$/, '').replace(/-([a-z0-9])/g, (match) => match[1].toUpperCase());
        files[key] = `features/${name}`;
    }
    return files;
}

/**
 * @param {string} text
 * @param {JsonPath} path
 * @param {unknown} value - undefined removes the node
 * @param {{ isArrayInsertion?: boolean }} [options]
 */
export function editJsonc(text, path, value, options = {}) {
    const edits = modify(text, path, value, {
        formattingOptions: { tabSize: 4, insertSpaces: true, eol: '\n' },
        ...options,
    });
    return applyEdits(text, edits);
}

/**
 * @param {string} file - relative to the repository root
 */
export function readRepoFile(file) {
    return readFileSync(resolve(ROOT, file), 'utf8');
}

/**
 * @param {string} file - relative to the repository root
 * @param {string} text
 */
export async function writeFormatted(file, text) {
    const filepath = resolve(ROOT, file);
    const config = await prettier.resolveConfig(filepath);
    writeFileSync(filepath, await prettier.format(text, { ...config, filepath }));
}

/**
 * Pending edits to config files, read on first use and written together by `flush`.
 */
export class Workspace {
    /**
     * @param {(file: string) => string} reader
     * @param {Record<string, string>} featureFiles - feature key to base file
     */
    constructor(reader, featureFiles) {
        this.reader = reader;
        this.featureFiles = featureFiles;
        /** @type {Map<string, string>} */
        this.texts = new Map();
        /** @type {Set<string>} */
        this.changed = new Set();
        /** @type {Map<string, { text: string, value: any }>} */
        this.parsed = new Map();
    }

    /**
     * The workspace over the repository's files.
     */
    static fromRepository() {
        return new Workspace(readRepoFile, listFeatureFiles());
    }

    /**
     * @param {string} file
     */
    read(file) {
        const cached = this.texts.get(file);
        if (cached !== undefined) return cached;
        const text = this.reader(file);
        this.texts.set(file, text);
        return text;
    }

    /**
     * @param {string} file
     * @returns {any}
     */
    parse(file) {
        const text = this.read(file);
        const cached = this.parsed.get(file);
        if (cached?.text === text) return cached.value;
        const value = parseJsonc(text, file);
        this.parsed.set(file, { text, value });
        return value;
    }

    /**
     * @param {string} file
     * @param {string} text
     */
    write(file, text) {
        this.texts.set(file, text);
        this.changed.add(file);
    }

    /**
     * @param {string} file
     * @param {JsonPath} path
     * @param {unknown} value - undefined removes the node
     * @param {{ isArrayInsertion?: boolean }} [options]
     */
    edit(file, path, value, options) {
        this.texts.set(file, editJsonc(this.read(file), path, value, options));
        this.changed.add(file);
    }

    /**
     * @param {string} feature
     * @returns {string | undefined}
     */
    featureFile(feature) {
        return this.featureFiles[feature];
    }

    async flush() {
        for (const file of this.changed) {
            await writeFormatted(file, /** @type {string} */ (this.texts.get(file)));
        }
        this.changed.clear();
    }
}
