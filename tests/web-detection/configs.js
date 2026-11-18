// @ts-check
import fs from 'fs';
import { immutableJSONPatch } from 'immutable-json-patch';
import platforms from '../../platforms.js';
import { CURRENT_CONFIG_VERSION } from '../../constants.js';
import { NAME_PATTERN } from './validator/grammar.js';
import { CLIENT_RELEASES, clientViews } from './clients.js';

/**
 * @typedef {{ label: string, detectors: Record<string, Record<string, Record<string, any>>>, failed?: unknown[] }} DetectorView
 */

/**
 * The client views, one for each distinct set of detectors, labelled with every client state that
 * sees it, and with the entries that fail in any of those states.
 *
 * @param {ReturnType<typeof clientViews>} views
 * @returns {DetectorView[]}
 */
function distinctViews(views) {
    /** @type {Map<string, { labels: string[], detectors: DetectorView['detectors'], failed: Set<string> }>} */
    const distinct = new Map();
    for (const { label, detectors, failed } of views) {
        const key = JSON.stringify(detectors);
        let entry = distinct.get(key);
        if (!entry) {
            entry = { labels: [], detectors, failed: new Set() };
            distinct.set(key, entry);
        }
        entry.labels.push(label);
        for (const change of failed) entry.failed.add(JSON.stringify(change));
    }
    return [
        ...distinct.values(),
    ].map(({ labels, detectors, failed }) => ({
        label: labels.join('; '),
        detectors,
        failed: [
            ...failed,
        ].map((change) => JSON.parse(change)),
    }));
}

const platformOutput = platforms.map((item) => item.replace('browsers/', 'extension-'));

export const latestConfigs = platformOutput.map((plat) => {
    return {
        name: `v${CURRENT_CONFIG_VERSION}/${plat}-config.json`,
        body: JSON.parse(fs.readFileSync(`./generated/v${CURRENT_CONFIG_VERSION}/${plat}-config.json`, 'utf8')),
    };
});

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
 * The detectors each `conditionalChanges` patch list touches, as the list leaves them. Each list is
 * applied on its own, to the literal settings.
 *
 * @param {import('../../schema/features/web-detection').WebDetectionFeature<number>} webDetection
 * @returns {DetectorView[]}
 */
export function patchedViews(webDetection) {
    const settings = /** @type {Record<string, any>} */ (webDetection.settings);
    const lists = (settings.conditionalChanges ?? []).map((/** @type {Record<string, any>} */ entry, /** @type {number} */ index) => ({
        label: `conditionalChanges[${index}]`,
        operations: entry.patchSettings ?? [],
    }));
    /** @type {DetectorView[]} */
    const views = [];
    for (const { label, operations } of lists) {
        if (!operations.length) continue;
        const patched = /** @type {Record<string, any>} */ (immutableJSONPatch(settings, operations)).detectors ?? {};
        /** @type {DetectorView['detectors']} */
        const detectors = {};
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
                    ? Object.keys(patched)
                    : [
                          group,
                      ]) {
                    for (const detectorName of name === undefined
                        ? Object.keys(patched[groupName] ?? {})
                        : [
                              name,
                          ]) {
                        const detector = patched[groupName]?.[detectorName];
                        if (detector) (detectors[groupName] ??= {})[detectorName] = detector;
                    }
                }
            }
        }
        views.push({ label, detectors });
    }
    return views;
}

/**
 * Every view of a generated config's detectors a client can see: the literal detectors, those each
 * patch list touches, and each platform client's at this release in each state of the page, frame,
 * build and cohorts that decides a condition.
 *
 * @param {{ name: string, body: Record<string, any> }} config
 * @returns {DetectorView[]}
 */
export function detectorViews(config) {
    const webDetection = config.body.features?.webDetection;
    if (!webDetection?.settings?.detectors) return [];
    const release = CLIENT_RELEASES.find((entry) => entry.configs.test(config.name));
    return [
        { label: 'detectors', detectors: webDetection.settings.detectors },
        ...patchedViews(webDetection),
        ...(release ? distinctViews(clientViews(config.body, release.platform, release.version)) : []),
    ];
}

/**
 * The errors a check gives on every detector of the views, each once, with the first view it
 * appears in. A detector the same in several views is checked once.
 *
 * @param {DetectorView[]} views
 * @param {(detector: Record<string, any>, path: string) => string[]} check
 * @returns {string[]}
 */
export function viewErrors(views, check) {
    /** @type {Map<string, string>} */
    const errors = new Map();
    /** @type {Set<string>} */
    const checked = new Set();
    for (const { label, detectors } of views) {
        for (const [
            groupName,
            group,
        ] of Object.entries(detectors)) {
            for (const [
                detectorId,
                detector,
            ] of Object.entries(group)) {
                const path = `detectors.${groupName}.${detectorId}`;
                const key = `${path} ${JSON.stringify(detector)}`;
                if (checked.has(key)) continue;
                checked.add(key);
                for (const error of check(detector, path)) {
                    if (!errors.has(error)) errors.set(error, label);
                }
            }
        }
    }
    return [
        ...errors,
    ].map(
        ([
            error,
            label,
        ]) => `${label}: ${error}`,
    );
}

/**
 * Group and detector names that do not match `NAME_PATTERN`, in the literal settings and in each detector a
 * patch list adds or changes. C-S-S runs a detector under whatever name config gives it.
 *
 * @param {import('../../schema/features/web-detection').WebDetectionFeature<number>} webDetection
 * @returns {string[]}
 */
export function detectorNameErrors(webDetection) {
    const errors = new Set();
    /**
     * @param {string} groupName
     * @param {string[]} detectorNames
     * @param {string} label
     */
    const check = (groupName, detectorNames, label) => {
        if (!NAME_PATTERN.test(groupName)) errors.add(`${label}: group name "${groupName}" does not match ${NAME_PATTERN}`);
        for (const name of detectorNames) {
            if (!NAME_PATTERN.test(name)) errors.add(`${label}: detector name "${groupName}.${name}" does not match ${NAME_PATTERN}`);
        }
    };
    for (const [
        groupName,
        group,
    ] of Object.entries(webDetection.settings?.detectors ?? {})) {
        check(groupName, Object.keys(group), 'detectors');
    }
    for (const { label, detectors } of patchedViews(webDetection)) {
        for (const [
            groupName,
            group,
        ] of Object.entries(detectors)) {
            for (const name of Object.keys(group)) {
                check(
                    groupName,
                    [
                        name,
                    ],
                    `${label} detectors.${groupName}.${name}`,
                );
            }
        }
    }
    return [
        ...errors,
    ];
}
