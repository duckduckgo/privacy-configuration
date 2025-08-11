#!/usr/bin/env node

import fs from 'fs';

/**
 * Auto-approval handler for privacy configuration PRs
 *
 * This script handles:
 * - Auto-approving PRs that only contain auto-approvable changes
 * - Revoking auto-approvals when PR is synced (new commits added)
 * - Re-approving after tests pass if still auto-approvable
 * - Ensuring cursor bug bot has finished its analysis before approval
 *   (The cursor bot provides bug analysis - any comment from it blocks approval, timeout allows approval)
 */

const AUTO_APPROVAL_MARKER = '🤖 **Auto-approved**';
const AUTO_APPROVAL_DISMISSED_MARKER = '🤖 **Auto-approval dismissed**';
const CURSOR_BOT_WAIT_TIME_MS = process.env.CURSOR_BOT_WAIT_TIME_MS || 7 * 60 * 1000; // Configurable wait time, default 7 minutes
const CURSOR_BOT_CHECK_INTERVAL_MS = 10000; // 10 seconds between checks

/**
 * Check if the cursor bug bot has finished running and if it found any issues
 * We wait for the cursor bot to either post a comment (indicating issues found) or timeout
 * @param {Object} github - GitHub API client
 * @param {Object} context - GitHub context
 * @returns {Promise<{finished: boolean, hasIssues: boolean}>} Object with completion status and issue detection
 */
async function hasCursorBugBotFinished(github, context) {
    try {
        // Check for recent comments that indicate cursor bug bot completion
        const comments = await github.rest.issues.listComments({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: context.payload.pull_request.number,
            per_page: 20,
        });

        // Look for cursor bug bot completion indicators
        // The cursor bot posts comments with titles like "Bug: ..." and provides analysis
        const cursorBotComment = comments.data.find(
            (comment) =>
                // Look for comments from the cursor bot user
                comment.user.login === 'cursor' ||
                // Or look for comments that contain bug analysis patterns
                (comment.body &&
                    (comment.body.includes('Bug:') || comment.body.includes('Fix in Cursor') || comment.body.includes('Fix in Web'))),
        );

        if (!cursorBotComment) {
            console.log('⏳ Waiting for cursor bug bot to complete analysis...');
            return { finished: false, hasIssues: false };
        }

        // Check if the comment was created recently (within last 5 minutes)
        const commentAge = Date.now() - new Date(cursorBotComment.created_at).getTime();
        const isRecent = commentAge < 5 * 60 * 1000; // 5 minutes

        if (!isRecent) {
            console.log('⏳ Cursor bug bot analysis may be stale, waiting for fresh analysis...');
            return { finished: false, hasIssues: false };
        }

        // If cursor bot posted a comment, it found issues
        const hasIssues = true;
        console.log('✅ Cursor bug bot has finished analysis and found issues');
        return { finished: true, hasIssues };
    } catch (error) {
        console.error('❌ Error checking cursor bug bot status:', error.message);
        // If we can't determine status, assume it's not finished for safety
        return { finished: false, hasIssues: false };
    }
}

/**
 * Wait for cursor bug bot to finish with timeout
 * @param {Object} github - GitHub API client
 * @param {Object} context - GitHub context
 * @returns {Promise<{success: boolean, hasIssues: boolean}>} Object with success status and issue detection
 */
async function waitForCursorBugBot(github, context) {
    const startTime = Date.now();
    const maxWaitTime = CURSOR_BOT_WAIT_TIME_MS;

    console.log(
        `⏳ Starting wait for cursor bug bot (max wait: ${maxWaitTime / 1000}s, check interval: ${CURSOR_BOT_CHECK_INTERVAL_MS / 1000}s)`,
    );

    while (Date.now() - startTime < maxWaitTime) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`⏳ Checking cursor bug bot status (elapsed: ${elapsed}s)...`);

        // Check for cursor bot comments
        const cursorBotResult = await hasCursorBugBotFinished(github, context);

        if (cursorBotResult.finished) {
            const totalTime = Math.round((Date.now() - startTime) / 1000);
            console.log(`✅ Cursor bug bot finished in ${totalTime}s`);

            // If cursor bot found issues, return false to prevent approval
            if (cursorBotResult.hasIssues) {
                console.log('❌ Cursor bug bot found issues - approval blocked');
                return { success: false, hasIssues: true };
            }

            return { success: true, hasIssues: false };
        }

        // Wait configured interval before checking again
        await new Promise((resolve) => setTimeout(resolve, CURSOR_BOT_CHECK_INTERVAL_MS));
    }

    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`⏰ Timeout waiting for cursor bug bot to finish after ${totalTime}s`);
    return { success: false, hasIssues: false };
}

/**
 * Check if the approval analysis indicates auto-approval
 * @param {string} approvalOutput - The approval analysis output
 * @returns {boolean} True if auto-approval is indicated
 */
function isAutoApprovable(approvalOutput) {
    return approvalOutput.includes('✅ AUTO-APPROVED');
}

/**
 * Get existing auto-approval review if it exists
 * @param {Object} github - GitHub API client
 * @param {Object} context - GitHub context
 * @returns {Object|null} The auto-approval review or null
 */
async function getExistingAutoApprovalReview(github, context) {
    try {
        const reviews = await github.rest.pulls.listReviews({
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: context.payload.pull_request.number,
        });

        return reviews.data.find(
            (review) =>
                review.user.login === 'github-actions[bot]' &&
                review.state === 'APPROVED' &&
                review.body &&
                review.body.includes(AUTO_APPROVAL_MARKER),
        );
    } catch (error) {
        console.error('Failed to get existing reviews:', error.message);
        return null;
    }
}

/**
 * Submit an auto-approval review
 * @param {Object} github - GitHub API client
 * @param {Object} context - GitHub context
 * @returns {boolean} True if successful
 */
async function submitAutoApprovalReview(github, context) {
    try {
        await github.rest.pulls.createReview({
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: context.payload.pull_request.number,
            event: 'APPROVE',
            body: `${AUTO_APPROVAL_MARKER}: This PR contains only auto-approvable changes to feature domains/exceptions. No manual review required.`,
            comments: [],
        });

        console.log('✅ Auto-approval review submitted successfully');
        return true;
    } catch (error) {
        console.error('❌ Failed to submit auto-approval review:', error.message);
        return false;
    }
}

/**
 * Dismiss an existing auto-approval review
 * @param {Object} github - GitHub API client
 * @param {Object} context - GitHub context
 * @param {Object} review - The review to dismiss
 * @param {string} reason - Reason for dismissal
 * @returns {boolean} True if successful
 */
async function dismissAutoApprovalReview(github, context, review, reason) {
    try {
        await github.rest.pulls.dismissReview({
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: context.payload.pull_request.number,
            review_id: review.id,
            message: `${AUTO_APPROVAL_DISMISSED_MARKER}: ${reason}`,
        });

        console.log('✅ Auto-approval review dismissed');
        return true;
    } catch (error) {
        console.error('❌ Failed to dismiss auto-approval review:', error.message);
        return false;
    }
}

/**
 * Handle auto-approval logic based on the current state
 * @param {Object} github - GitHub API client
 * @param {Object} context - GitHub context
 * @param {string} approvalOutputPath - Path to approval analysis output file
 * @param {string} action - The PR action (opened, synchronize, etc.)
 */
export async function handleAutoApproval(github, context, approvalOutputPath, action) {
    if (!fs.existsSync(approvalOutputPath)) {
        console.log('❌ Approval analysis file not found');
        return;
    }

    // Wait for cursor bug bot to finish running before proceeding
    console.log('⏳ Waiting for cursor bug bot to finish running...');
    const cursorBotResult = await waitForCursorBugBot(github, context);

    if (!cursorBotResult.success) {
        if (cursorBotResult.hasIssues) {
            console.log('❌ Cursor bug bot found issues - blocking auto-approval');
        } else {
            console.log('❌ Cursor bug bot did not finish within timeout, skipping auto-approval');
        }
        return;
    }

    const approvalOutput = fs.readFileSync(approvalOutputPath, 'utf8');
    const isCurrentlyAutoApprovable = isAutoApprovable(approvalOutput);
    const existingReview = await getExistingAutoApprovalReview(github, context);

    console.log(`PR Action: ${action}`);
    console.log(`Currently auto-approvable: ${isCurrentlyAutoApprovable}`);
    console.log(`Existing auto-approval review: ${existingReview ? 'Yes' : 'No'}`);

    if (action === 'synchronize') {
        // On sync, always dismiss existing auto-approval and re-evaluate
        if (existingReview) {
            console.log('🔄 PR synchronized, dismissing existing auto-approval...');
            await dismissAutoApprovalReview(github, context, existingReview, 'PR synchronized - re-evaluating after changes');
        }

        // Don't auto-approve immediately on sync - wait for tests to pass
        console.log('⏳ Waiting for tests to complete before re-evaluating auto-approval');
        return;
    }

    if (isCurrentlyAutoApprovable) {
        if (!existingReview) {
            console.log('🤖 Submitting new auto-approval review...');
            await submitAutoApprovalReview(github, context);
        } else {
            console.log('✅ Auto-approval review already exists, skipping');
        }
    } else {
        if (existingReview) {
            console.log('⚠️ Changes no longer auto-approvable, dismissing previous review...');
            await dismissAutoApprovalReview(github, context, existingReview, 'Changes now require manual review');
        } else {
            console.log('❌ Manual review required - no auto-approval');
        }
    }
}

/**
 * Re-evaluate auto-approval after tests pass
 * @param {Object} github - GitHub API client
 * @param {Object} context - GitHub context
 * @param {string} approvalOutputPath - Path to approval analysis output file
 */
export async function reEvaluateAfterTests(github, context, approvalOutputPath) {
    console.log('🧪 Tests completed, re-evaluating auto-approval...');

    if (!fs.existsSync(approvalOutputPath)) {
        console.log('❌ Approval analysis file not found for re-evaluation');
        return;
    }

    // Wait for cursor bug bot to finish running before proceeding
    console.log('⏳ Waiting for cursor bug bot to finish running before re-evaluation...');
    const cursorBotResult = await waitForCursorBugBot(github, context);

    if (!cursorBotResult.success) {
        if (cursorBotResult.hasIssues) {
            console.log('❌ Cursor bug bot found issues - blocking re-evaluation');
        } else {
            console.log('❌ Cursor bug bot did not finish within timeout, skipping re-evaluation');
        }
        return;
    }

    const approvalOutput = fs.readFileSync(approvalOutputPath, 'utf8');
    const isCurrentlyAutoApprovable = isAutoApprovable(approvalOutput);
    const existingReview = await getExistingAutoApprovalReview(github, context);

    if (isCurrentlyAutoApprovable) {
        if (!existingReview) {
            console.log('🤖 Tests passed and changes are auto-approvable, submitting review...');
            await submitAutoApprovalReview(github, context);
        } else {
            console.log('✅ Auto-approval review already exists after tests');
        }
    } else {
        console.log('❌ Changes still require manual review after tests');
    }
}

// CLI interface for direct script execution
if (import.meta.url === `file://${process.argv[1]}`) {
    const action = process.argv[2];
    const approvalOutputPath = process.argv[3];

    if (!action || !approvalOutputPath) {
        console.error('Usage: node auto-approval-handler.js <action> <approval-output-path>');
        console.error('Actions: opened, synchronize, re-evaluate');
        process.exit(1);
    }

    // This would be called from a GitHub Action context
    console.log(`Auto-approval handler called with action: ${action}`);
    console.log(`Approval output path: ${approvalOutputPath}`);
}
