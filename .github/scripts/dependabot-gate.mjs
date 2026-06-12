import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CURSOR_APP_SLUG = 'cursor';
const CURSOR_DETAILS_HOST = 'cursor.com';
export const EXPECTED_CHECKS = [{ name: 'Cursor Bugbot', appSlug: CURSOR_APP_SLUG, detailsHost: CURSOR_DETAILS_HOST }];
export const REQUIRED_PREREQ_CHECK_NAMES = new Set(['Test / unit', 'Test / lint']);
export const PASSING_CHECK_CONCLUSIONS = new Set(['success', 'skipped', 'neutral']);
const CHECK_WAIT_TIMEOUT_MS = 30 * 60 * 1000;
const CHECK_WAIT_POLL_INTERVAL_MS = 30 * 1000;
const CONFIG_APPROVAL_MARKER = '✅ AUTO-APPROVED';

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is required`);
    }
    return value;
}

function setOutput(name, value) {
    const outputPath = requiredEnv('GITHUB_OUTPUT');
    const delimiter = `gh-output-${name}-${Date.now()}`;
    appendFileSync(outputPath, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

function parseLinkHeader(header) {
    if (!header) return null;
    for (const part of header.split(',')) {
        const match = part.match(/<([^>]+)>;\s*rel="next"/);
        if (match) return match[1];
    }
    return null;
}

async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} url
 * @param {{ token?: string, method?: string, headers?: Record<string, string>, body?: string }} [options]
 */
async function requestJson(url, { token, method = 'GET', headers = {}, body } = {}) {
    /** @type {Record<string, string>} */
    const requestHeaders = {
        accept: token ? 'application/vnd.github+json' : 'application/json',
        ...headers,
    };
    if (token) {
        requestHeaders.authorization = `Bearer ${token}`;
        requestHeaders['x-github-api-version'] = '2022-11-28';
    }
    if (body) {
        requestHeaders['content-type'] = 'application/json';
    }

    const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body,
    });
    const responseBody = await response.text();
    if (!response.ok) {
        throw new Error(`Request failed (${response.status}) for ${url}: ${responseBody}`);
    }
    return {
        data: responseBody ? JSON.parse(responseBody) : null,
        next: parseLinkHeader(response.headers.get('link')),
    };
}

/**
 * @template T
 * @param {string} url
 * @param {string} token
 * @param {(data: unknown) => T[]} selectItems
 * @returns {Promise<T[]>}
 */
async function requestAllPages(url, token, selectItems) {
    /** @type {T[]} */
    const items = [];
    let nextUrl = url;
    while (nextUrl) {
        const { data, next } = await requestJson(nextUrl, { token });
        items.push(...selectItems(data));
        nextUrl = next;
    }
    return items;
}

function fetchCheckRuns(apiRoot, headSha, token) {
    return requestAllPages(`${apiRoot}/commits/${headSha}/check-runs?per_page=100`, token, (data) => data.check_runs ?? []);
}

async function fetchCommitStatuses(apiRoot, headSha, token) {
    const { data } = await requestJson(`${apiRoot}/commits/${headSha}/status`, { token });
    return data.statuses ?? [];
}

async function fetchCurrentWorkflowCheckRunIds(apiRoot, runId, token) {
    const jobs = await requestAllPages(`${apiRoot}/actions/runs/${runId}/jobs?per_page=100`, token, (data) => data.jobs ?? []);
    return new Set(jobs.map((job) => job.id).filter((id) => typeof id === 'number'));
}

export function detailsHost(detailsUrl) {
    if (!detailsUrl) return null;
    try {
        return new URL(detailsUrl).host;
    } catch {
        return null;
    }
}

export function matchExpectedCheck(run) {
    return (
        EXPECTED_CHECKS.find((expected) => {
            if (expected.name !== run.name) return false;
            if (run.app?.slug !== expected.appSlug) return false;
            return detailsHost(run.details_url) === expected.detailsHost;
        }) ?? null
    );
}

export function latestCheckRunsByName(checkRuns) {
    const byName = new Map();
    for (const run of checkRuns) {
        if (!matchExpectedCheck(run)) continue;
        const previous = byName.get(run.name);
        const currentTime = new Date(run.completed_at ?? run.started_at ?? run.created_at ?? 0).getTime();
        const previousTime = previous ? new Date(previous.completed_at ?? previous.started_at ?? previous.created_at ?? 0).getTime() : 0;
        if (!previous || currentTime >= previousTime) {
            byName.set(run.name, run);
        }
    }
    return EXPECTED_CHECKS.map((expected) => byName.get(expected.name)).filter(Boolean);
}

function checkRunIdentityKey(run) {
    const appKey = run.app?.slug ?? run.app?.id ?? null;
    return `${appKey}\u0000${run.name}`;
}

export function latestOtherCheckRunsByName(checkRuns, currentRunCheckIds) {
    const byKey = new Map();
    for (const run of checkRuns) {
        if (currentRunCheckIds.has(run.id)) continue;
        const key = checkRunIdentityKey(run);
        const previous = byKey.get(key);
        const currentTime = new Date(run.completed_at ?? run.started_at ?? run.created_at ?? 0).getTime();
        const previousTime = previous ? new Date(previous.completed_at ?? previous.started_at ?? previous.created_at ?? 0).getTime() : 0;
        if (!previous || currentTime >= previousTime) {
            byKey.set(key, run);
        }
    }
    return [...byKey.values()];
}

export function isRequiredPrereqCheck(name) {
    return !!name && REQUIRED_PREREQ_CHECK_NAMES.has(name);
}

export function checkRunState(checkRuns, currentRunCheckIds) {
    const latestRuns = latestOtherCheckRunsByName(checkRuns, currentRunCheckIds).filter((run) => isRequiredPrereqCheck(run.name));
    const pending = latestRuns.filter((run) => run.status !== 'completed');
    const failed = latestRuns.filter((run) => run.status === 'completed' && !PASSING_CHECK_CONCLUSIONS.has(run.conclusion));
    return { pending, failed };
}

export function commitStatusState(statuses) {
    const filtered = statuses.filter((status) => isRequiredPrereqCheck(status.context));
    const pending = filtered.filter((status) => status.state === 'pending');
    const failed = filtered.filter((status) => status.state === 'failure' || status.state === 'error');
    return { pending, failed };
}

export function missingRequiredCheckNames(checkRuns, statuses) {
    const present = new Set();
    for (const run of checkRuns) {
        if (run.name) present.add(run.name);
    }
    for (const status of statuses) {
        if (status.context) present.add(status.context);
    }
    return [...REQUIRED_PREREQ_CHECK_NAMES].filter((name) => !present.has(name));
}

export function missingExpectedCheckNames(checkRuns) {
    const present = new Set(checkRuns.filter((run) => matchExpectedCheck(run)).map((run) => run.name));
    return EXPECTED_CHECKS.filter((expected) => !present.has(expected.name)).map((expected) => expected.name);
}

export function pendingExpectedCheckRuns(checkRuns) {
    return latestCheckRunsByName(checkRuns).filter((run) => run.status !== 'completed');
}

function describeCheckRun(run) {
    return `${run.name} (${run.status}/${run.conclusion ?? 'pending'})`;
}

function describeCommitStatus(status) {
    return `${status.context} (${status.state})`;
}

async function waitForChecksToSettle({ apiRoot, headSha, token, currentRunCheckIds }) {
    const deadline = Date.now() + CHECK_WAIT_TIMEOUT_MS;
    while (true) {
        const [checkRuns, statuses] = await Promise.all([
            fetchCheckRuns(apiRoot, headSha, token),
            fetchCommitStatuses(apiRoot, headSha, token),
        ]);
        const checkRunStatus = checkRunState(checkRuns, currentRunCheckIds);
        const commitStatus = commitStatusState(statuses);

        if (checkRunStatus.failed.length > 0 || commitStatus.failed.length > 0) {
            const failed = [...checkRunStatus.failed.map(describeCheckRun), ...commitStatus.failed.map(describeCommitStatus)].join(', ');
            throw new Error(`Required checks failed; refusing to auto-merge: ${failed}`);
        }

        const missingCursor = missingExpectedCheckNames(checkRuns);
        const pendingCursor = pendingExpectedCheckRuns(checkRuns);
        const missingRequired = missingRequiredCheckNames(checkRuns, statuses);
        const requiredIdle = checkRunStatus.pending.length === 0 && commitStatus.pending.length === 0;
        if (requiredIdle && missingRequired.length === 0 && missingCursor.length === 0 && pendingCursor.length === 0) {
            return checkRuns;
        }

        const pendingDesc = [
            ...checkRunStatus.pending.map(describeCheckRun),
            ...commitStatus.pending.map(describeCommitStatus),
            ...pendingCursor.map(describeCheckRun),
            ...missingCursor.map((name) => `${name} (missing)`),
            ...missingRequired.map((name) => `${name} (missing)`),
        ].join(', ');

        if (Date.now() >= deadline) {
            throw new Error(`Timed out waiting for checks before auto-merge gate: ${pendingDesc}`);
        }

        console.log(`Waiting for checks before auto-merge gate: ${pendingDesc}`);
        await sleep(CHECK_WAIT_POLL_INTERVAL_MS);
    }
}

export function assertPrHeadUnchanged({ currentHead, assessedHead }) {
    if (currentHead !== assessedHead) {
        throw new Error(`PR head advanced from ${assessedHead} to ${currentHead}; refusing to approve or auto-merge using stale evidence.`);
    }
}

export function isGeneratedConfigAutoApproved(approvalOutput) {
    return approvalOutput.includes(CONFIG_APPROVAL_MARKER);
}

export function assessDependabotMerge({ bugbotRuns, configApprovalOutput }) {
    const bugbotRun = bugbotRuns.find((run) => run.name === 'Cursor Bugbot');
    if (!bugbotRun) {
        return {
            safe_to_merge: false,
            reason: 'Missing trusted Cursor Bugbot check run',
            confidence: 'high',
        };
    }
    if (bugbotRun.conclusion !== 'success') {
        return {
            safe_to_merge: false,
            reason: `Cursor Bugbot did not succeed (${bugbotRun.conclusion ?? 'pending'})`,
            confidence: 'high',
        };
    }
    if (!isGeneratedConfigAutoApproved(configApprovalOutput)) {
        return {
            safe_to_merge: false,
            reason: 'Built config output differs from main; manual review required',
            confidence: 'high',
        };
    }
    return {
        safe_to_merge: true,
        reason: 'Cursor Bugbot passed and built config output is unchanged',
        confidence: 'high',
    };
}

async function runAssessMode() {
    const githubToken = requiredEnv('GITHUB_TOKEN');
    const headSha = requiredEnv('PR_HEAD_SHA');
    const currentRunId = requiredEnv('GITHUB_RUN_ID');
    const approvalOutputPath = requiredEnv('CONFIG_APPROVAL_OUTPUT_PATH');
    const [owner, repo] = requiredEnv('GITHUB_REPOSITORY').split('/');
    const apiRoot = `https://api.github.com/repos/${owner}/${repo}`;

    const currentRunCheckIds = await fetchCurrentWorkflowCheckRunIds(apiRoot, currentRunId, githubToken);
    const checkRuns = await waitForChecksToSettle({ apiRoot, headSha, token: githubToken, currentRunCheckIds });
    const bugbotRuns = latestCheckRunsByName(checkRuns);
    const configApprovalOutput = readFileSync(approvalOutputPath, 'utf8');
    const decision = assessDependabotMerge({ bugbotRuns, configApprovalOutput });

    setOutput('assessed_head_sha', headSha);
    setOutput('safe_to_merge', String(decision.safe_to_merge));
    setOutput('reason', decision.reason);
    setOutput('confidence', decision.confidence);
    console.log(
        `Dependabot gate safe_to_merge=${decision.safe_to_merge}; confidence=${decision.confidence}; reason=${decision.reason}`,
    );
}

async function main() {
    const mode = process.argv[2] ?? 'assess';
    switch (mode) {
        case 'assess':
            await runAssessMode();
            break;
        default:
            throw new Error(`Unknown dependabot gate mode '${mode}'; expected assess`);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await main();
}
