import { Octokit } from '@octokit/rest';

const github = new Octokit({
    auth: process.env.GITHUB_TOKEN,
});

const currentObjectivesProjectId = process.env.CURRENT_OBJECTIVES_PROJECT_ID;
const projectAdvisorFieldId = process.env.PROJECT_ADVISOR_FIELD_ID;

// Asana start

async function asanaGet(endpoint) {
    const res = await fetch(`https://app.asana.com/api/1.0${endpoint}`, {
        headers: { Authorization: `Bearer ${process.env.ASANA_ACCESS_TOKEN}` },
    });
    const data = await res.json();
    return data.data;
}

async function asanaPost(endpoint, body) {
    const res = await fetch(`https://app.asana.com/api/1.0${endpoint}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.ASANA_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: body }),
    });
    const data = await res.json();
    return data.data;
}

async function getTask(id) {
    return asanaGet(`/tasks/${id}?opt_fields=name,parent,projects,assignee,custom_fields`);
}

/**
 * Extracts collaborator GIDs (assignee + project advisor) from a project task.
 *
 * @param {Object} projectTask - Asana task object with assignee and custom_fields.
 * @returns {string[]} - Array of unique Asana user GIDs.
 */
function getCollaborators(projectTask) {
    const collaborators = [];

    if (projectTask.assignee?.gid) {
        collaborators.push(projectTask.assignee.gid);
    }

    const advisorField = projectTask.custom_fields?.find((f) => f.gid === projectAdvisorFieldId);
    if (advisorField?.people_value) {
        collaborators.push(...advisorField.people_value.map((p) => p.gid));
    }

    return [
        ...new Set(collaborators),
    ];
}

async function getSubtasks(id) {
    return asanaGet(`/tasks/${id}/subtasks?opt_fields=name`);
}

async function addComment(taskId, htmlText) {
    return asanaPost(`/tasks/${taskId}/stories`, { html_text: htmlText });
}

// Asana end

const args = process.argv.slice(2);
const commitSha = args.find((a) => !a.startsWith('--'));
const taskOverride = args.find((a) => a.startsWith('--task='))?.split('=')[1];

/**
 * Extracts an Asana task ID from a PR body by finding the "Asana Task" section.
 *
 * @param {string} prBody - The pull request body/description.
 * @returns {string|null} - The Asana task GID, or null if not found.
 */
function extractAsanaTaskId(prBody) {
    const lines = prBody.split('\n');
    const taskLineIndex = lines.findIndex((line) => line.toLowerCase().includes('asana task'));
    if (taskLineIndex === -1) return null;

    // Check the header line and the next few lines for the URL
    const searchLines = lines.slice(taskLineIndex, taskLineIndex + 5).join('\n');
    const urlMatch = searchLines.match(/https:\/\/app\.asana\.com\/[^\s)]+/);
    if (!urlMatch) return null;

    const url = urlMatch[0];

    let match = url.match(/\/0\/\d+\/(\d+)/);
    if (match) return match[1];

    match = url.match(/\/task\/(\d+)/);
    if (match) return match[1];

    match = url.match(/\/item\/(\d+)/);
    if (match) return match[1];

    return null;
}

/**
 * Extracts all diff blocks from the "latest" section of a GitHub Actions bot comment.
 *
 * @param {string} body - The comment body containing diff details.
 * @returns {string|null} - All diff content concatenated, or null if not found.
 */
function extractLatestDiff(body) {
    const latestMatch = body.match(/<details open>\s*<summary>latest<\/summary>([\s\S]*?)(?=<\/details>\s*$)/);
    if (!latestMatch) return null;

    const diffBlocks = [
        ...latestMatch[1].matchAll(/```diff([\s\S]*?)```/g),
    ];
    if (diffBlocks.length === 0) return null;

    return diffBlocks.map((m) => m[1].trim()).join('\n\n');
}

/**
 * Traverses up the task hierarchy to find a task in the Current Objectives project.
 *
 * @param {string} taskId - The starting Asana task GID.
 * @returns {Promise<Object|null>} - The project task if found, or null.
 */
async function findProjectInCurrentObjectives(taskId) {
    let currentId = taskId;
    for (let i = 0; i < 10; i++) {
        const task = await getTask(currentId);
        if (!task) return null;

        const inCurrentObjectives = task.projects?.some((p) => p.gid === currentObjectivesProjectId);
        if (inCurrentObjectives) {
            console.log(`  Found project to update`);
            return task;
        }

        if (!task.parent) return null;
        currentId = task.parent.gid;
    }
    return null;
}

/**
 * Finds or creates a notifications subtask under the project task.
 *
 * @param {Object} projectTask - The parent project task from Current Objectives.
 * @returns {Promise<Object>} - The existing or newly created subtask.
 */
async function findOrCreateNotificationsSubtask(projectTask) {
    const subtaskName = `Windows Release Notifications: ${projectTask.name}`;
    const subtasks = await getSubtasks(projectTask.gid);

    const existing = subtasks?.find((s) => s.name === subtaskName);
    if (existing) {
        console.log(`Found existing subtask: ${existing.gid}`);
        return existing;
    }

    const collaborators = getCollaborators(projectTask);
    console.log(`Creating subtask: ${subtaskName} with followers:`, collaborators);

    return asanaPost(`/tasks/${projectTask.gid}/subtasks`, {
        name: subtaskName,
        notes: '',
        followers: collaborators,
    });
}

/**
 * Fetches the PR associated with a commit and extracts the diff from bot comments.
 *
 * @param {string} sha - The commit SHA.
 * @returns {Promise<{pr: Object|null, diff: string|null}>} - The PR and diff content.
 */
async function getPrAndDiff(sha) {
    const owner = 'duckduckgo';
    const repo = 'privacy-configuration';

    const { data: prs } = await github.rest.repos.listPullRequestsAssociatedWithCommit({
        owner,
        repo,
        commit_sha: sha,
    });

    const pr = prs[0];
    if (!pr) return { pr: null, diff: null };

    const { data: comments } = await github.rest.issues.listComments({
        owner,
        repo,
        issue_number: pr.number,
    });

    const diffComment = comments.find((c) => c.user.login === 'github-actions[bot]' && c.body.includes('Generated file outputs'));

    const diff = diffComment ? extractLatestDiff(diffComment.body) : null;
    return { pr, diff };
}

/**
 * Builds an HTML comment for Asana with the PR link and diff.
 *
 * @param {Object} pr - The GitHub PR object.
 * @param {string} diff - The diff content to include.
 * @returns {string} - HTML formatted comment body.
 */
function buildComment(pr, diff) {
    const escapeHtml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapedTitle = escapeHtml(pr.title);
    const escapedDiff = escapeHtml(diff);
    return `<body>Feature flag changed: <a href="${pr.html_url}">${escapedTitle} (#${pr.number})</a>\n\n<pre>${escapedDiff}</pre></body>`;
}

async function run() {
    if (!commitSha) {
        console.log('No commit SHA provided');
        return;
    }

    if (!process.env.ASANA_ACCESS_TOKEN || !currentObjectivesProjectId) {
        console.log('Missing ASANA_ACCESS_TOKEN or CURRENT_OBJECTIVES_PROJECT_ID');
        process.exit(1);
    }

    const { pr, diff } = await getPrAndDiff(commitSha);
    if (!pr) {
        console.log('No PR found');
        return;
    }
    console.log('PR:', pr.number, pr.title);

    const prAsanaTaskId = extractAsanaTaskId(pr.body || '');
    if (!prAsanaTaskId) {
        console.log('No Asana task in PR, nothing to update');
        return;
    }

    const asanaTaskId = taskOverride || prAsanaTaskId;
    if (taskOverride) {
        console.log('Using task override:', taskOverride);
    }

    if (!diff || !diff.includes('windows-config.json')) {
        console.log('No windows-config.json changes, skipping');
        return;
    }

    const windowsDiffMatch = diff.match(/---[^\n]*windows-config\.json[\s\S]*?(?=---[^\n]*\.json|$)/);
    const windowsDiff = windowsDiffMatch ? windowsDiffMatch[0].trim() : null;
    if (!windowsDiff) {
        console.log('Could not extract Windows diff section');
        return;
    }

    const projectTask = await findProjectInCurrentObjectives(asanaTaskId);
    if (!projectTask) {
        console.log('Task not in Current Objectives, skipping');
        return;
    }

    const notificationsSubtask = await findOrCreateNotificationsSubtask(projectTask);
    if (!notificationsSubtask) {
        console.log('Failed to find/create notifications subtask');
        process.exit(1);
    }

    await addComment(notificationsSubtask.gid, buildComment(pr, windowsDiff));
    console.log('Comment posted');
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
