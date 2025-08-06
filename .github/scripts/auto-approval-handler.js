#!/usr/bin/env node

import fs from 'fs';
import { execSync } from 'child_process';

/**
 * Auto-approval handler for privacy configuration PRs
 * 
 * This script handles:
 * - Auto-approving PRs that only contain auto-approvable changes
 * - Revoking auto-approvals when PR is synced (new commits added)
 * - Re-approving after tests pass if still auto-approvable
 */

const AUTO_APPROVAL_MARKER = '🤖 **Auto-approved**';
const AUTO_APPROVAL_DISMISSED_MARKER = '🤖 **Auto-approval dismissed**';

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
            pull_number: context.payload.pull_request.number
        });
        
        return reviews.data.find(review => 
            review.user.login === 'github-actions[bot]' && 
            review.state === 'APPROVED' &&
            review.body && review.body.includes(AUTO_APPROVAL_MARKER)
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
            comments: []
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
            message: `${AUTO_APPROVAL_DISMISSED_MARKER}: ${reason}`
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
            await dismissAutoApprovalReview(
                github, 
                context, 
                existingReview, 
                'PR synchronized - re-evaluating after changes'
            );
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
            await dismissAutoApprovalReview(
                github, 
                context, 
                existingReview, 
                'Changes now require manual review'
            );
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