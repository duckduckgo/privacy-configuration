import { createRequire } from 'module';
import { expect } from 'chai';

const require = createRequire(import.meta.url);
const { TEAMS, extractManualReviewSection, getTeamsRequiringReview, formatNotificationText } = require('../.github/scripts/mattermost-notify.cjs');

describe('mattermost-notify', () => {
    describe('extractManualReviewSection', () => {
        it('extracts content between Manual Review Required and next heading', () => {
            const body = '## ❌ Manual Review Required\nwindows-config.json changed\n## Auto-Approved\nall good';
            const section = extractManualReviewSection(body);
            expect(section).to.include('windows-config.json');
            expect(section).to.not.include('Auto-Approved');
        });

        it('extracts content when Manual Review Required is the last section', () => {
            const body = '## Auto-Approved\nsome stuff\n## ❌ Manual Review Required\nandroid-config.json changed';
            expect(extractManualReviewSection(body)).to.include('android-config.json');
        });

        it('returns null when no Manual Review Required section exists', () => {
            expect(extractManualReviewSection('## Auto-Approved\nall good')).to.be.null;
        });

        it('returns null for empty string', () => {
            expect(extractManualReviewSection('')).to.be.null;
        });
    });

    describe('getTeamsRequiringReview', () => {
        it('matches single team by string pattern', () => {
            const teams = getTeamsRequiringReview('changes to windows-config.json');
            expect(teams).to.have.lengthOf(1);
            expect(teams[0].name).to.equal('Windows');
        });

        it('matches multiple teams', () => {
            const teams = getTeamsRequiringReview('windows-config.json and ios-config.json both changed');
            const names = teams.map((t) => t.name);
            expect(names).to.include('Windows');
            expect(names).to.include('iOS');
            expect(names).to.not.include('Android');
        });

        it('matches Extensions by regex pattern', () => {
            const teams = getTeamsRequiringReview('extension-config.json changed');
            expect(teams.map((t) => t.name)).to.include('Extensions');
        });

        it('matches Extensions with platform suffix', () => {
            const teams = getTeamsRequiringReview('extension-mv3-config.json changed');
            expect(teams.map((t) => t.name)).to.include('Extensions');
        });

        it('returns empty array when no teams match', () => {
            expect(getTeamsRequiringReview('nothing relevant here')).to.have.lengthOf(0);
        });

        it('matches all teams when all configs present', () => {
            const section = [
                'windows-config.json',
                'android-config.json',
                'ios-config.json',
                'macos-config.json',
                'extension-config.json',
            ].join('\n');
            expect(getTeamsRequiringReview(section)).to.have.lengthOf(TEAMS.length);
        });
    });

    describe('formatNotificationText', () => {
        const mockPr = { user: { login: 'testuser' }, title: 'Fix breakage on example.com', number: 42, html_url: 'https://github.com/org/repo/pull/42' };

        it('includes team emoji', () => {
            const text = formatNotificationText(TEAMS[0], mockPr);
            expect(text).to.include(':windows:');
        });

        it('includes PR author login', () => {
            const text = formatNotificationText(TEAMS[0], mockPr);
            expect(text).to.include('testuser');
        });

        it('wraps PR title in backticks', () => {
            const text = formatNotificationText(TEAMS[0], mockPr);
            expect(text).to.include('`Fix breakage on example.com`');
        });

        it('includes PR number and URL', () => {
            const text = formatNotificationText(TEAMS[0], mockPr);
            expect(text).to.include('#42');
            expect(text).to.include('https://github.com/org/repo/pull/42');
        });
    });
});
