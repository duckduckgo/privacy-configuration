import { expect } from 'chai';
import { getBaseFeatureConfigs } from '../util.js';

/**
 * Inject names that are shared by more than one platform.
 *
 * The Apple C-S-S bundles are built once and shipped to both iOS and macOS, so an Apple
 * inject name does not identify a single app: iOS and macOS version independently, and the
 * same version string means different releases on each. A base feature file applies to every
 * platform, so there is no version scheme a shared condition block could be written against.
 */
const MULTI_PLATFORM_INJECT_NAMES = [
    'apple',
    'apple-isolated',
    'apple-ai-clear',
    'apple-ai-history',
];

const VERSION_KEYS = [
    'minSupportedVersion',
    'maxSupportedVersion',
];

/**
 * Find every condition block that gates on both a multi-platform inject name and a version.
 *
 * Walks the whole feature rather than only `settings.conditionalChanges`, since condition
 * blocks also appear in nested settings and subfeature settings.
 *
 * @param {unknown} value
 * @param {string} path - JSON path of `value`, used in failure messages
 * @returns {string[]} paths of the offending condition blocks
 */
function findVersionedMultiPlatformConditions(value, path) {
    if (Array.isArray(value)) {
        return value.flatMap((item, index) => findVersionedMultiPlatformConditions(item, `${path}[${index}]`));
    }
    if (typeof value !== 'object' || value === null) {
        return [];
    }

    const block = /** @type {Record<string, unknown>} */ (value);
    const results = [];
    if (typeof block.injectName === 'string' && MULTI_PLATFORM_INJECT_NAMES.includes(block.injectName)) {
        const versionKey = VERSION_KEYS.find((key) => key in block);
        if (versionKey) {
            results.push(`${path} (injectName: "${block.injectName}", ${versionKey}: ${JSON.stringify(block[versionKey])})`);
        }
    }

    for (const [
        key,
        child,
    ] of Object.entries(block)) {
        results.push(...findVersionedMultiPlatformConditions(child, `${path}.${key}`));
    }
    return results;
}

describe('Base feature conditional changes', () => {
    it('must not combine a multi-platform injectName with a version gate', () => {
        const offenders = Object.entries(getBaseFeatureConfigs()).flatMap(
            ([
                featureName,
                feature,
            ]) => findVersionedMultiPlatformConditions(feature, featureName),
        );

        expect(offenders).to.deep.equal(
            [],
            `Condition blocks in features/ apply to every platform, so a version alongside a multi-platform ` +
                `injectName (${MULTI_PLATFORM_INJECT_NAMES.join(', ')}) is ambiguous — iOS and macOS version ` +
                `independently. Move the version gate into the platform override (e.g. overrides/ios-override.json, ` +
                `overrides/macos-override.json) instead:\n${offenders.join('\n')}`,
        );
    });
});
