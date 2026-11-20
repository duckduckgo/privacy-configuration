/**
 * Read and edit the JSONC feature and override files, keeping comments and repository formatting.
 */

import { execFile, execFileSync } from 'child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { applyEdits, modify } from 'jsonc-parser';
import * as prettier from 'prettier';
import { CURRENT_CONFIG_VERSION } from '../constants.js';
import { parseJsonc } from './set-jsonc-path.mjs';

/**
 * @typedef {import('./config-conditions.mjs').Platform} Platform
 * @typedef {(string | number)[]} JsonPath
 */

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {string[]} args
 */
export function git(...args) {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
}

export function isShallowClone() {
    return git('rev-parse', '--is-shallow-repository').trim() === 'true';
}

/**
 * Whether a commit reachable from `ref` added or removed the JSON string `"name"` in `paths`. The quotes are
 * part of the search string, so contentScopeExperiment1 does not match contentScopeExperiment10.
 *
 * @param {string} name
 * @param {string[]} paths
 * @param {string} [ref]
 */
export function usedInHistory(name, paths, ref = 'HEAD') {
    return git('log', '-1', '--format=%h', `-S"${name}"`, ref, '--', ...paths).trim() !== '';
}

/** Top-level entries the build does not read. */
const NOT_BUILT = new Set([
    '.git',
    'node_modules',
    'generated',
]);

/**
 * Copy the working tree to a temporary directory and write `files` over it.
 *
 * @param {Map<string, string>} [files] - text by path relative to the repository root
 * @returns {string} the directory
 */
export function copyWorkingTree(files = new Map()) {
    const dir = mkdtempSync(join(tmpdir(), 'config-build-'));
    cpSync(ROOT, dir, { recursive: true, filter: (source) => !NOT_BUILT.has(relative(ROOT, source).split(sep)[0]) });
    for (const [
        file,
        text,
    ] of files) {
        writeFileSync(join(dir, file), text);
    }
    return dir;
}

/**
 * Build the config tree in `dir`, read each platform's built config, and delete `dir`.
 *
 * @param {string} dir
 * @param {readonly string[]} platforms
 * @returns {Promise<Map<string, any>>} built config by platform
 */
export async function buildConfigs(dir, platforms) {
    try {
        symlinkSync(resolve(ROOT, 'node_modules'), join(dir, 'node_modules'));
        await promisify(execFile)(
            'node',
            [
                'index.js',
            ],
            { cwd: dir },
        );
        return new Map(
            platforms.map((platform) => [
                platform,
                JSON.parse(readFileSync(join(dir, 'generated', `v${CURRENT_CONFIG_VERSION}`, `${platform}-config.json`), 'utf8')),
            ]),
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

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

    /**
     * @returns {Map<string, string>} the edited files' text by path
     */
    pending() {
        return new Map(
            [
                ...this.changed,
            ].map((file) => [
                file,
                /** @type {string} */ (this.texts.get(file)),
            ]),
        );
    }

    async flush() {
        for (const file of this.changed) {
            await writeFormatted(file, /** @type {string} */ (this.texts.get(file)));
        }
        this.changed.clear();
    }
}
