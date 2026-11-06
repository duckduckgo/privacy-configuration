import { expect } from 'chai';
import { changedRolloutSteps } from '../scripts/check-rollout-steps.mjs';

/**
 * @param {Record<string, unknown[]>} subfeatures - rollout steps by subfeature name
 */
function config(subfeatures) {
    return {
        features: {
            history: {
                state: 'enabled',
                features: Object.fromEntries(
                    Object.entries(subfeatures).map(
                        ([
                            name,
                            steps,
                        ]) => [
                            name,
                            { state: 'enabled', rollout: { steps } },
                        ],
                    ),
                ),
            },
        },
    };
}

describe('check-rollout-steps', () => {
    const base = config({
        onByDefault: [
            { percent: 10 },
            { percent: 25 },
        ],
    });

    it('passes appended steps', () => {
        expect(
            changedRolloutSteps(
                base,
                config({
                    onByDefault: [
                        { percent: 10 },
                        { percent: 25 },
                        { percent: 100 },
                    ],
                }),
            ),
        ).to.deep.equal([]);
    });

    it('fails an edited step', () => {
        expect(
            changedRolloutSteps(
                base,
                config({
                    onByDefault: [
                        { percent: 10 },
                        { percent: 50 },
                    ],
                }),
            ),
        ).to.deep.equal([
            '/features/history/features/onByDefault/rollout: step 2 changed from {"percent":25} to {"percent":50}',
        ]);
    });

    it('fails a removed step', () => {
        expect(
            changedRolloutSteps(
                base,
                config({
                    onByDefault: [
                        { percent: 10 },
                    ],
                }),
            ),
        ).to.deep.equal([
            '/features/history/features/onByDefault/rollout: step 2 ({"percent":25}) removed',
        ]);
    });

    it('passes a removed subfeature and a new rollout', () => {
        expect(
            changedRolloutSteps(
                base,
                config({
                    other: [
                        { percent: 5 },
                    ],
                }),
            ),
        ).to.deep.equal([]);
    });
});
