#!/usr/bin/env node

/**
 * Validates dbp.settings.revokedBundleSigningKeys, the list of PIR broker bundle signing keys that clients
 * must stop trusting. Entries must be lowercase hex SHA-256 key hashes, and the list is additive only: an
 * entry present on the base branch must stay in every platform's config.
 *
 * Compares against HEAD (for uncommitted changes) and the base: the PR's base branch in GitHub Actions,
 * otherwise the merge-base of HEAD and origin/main, or HEAD^ when HEAD is already on main.
 * Set REVOKED_KEYS_BASE_REF to compare against a specific revision instead.
 */

import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseJsonc } from 'jsonc-parser';
import platforms from '../platforms.js';
import { BROWSERS_SUBDIR, OVERRIDE_DIR } from '../constants.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_FEATURE_PATH = 'features/dbp.json';
const SETTING = 'revokedBundleSigningKeys';
const KEY_HASH_PATTERN = /^[0-9a-f]{64}$/;
const DEFAULT_BASE_BRANCH = 'main';

function git(...args) {
    return execFileSync('git', args, {
        cwd: rootDir,
        encoding: 'utf-8',
        stdio: [
            'ignore',
            'pipe',
            'pipe',
        ],
    }).trim();
}

function tryGit(...args) {
    try {
        return git(...args);
    } catch {
        return null;
    }
}

function parse(content, label) {
    const parseErrors = [];
    const result = parseJsonc(content, parseErrors);
    if (parseErrors.length > 0) {
        throw new Error(`Failed to parse JSONC in ${label}: ${JSON.stringify(parseErrors)}`);
    }
    return result;
}

function readWorkingTree(path) {
    try {
        return parse(readFileSync(join(rootDir, path), 'utf-8'), path);
    } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
    }
}

function readAtRevision(rev, path) {
    const content = tryGit('show', `${rev}:${path}`);
    return content === null ? null : parse(content, `${rev}:${path}`);
}

/**
 * Mirrors the build: dbp override settings are shallow-merged over the base feature settings, and browser
 * configs start from the extension config.
 * @param {(path: string) => any} read
 * @returns {Record<string, unknown>}
 */
function effectiveLists(read) {
    const baseSettings = read(BASE_FEATURE_PATH)?.settings || {};
    const settingsByPlatform = {};
    for (const platform of platforms) {
        const inherited = platform.includes(BROWSERS_SUBDIR) ? settingsByPlatform.extension : baseSettings;
        const overrideSettings = read(`${OVERRIDE_DIR}/${platform}-override.json`)?.features?.dbp?.settings;
        settingsByPlatform[platform] = overrideSettings ? { ...inherited, ...overrideSettings } : inherited;
    }
    return Object.fromEntries(
        Object.entries(settingsByPlatform).map(
            ([
                platform,
                settings,
            ]) => [
                platform,
                settings?.[SETTING],
            ],
        ),
    );
}

function githubRemote() {
    const repository = process.env.GITHUB_REPOSITORY;
    return repository ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${repository}.git` : 'origin';
}

function fetchRemoteBranch(branch, extraArgs = []) {
    const remote = githubRemote();
    if (tryGit('fetch', '--quiet', '--no-tags', ...extraArgs, remote, `refs/heads/${branch}`) === null) {
        return null;
    }
    return tryGit('rev-parse', '--verify', 'FETCH_HEAD^{commit}');
}

function parentOf(rev) {
    const parent = tryGit('rev-parse', '--verify', `${rev}^`);
    if (parent || tryGit('rev-parse', '--is-shallow-repository') !== 'true') {
        return parent;
    }
    tryGit('fetch', '--quiet', '--no-tags', '--deepen=1');
    return tryGit('rev-parse', '--verify', `${rev}^`);
}

/**
 * A push can contain several commits, so HEAD^ alone could miss a removal in an earlier one.
 * @returns {string | null}
 */
function pushEventBefore() {
    if (process.env.GITHUB_EVENT_NAME !== 'push' || !process.env.GITHUB_EVENT_PATH) {
        return null;
    }
    const before = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf-8')).before;
    if (!before || /^0+$/.test(before)) {
        return null;
    }
    const remote = githubRemote();
    return (
        tryGit('rev-parse', '--verify', `${before}^{commit}`) ||
        (tryGit('fetch', '--quiet', '--no-tags', '--depth=1', remote, before) !== null
            ? tryGit('rev-parse', '--verify', `${before}^{commit}`)
            : null)
    );
}

/**
 * @returns {{ rev: string, description: string }[] | null}
 */
function resolveBaseRevisions() {
    if (process.env.REVOKED_KEYS_BASE_REF) {
        const rev = tryGit('rev-parse', '--verify', `${process.env.REVOKED_KEYS_BASE_REF}^{commit}`);
        return (
            rev && [
                { rev, description: `REVOKED_KEYS_BASE_REF (${process.env.REVOKED_KEYS_BASE_REF})` },
            ]
        );
    }

    const head = git('rev-parse', 'HEAD');
    const revisions = [
        { rev: head, description: `HEAD (${head})` },
    ];

    // In pull_request runs the checkout is a shallow clone of the head repository, which may be a fork,
    // so fetch the base branch from the base repository directly.
    if (process.env.GITHUB_BASE_REF) {
        const rev = fetchRemoteBranch(process.env.GITHUB_BASE_REF, [
            '--depth=1',
        ]);
        return (
            rev && [
                ...revisions,
                { rev, description: `${process.env.GITHUB_BASE_REF} at ${rev}` },
            ]
        );
    }

    const pushedFrom = pushEventBefore();
    if (pushedFrom) {
        revisions.push({ rev: pushedFrom, description: `push before (${pushedFrom})` });
    }

    const baseTip =
        tryGit('rev-parse', '--verify', `refs/remotes/origin/${DEFAULT_BASE_BRANCH}^{commit}`) ||
        fetchRemoteBranch(
            DEFAULT_BASE_BRANCH,
            process.env.CI
                ? [
                      '--depth=1',
                  ]
                : [],
        );
    if (!baseTip) {
        return null;
    }
    const mergeBase = tryGit('merge-base', head, baseTip);
    if (mergeBase === head) {
        // HEAD is already on the base branch (e.g. a push to main), so check the commit it was built on.
        const parent = parentOf(head);
        if (parent) revisions.push({ rev: parent, description: `HEAD^ (${parent})` });
    } else if (mergeBase) {
        revisions.push({ rev: mergeBase, description: `merge-base with ${DEFAULT_BASE_BRANCH} (${mergeBase})` });
    } else {
        // Shallow clones may not contain the merge-base.
        revisions.push({ rev: baseTip, description: `${DEFAULT_BASE_BRANCH} at ${baseTip}` });
    }
    return revisions;
}

const errors = [];
const headLists = effectiveLists(readWorkingTree);

for (const [
    platform,
    list,
] of Object.entries(headLists)) {
    if (list === undefined) {
        errors.push(`${platform}: dbp.settings.${SETTING} is missing`);
        continue;
    }
    if (!Array.isArray(list)) {
        errors.push(`${platform}: dbp.settings.${SETTING} must be an array`);
        continue;
    }
    const seen = new Set();
    for (const entry of list) {
        if (typeof entry !== 'string' || !KEY_HASH_PATTERN.test(entry)) {
            errors.push(`${platform}: ${JSON.stringify(entry)} is not a lowercase hex SHA-256 (64 characters of 0-9a-f)`);
        } else if (seen.has(entry)) {
            errors.push(`${platform}: ${entry} is listed more than once`);
        }
        seen.add(entry);
    }
}

const baseRevisions = resolveBaseRevisions();
if (!baseRevisions) {
    errors.push(
        `Could not resolve a base revision to check that no ${SETTING} entries were removed. ` +
            `Fetch origin/${DEFAULT_BASE_BRANCH} or set REVOKED_KEYS_BASE_REF.`,
    );
} else {
    for (const base of baseRevisions) {
        const baseLists = effectiveLists((path) => readAtRevision(base.rev, path));
        for (const [
            platform,
            baseList,
        ] of Object.entries(baseLists)) {
            if (!Array.isArray(baseList)) continue;
            const headList = Array.isArray(headLists[platform]) ? headLists[platform] : [];
            for (const entry of baseList) {
                if (!headList.includes(entry)) {
                    errors.push(
                        `${platform}: revoked key ${entry} was removed (present on ${base.description}). ` +
                            `Revocations are permanent; if it was added to ${DEFAULT_BASE_BRANCH} after this branch was created, merge ${DEFAULT_BASE_BRANCH} in.`,
                    );
                }
            }
        }
    }
}

if (errors.length > 0) {
    console.error(`❌ dbp.settings.${SETTING} check failed:\n`);
    for (const error of errors) {
        console.error(`  - ${error}`);
    }
    process.exit(1);
}

console.log(
    `✅ dbp.settings.${SETTING} is valid and no entries were removed (compared with ${baseRevisions.map((base) => base.description).join(', ')})`,
);
