#!/usr/bin/env node

/**
 * Fails when a rollout step that exists on the base ref was edited or removed. Clients persist each
 * step they have processed, so a rollout only changes by appending a step.
 *
 * Usage: node scripts/check-rollout-steps.mjs [base-ref]   (default: origin/main)
 */

import { execFileSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { isDeepStrictEqual } from 'util';
import { ROOT } from './config-files.mjs';
import { parseJsonc } from './set-jsonc-path.mjs';

const CONFIG_DIRS = [
    'features',
    'overrides',
];

/**
 * Every `rollout.steps` array in a config tree, keyed by the JSON path of its `rollout`.
 *
 * @param {unknown} node
 * @param {string} [path]
 * @param {Map<string, unknown[]>} [found]
 * @returns {Map<string, unknown[]>}
 */
export function findRolloutSteps(node, path = '', found = new Map()) {
    if (typeof node !== 'object' || node === null) return found;
    for (const [
        key,
        child,
    ] of Object.entries(node)) {
        const childPath = `${path}/${key}`;
        if (
            key === 'rollout' &&
            typeof child === 'object' &&
            child !== null &&
            Array.isArray(/** @type {{ steps?: unknown }} */ (child).steps)
        ) {
            found.set(childPath, /** @type {{ steps: unknown[] }} */ (child).steps);
        }
        findRolloutSteps(child, childPath, found);
    }
    return found;
}

/**
 * The steps of `base` that `head` edited or removed. A rollout present on only one side passes.
 *
 * @param {unknown} base - config tree on the base ref
 * @param {unknown} head - the same file's config tree now
 * @returns {string[]} one message per rollout, naming its path
 */
export function changedRolloutSteps(base, head) {
    const headSteps = findRolloutSteps(head);
    const failures = [];
    for (const [
        path,
        steps,
    ] of findRolloutSteps(base)) {
        const now = headSteps.get(path);
        if (now === undefined) continue;
        const index = steps.findIndex((step, i) => !isDeepStrictEqual(step, now[i]));
        if (index === -1) continue;
        const was = JSON.stringify(steps[index]);
        failures.push(
            index < now.length
                ? `${path}: step ${index + 1} changed from ${was} to ${JSON.stringify(now[index])}`
                : `${path}: step ${index + 1} (${was}) removed`,
        );
    }
    return failures;
}

/**
 * @param {string} dir - relative to the repository root
 * @returns {string[]}
 */
function listJsonFiles(dir) {
    return readdirSync(resolve(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return listJsonFiles(path);
        return entry.name.endsWith('.json')
            ? [
                  path,
              ]
            : [];
    });
}

/**
 * @param {string} baseRef
 * @returns {string[]}
 */
export function checkRolloutSteps(baseRef) {
    const git = (/** @type {string[]} */ ...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
    const baseFiles = new Set(git('ls-tree', '-r', '--name-only', baseRef, '--', ...CONFIG_DIRS).split('\n'));
    const failures = [];
    for (const file of CONFIG_DIRS.flatMap(listJsonFiles)) {
        if (!baseFiles.has(file) || !existsSync(resolve(ROOT, file))) continue;
        const base = parseJsonc(git('show', `${baseRef}:${file}`), `${baseRef}:${file}`);
        const head = parseJsonc(readFileSync(resolve(ROOT, file), 'utf8'), file);
        failures.push(...changedRolloutSteps(base, head).map((failure) => `${file}: ${failure}`));
    }
    return failures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const baseRef = process.argv[2] ?? 'origin/main';
    const failures = checkRolloutSteps(baseRef);
    if (failures.length > 0) {
        console.error(`Rollout steps edited or removed since ${baseRef}; append a new step instead:\n${failures.join('\n')}`);
        process.exit(1);
    }
    console.log(`Rollout steps only appended since ${baseRef}`);
}
