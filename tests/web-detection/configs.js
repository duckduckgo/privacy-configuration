import fs from 'fs';
import { immutableJSONPatch } from 'immutable-json-patch';
import platforms from '../../platforms.js';
import { CURRENT_CONFIG_VERSION } from '../../constants.js';

const platformOutput = platforms.map((item) => item.replace('browsers/', 'extension-'));

export const latestConfigs = platformOutput.map((plat) => {
    return {
        name: `v${CURRENT_CONFIG_VERSION}/${plat}-config.json`,
        body: JSON.parse(fs.readFileSync(`./generated/v${CURRENT_CONFIG_VERSION}/${plat}-config.json`)),
    };
});

/**
 * Invoke `cb` for every patch operation the feature can apply, from either the
 * per-domain or the conditional lists.
 *
 * @param {import('../../schema/features/web-detection').WebDetectionFeature<number>} webDetection
 * @param {(operation: Record<string, any>, path: string) => void} cb
 */
export function forEachPatchOperation(webDetection, cb) {
    const settings = /** @type {Record<string, any>} */ (webDetection.settings);
    for (const [
        index,
        entry,
    ] of (settings.domains ?? []).entries()) {
        for (const operation of entry.patchSettings ?? []) {
            cb(operation, `domains[${index}] (${entry.domain})`);
        }
    }
    for (const [
        index,
        entry,
    ] of (settings.conditionalChanges ?? []).entries()) {
        for (const operation of entry.patchSettings ?? []) {
            cb(operation, `conditionalChanges[${index}]`);
        }
    }
}

/**
 * Iterate every generated config that has a webDetection feature with detectors.
 *
 * @param {(ctx: {
 *   configName: string,
 *   webDetection: import('../../schema/features/web-detection').WebDetectionFeature<number>,
 *   detectors: NonNullable<import('../../schema/features/web-detection').WebDetectionSettings['detectors']>,
 * }) => void} cb
 */
export function forEachWebDetectionConfig(cb) {
    for (const config of latestConfigs) {
        const webDetection = /** @type {import('../../schema/features/web-detection').WebDetectionFeature<number> | undefined} */ (
            config.body.features?.webDetection
        );
        if (!webDetection?.settings?.detectors) continue;
        cb({ configName: config.name, webDetection, detectors: webDetection.settings.detectors });
    }
}

/**
 * JSON pointer segments of a patch path under `/detectors`.
 *
 * @param {string} pointer
 * @returns {string[]}
 */
function detectorPointer(pointer) {
    const segments = pointer
        .split('/')
        .slice(1)
        .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
    return segments[0] === 'detectors' ? segments.slice(1, 3) : [];
}

/**
 * Invoke `cb` for each detector a patch list touches, as the patch leaves it. Each list is
 * applied on its own, to the literal settings.
 *
 * @param {import('../../schema/features/web-detection').WebDetectionFeature<number>} webDetection
 * @param {(detector: Record<string, any>, path: string) => void} cb
 */
export function forEachPatchedDetector(webDetection, cb) {
    const settings = /** @type {Record<string, any>} */ (webDetection.settings);
    const lists = [
        ...(settings.domains ?? []).map((/** @type {Record<string, any>} */ entry, /** @type {number} */ index) => ({
            label: `domains[${index}] (${entry.domain})`,
            operations: entry.patchSettings ?? [],
        })),
        ...(settings.conditionalChanges ?? []).map((/** @type {Record<string, any>} */ entry, /** @type {number} */ index) => ({
            label: `conditionalChanges[${index}]`,
            operations: entry.patchSettings ?? [],
        })),
    ];
    for (const { label, operations } of lists) {
        if (!operations.length) continue;
        const patched = /** @type {Record<string, any>} */ (immutableJSONPatch(settings, operations));
        const detectors = patched.detectors ?? {};
        const touched = new Set();
        for (const operation of operations) {
            for (const pointer of [
                operation.path,
                operation.from,
            ]) {
                if (typeof pointer !== 'string' || !pointer.startsWith('/detectors')) continue;
                const [
                    group,
                    name,
                ] = detectorPointer(pointer);
                for (const groupName of group === undefined
                    ? Object.keys(detectors)
                    : [
                          group,
                      ]) {
                    for (const detectorName of name === undefined
                        ? Object.keys(detectors[groupName] ?? {})
                        : [
                              name,
                          ]) {
                        if (detectors[groupName]?.[detectorName]) touched.add(`${groupName}\u0000${detectorName}`);
                    }
                }
            }
        }
        for (const key of touched) {
            const [
                group,
                name,
            ] = key.split('\u0000');
            cb(detectors[group][name], `${label} detectors.${group}.${name}`);
        }
    }
}
