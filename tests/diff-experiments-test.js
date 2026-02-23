import { expect } from 'chai';
import { diffManifests, getPixelRelevantChanges } from '../scripts/diff-experiments.mjs';

describe('diff-experiments', () => {
    const emptyManifest = {
        extractedAt: '2026-01-01',
        source: 'test',
        platforms: {
            android: { nativeExperiments: [], contentScopeExperiments: [] },
            ios: { nativeExperiments: [], contentScopeExperiments: [] },
        },
    };

    describe('diffManifests', () => {
        it('should detect added experiments', () => {
            const head = {
                ...emptyManifest,
                platforms: {
                    android: {
                        nativeExperiments: [{ name: 'newExp', state: 'enabled', rolloutPercent: 10, cohorts: ['control', 'treatment'] }],
                        contentScopeExperiments: [],
                    },
                    ios: { nativeExperiments: [], contentScopeExperiments: [] },
                },
            };

            const diff = diffManifests(emptyManifest, head);
            expect(diff.summary.added).to.equal(1);
            expect(diff.changes[0].changeType).to.equal('added');
            expect(diff.changes[0].name).to.equal('newExp');
            expect(diff.changes[0].platform).to.equal('android');
        });

        it('should detect removed experiments', () => {
            const base = {
                ...emptyManifest,
                platforms: {
                    android: {
                        nativeExperiments: [{ name: 'oldExp', state: 'enabled', rolloutPercent: 50, cohorts: ['control'] }],
                        contentScopeExperiments: [],
                    },
                    ios: { nativeExperiments: [], contentScopeExperiments: [] },
                },
            };

            const diff = diffManifests(base, emptyManifest);
            expect(diff.summary.removed).to.equal(1);
            expect(diff.changes[0].changeType).to.equal('removed');
        });

        it('should detect state changes', () => {
            const base = {
                ...emptyManifest,
                platforms: {
                    android: {
                        nativeExperiments: [{ name: 'exp1', state: 'disabled', rolloutPercent: null, cohorts: [] }],
                        contentScopeExperiments: [],
                    },
                    ios: { nativeExperiments: [], contentScopeExperiments: [] },
                },
            };
            const head = {
                ...emptyManifest,
                platforms: {
                    android: {
                        nativeExperiments: [{ name: 'exp1', state: 'enabled', rolloutPercent: null, cohorts: [] }],
                        contentScopeExperiments: [],
                    },
                    ios: { nativeExperiments: [], contentScopeExperiments: [] },
                },
            };

            const diff = diffManifests(base, head);
            expect(diff.summary.modified).to.equal(1);
            const change = diff.changes.find((c) => c.changeType === 'state_changed');
            expect(change).to.exist;
            expect(change.before.state).to.equal('disabled');
            expect(change.after.state).to.equal('enabled');
        });

        it('should detect rollout increases', () => {
            const base = {
                ...emptyManifest,
                platforms: {
                    android: {
                        nativeExperiments: [],
                        contentScopeExperiments: [{ name: 'cssExp', state: 'enabled', rolloutPercent: 10, cohorts: ['control'] }],
                    },
                    ios: { nativeExperiments: [], contentScopeExperiments: [] },
                },
            };
            const head = {
                ...emptyManifest,
                platforms: {
                    android: {
                        nativeExperiments: [],
                        contentScopeExperiments: [{ name: 'cssExp', state: 'enabled', rolloutPercent: 50, cohorts: ['control'] }],
                    },
                    ios: { nativeExperiments: [], contentScopeExperiments: [] },
                },
            };

            const diff = diffManifests(base, head);
            const change = diff.changes.find((c) => c.changeType === 'rollout_increased');
            expect(change).to.exist;
            expect(change.before.rolloutPercent).to.equal(10);
            expect(change.after.rolloutPercent).to.equal(50);
        });

        it('should detect cohort changes', () => {
            const base = {
                ...emptyManifest,
                platforms: {
                    android: {
                        nativeExperiments: [{ name: 'exp1', state: 'enabled', rolloutPercent: 10, cohorts: ['control'] }],
                        contentScopeExperiments: [],
                    },
                    ios: { nativeExperiments: [], contentScopeExperiments: [] },
                },
            };
            const head = {
                ...emptyManifest,
                platforms: {
                    android: {
                        nativeExperiments: [{ name: 'exp1', state: 'enabled', rolloutPercent: 10, cohorts: ['control', 'treatment'] }],
                        contentScopeExperiments: [],
                    },
                    ios: { nativeExperiments: [], contentScopeExperiments: [] },
                },
            };

            const diff = diffManifests(base, head);
            const change = diff.changes.find((c) => c.changeType === 'cohorts_changed');
            expect(change).to.exist;
        });

        it('should handle identical manifests with no changes', () => {
            const diff = diffManifests(emptyManifest, emptyManifest);
            expect(diff.changes).to.deep.equal([]);
            expect(diff.summary).to.deep.equal({ added: 0, removed: 0, modified: 0 });
        });

        it('should handle new platform in head', () => {
            const head = {
                ...emptyManifest,
                platforms: {
                    ...emptyManifest.platforms,
                    windows: {
                        nativeExperiments: [{ name: 'winExp', state: 'enabled', rolloutPercent: 100, cohorts: ['control'] }],
                        contentScopeExperiments: [],
                    },
                },
            };

            const diff = diffManifests(emptyManifest, head);
            expect(diff.summary.added).to.equal(1);
            expect(diff.changes[0].platform).to.equal('windows');
        });
    });

    describe('getPixelRelevantChanges', () => {
        it('should flag added experiments', () => {
            const diff = {
                changes: [
                    { platform: 'android', type: 'nativeExperiment', name: 'newExp', changeType: 'added', after: {} },
                    { platform: 'android', type: 'nativeExperiment', name: 'oldExp', changeType: 'removed', before: {} },
                ],
                summary: { added: 1, removed: 1, modified: 0 },
            };

            const relevant = getPixelRelevantChanges(diff);
            expect(relevant).to.have.lengthOf(1);
            expect(relevant[0].changeType).to.equal('added');
        });

        it('should flag state changes to enabled', () => {
            const diff = {
                changes: [
                    {
                        platform: 'ios',
                        type: 'contentScopeExperiment',
                        name: 'exp1',
                        changeType: 'state_changed',
                        before: { state: 'disabled' },
                        after: { state: 'enabled' },
                    },
                    {
                        platform: 'ios',
                        type: 'contentScopeExperiment',
                        name: 'exp2',
                        changeType: 'state_changed',
                        before: { state: 'enabled' },
                        after: { state: 'disabled' },
                    },
                ],
                summary: { added: 0, removed: 0, modified: 2 },
            };

            const relevant = getPixelRelevantChanges(diff);
            expect(relevant).to.have.lengthOf(1);
            expect(relevant[0].name).to.equal('exp1');
        });

        it('should flag rollout increases', () => {
            const diff = {
                changes: [
                    { changeType: 'rollout_increased', platform: 'android', type: 'nativeExperiment', name: 'exp', before: {}, after: {} },
                    { changeType: 'rollout_decreased', platform: 'android', type: 'nativeExperiment', name: 'exp2', before: {}, after: {} },
                ],
                summary: { added: 0, removed: 0, modified: 2 },
            };

            const relevant = getPixelRelevantChanges(diff);
            expect(relevant).to.have.lengthOf(1);
            expect(relevant[0].changeType).to.equal('rollout_increased');
        });
    });
});
