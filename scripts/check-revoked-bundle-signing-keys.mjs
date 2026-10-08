#!/usr/bin/env node

/**
 * Checks that no dbp.settings.revokedBundleSigningKeys entry present on the base branch has been removed from
 * any platform's config. Revocations are permanent.
 *
 * In pull_request runs this compares against the PR's base branch, and locally against origin/main.
 * Other CI events are skipped since changes reach main through PRs.
 */

import { execFileSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'jsonc-parser';
import platforms from '../platforms.js';
import { BROWSERS_SUBDIR, OVERRIDE_DIR } from '../constants.js';
import { mergeRevokedBundleSigningKeys, readJsoncFile } from '../util.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETTING = 'revokedBundleSigningKeys';

function git(...args) {
    return execFileSync('git', args, { cwd: rootDir, encoding: 'utf-8', stdio: 'pipe' });
}

function readAt(rev, path) {
    if (!rev) {
        return readJsoncFile(join(rootDir, path));
    }
    try {
        return parse(git('show', `${rev}:${path}`));
    } catch {
        // The file didn't exist at rev, which has already been verified.
        return null;
    }
}

// Mirrors the build: browser configs start from the extension config.
function effectiveLists(rev) {
    const baseList = readAt(rev, 'features/dbp.json')?.settings?.[SETTING] || [];
    const lists = {};
    for (const platform of platforms) {
        const inherited = platform.includes(BROWSERS_SUBDIR) ? lists.extension : baseList;
        const overrideList = readAt(rev, `${OVERRIDE_DIR}/${platform}-override.json`)?.features?.dbp?.settings?.[SETTING] || [];
        lists[platform] = mergeRevokedBundleSigningKeys(inherited, overrideList);
    }
    return lists;
}

let baseRev = 'origin/main';
if (process.env.GITHUB_BASE_REF) {
    // The lint job checks out the PR head, which may be a fork, so fetch the base branch from this repo.
    git('fetch', '--quiet', '--depth=1', `https://github.com/${process.env.GITHUB_REPOSITORY}.git`, process.env.GITHUB_BASE_REF);
    baseRev = 'FETCH_HEAD';
} else if (process.env.CI) {
    console.log(`Skipping dbp.settings.${SETTING} check outside pull requests`);
    process.exit(0);
}
try {
    git('rev-parse', '--verify', `${baseRev}^{commit}`);
} catch {
    console.error(`❌ Could not read ${baseRev} to check dbp.settings.${SETTING}. Run \`git fetch origin main\`.`);
    process.exit(1);
}

const headLists = effectiveLists(null);
const errors = [];
for (const [
    platform,
    baseList,
] of Object.entries(effectiveLists(baseRev))) {
    for (const entry of baseList) {
        if (!headLists[platform].includes(entry)) {
            errors.push(
                `${platform}: revoked key ${entry} was removed (present on ${baseRev}). ` +
                    `If it was added to main after this branch was created, merge main in.`,
            );
        }
    }
}

if (errors.length > 0) {
    console.error(`❌ dbp.settings.${SETTING} entries must never be removed:\n`);
    for (const error of errors) {
        console.error(`  - ${error}`);
    }
    process.exit(1);
}

console.log(`✅ No dbp.settings.${SETTING} entries were removed (compared with ${baseRev})`);
