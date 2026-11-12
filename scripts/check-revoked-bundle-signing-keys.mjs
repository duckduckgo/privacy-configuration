#!/usr/bin/env node

/**
 * Stops bundle signing keys from being unrevoked by failing if a key in dbp.settings.revokedBundleSigningKeys
 * on the base branch has been removed from features/dbp.json.
 */

import { execFileSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'jsonc-parser';
import { readJsoncFile } from '../util.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'features/dbp.json';
const SETTING = 'revokedBundleSigningKeys';

function git(...args) {
    return execFileSync('git', args, { cwd: rootDir, encoding: 'utf-8', stdio: 'pipe' });
}

let baseRev = 'origin/main';
if (process.env.GITHUB_EVENT_NAME === 'push') {
    // PRs are checked. A pushed commit can be behind main, so comparing it with main would fail spuriously.
    console.log(`Skipping dbp.settings.${SETTING} check on push`);
    process.exit(0);
}
if (process.env.GITHUB_ACTIONS) {
    // The checkout may be shallow or of a fork, so fetch the base branch from this repo.
    const baseBranch = process.env.GITHUB_BASE_REF || 'main';
    git('fetch', '--quiet', '--depth=1', `https://github.com/${process.env.GITHUB_REPOSITORY}.git`, baseBranch);
    baseRev = 'FETCH_HEAD';
}

let baseFile;
try {
    baseFile = git('show', `${baseRev}:${FILE}`);
} catch {
    console.error(`❌ Could not read ${FILE} at ${baseRev} to check dbp.settings.${SETTING}. Run \`git fetch origin main\`.`);
    process.exit(1);
}

const baseKeys = parse(baseFile).settings?.[SETTING] || [];
const headKeys = readJsoncFile(join(rootDir, FILE)).settings?.[SETTING] || [];
const removedKeys = baseKeys.filter((key) => !headKeys.includes(key));

if (removedKeys.length > 0) {
    console.error(`❌ dbp.settings.${SETTING} entries must never be removed from ${FILE}:\n`);
    for (const key of removedKeys) {
        console.error(`  - ${key}`);
    }
    console.error(`\nIf a key was added to main after this branch was created, merge main in.`);
    process.exit(1);
}

console.log(`✅ No dbp.settings.${SETTING} entries were removed from ${FILE} (compared with ${baseRev})`);
