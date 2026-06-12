import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    assessDependabotMerge,
    detailsHost,
    isGeneratedConfigAutoApproved,
    latestCheckRunsByName,
    matchExpectedCheck,
    missingExpectedCheckNames,
} from './dependabot-gate.mjs';

const HEAD_SHA = 'abc123';

function cursorBugbotRun(extras = {}) {
    return {
        id: 1,
        name: 'Cursor Bugbot',
        head_sha: HEAD_SHA,
        status: 'completed',
        conclusion: 'success',
        app: { slug: 'cursor' },
        details_url: 'https://cursor.com/docs/bugbot',
        created_at: '2026-06-01T00:00:00Z',
        ...extras,
    };
}

describe('matchExpectedCheck / latestCheckRunsByName', () => {
    it('accepts only trusted Cursor Bugbot check runs', () => {
        const run = cursorBugbotRun();
        assert.ok(matchExpectedCheck(run));
        assert.equal(latestCheckRunsByName([run]).length, 1);
    });

    it('rejects spoofed Bugbot runs from other apps or hosts', () => {
        assert.equal(matchExpectedCheck(cursorBugbotRun({ app: { slug: 'evil-app' } })), null);
        assert.equal(matchExpectedCheck(cursorBugbotRun({ details_url: 'https://evil.example.com/bugbot' })), null);
        assert.equal(latestCheckRunsByName([cursorBugbotRun({ app: { slug: 'evil-app' } })]).length, 0);
    });

    it('tracks missing expected checks', () => {
        assert.deepEqual(missingExpectedCheckNames([]), ['Cursor Bugbot']);
        assert.deepEqual(missingExpectedCheckNames([cursorBugbotRun()]), []);
    });
});

describe('isGeneratedConfigAutoApproved', () => {
    it('detects the existing JSON approval analysis marker', () => {
        assert.equal(isGeneratedConfigAutoApproved('## 🎯 OVERALL APPROVAL STATUS\n**✅ AUTO-APPROVED**'), true);
        assert.equal(isGeneratedConfigAutoApproved('**❌ MANUAL REVIEW REQUIRED**'), false);
    });
});

describe('assessDependabotMerge', () => {
    it('approves when Bugbot succeeds and built config output is unchanged', () => {
        const decision = assessDependabotMerge({
            bugbotRuns: [cursorBugbotRun()],
            configApprovalOutput: '**✅ AUTO-APPROVED**',
        });
        assert.equal(decision.safe_to_merge, true);
    });

    it('declines when Bugbot failed', () => {
        const decision = assessDependabotMerge({
            bugbotRuns: [cursorBugbotRun({ conclusion: 'failure' })],
            configApprovalOutput: '**✅ AUTO-APPROVED**',
        });
        assert.equal(decision.safe_to_merge, false);
        assert.match(decision.reason, /Bugbot/);
    });

    it('declines when built config output changed', () => {
        const decision = assessDependabotMerge({
            bugbotRuns: [cursorBugbotRun()],
            configApprovalOutput: '**❌ MANUAL REVIEW REQUIRED**',
        });
        assert.equal(decision.safe_to_merge, false);
        assert.match(decision.reason, /Built config output differs/);
    });
});

describe('detailsHost', () => {
    it('returns null for invalid URLs', () => {
        assert.equal(detailsHost('not-a-url'), null);
        assert.equal(detailsHost('https://cursor.com/docs/bugbot'), 'cursor.com');
    });
});
