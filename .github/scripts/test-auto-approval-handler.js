#!/usr/bin/env node

import fs from 'fs';
import { handleAutoApproval, reEvaluateAfterTests } from './auto-approval-handler.js';

// Mock GitHub API client and context for testing
const mockGithub = {
    rest: {
        pulls: {
            listReviews: async () => ({
                data: [
                    {
                        id: 123,
                        user: { login: 'github-actions[bot]' },
                        state: 'APPROVED',
                        body: '🤖 **Auto-approved**: This PR contains only auto-approvable changes to feature domains/exceptions. No manual review required.'
                    }
                ]
            }),
            createReview: async (params) => {
                console.log('Mock createReview called with:', params);
                return { data: { id: 456 } };
            },
            dismissReview: async (params) => {
                console.log('Mock dismissReview called with:', params);
                return { data: { id: params.review_id } };
            }
        }
    }
};

const mockContext = {
    repo: { owner: 'test-owner', repo: 'test-repo' },
    payload: { pull_request: { number: 123 } }
};

// Test data
const autoApprovableOutput = `
## 🎯 OVERALL APPROVAL STATUS
**✅ AUTO-APPROVED**
`;

const manualReviewOutput = `
## 🎯 OVERALL APPROVAL STATUS
**❌ MANUAL REVIEW REQUIRED**
`;

// Test functions
async function testAutoApproval() {
    console.log('🧪 Testing auto-approval functionality...\n');
    
    // Test 1: Auto-approvable PR on open
    console.log('Test 1: Auto-approvable PR on open');
    fs.writeFileSync('test_approval.txt', autoApprovableOutput);
    await handleAutoApproval(mockGithub, mockContext, 'test_approval.txt', 'opened');
    console.log('');
    
    // Test 2: Manual review required PR on open
    console.log('Test 2: Manual review required PR on open');
    fs.writeFileSync('test_approval.txt', manualReviewOutput);
    await handleAutoApproval(mockGithub, mockContext, 'test_approval.txt', 'opened');
    console.log('');
    
    // Test 3: Auto-approvable PR on synchronize
    console.log('Test 3: Auto-approvable PR on synchronize');
    fs.writeFileSync('test_approval.txt', autoApprovableOutput);
    await handleAutoApproval(mockGithub, mockContext, 'test_approval.txt', 'synchronize');
    console.log('');
    
    // Test 4: Re-evaluation after tests
    console.log('Test 4: Re-evaluation after tests');
    fs.writeFileSync('test_approval.txt', autoApprovableOutput);
    await reEvaluateAfterTests(mockGithub, mockContext, 'test_approval.txt');
    console.log('');
    
    // Cleanup
    fs.unlinkSync('test_approval.txt');
    console.log('✅ All tests completed');
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testAutoApproval().catch(console.error);
} 