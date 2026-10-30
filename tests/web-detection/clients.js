import { immutableJSONPatch } from 'immutable-json-patch';
import { asArray, isPlainObject } from './validator/walk.js';

/**
 * The clients of each generated config, and the first app version carrying this release: the
 * `minSupportedVersion` of the entry in the platform override that applies to this release's clients.
 * Both are placeholders no client reaches until the app release carrying that C-S-S is known.
 *
 * @type {Array<{ configs: RegExp, injectNames: string[], version: number | string }>}
 */
export const CLIENT_RELEASES = [
    {
        configs: /^v\d+\/android-config\.json$/,
        injectNames: [
            'android',
            'android-adsjs',
        ],
        version: 99990000,
    },
    {
        configs: /^v\d+\/windows-config\.json$/,
        injectNames: [
            'windows',
        ],
        version: '999.0.0',
    },
    {
        configs: /^v\d+\/(ios|macos)-config\.json$/,
        injectNames: [
            'apple',
            'apple-isolated',
        ],
        version: '999.0.0',
    },
    {
        configs: /^v\d+\/extension(-[a-z0-9]+)?-config\.json$/,
        injectNames: [
            'chrome-mv3',
            'chrome',
            'firefox',
        ],
        version: '9999.1.1',
    },
];

/**
 * Compare app versions as C-S-S does: numbers numerically, strings by dotted components.
 *
 * @param {number | string} a
 * @param {number | string} b
 * @returns {number | undefined} negative, 0 or positive; undefined when the kinds differ
 */
export function compareVersions(a, b) {
    if (typeof a !== typeof b) return undefined;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    const left = String(a).split('.').map(Number);
    const right = String(b).split('.').map(Number);
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
        const difference = (left[index] ?? 0) - (right[index] ?? 0);
        if (difference !== 0) return difference;
    }
    return 0;
}

/**
 * The detectors a client sees once `conditionalChanges` apply: each entry applies when one of its
 * condition blocks holds. `injectName` and the version keys are decided by the client, and every
 * other key by `others`.
 *
 * @param {Record<string, any>} settings - webDetection settings
 * @param {string[]} injectNames
 * @param {number | string} version
 * @param {boolean} others - whether condition keys a client's platform and version do not decide hold
 * @returns {Record<string, Record<string, any>>}
 */
export function clientDetectors(settings, injectNames, version, others) {
    /**
     * @param {Record<string, any>} block
     */
    const holds = (block) =>
        Object.entries(block).every(
            ([
                key,
                value,
            ]) => {
                if (key === 'injectName') return injectNames.includes(value);
                if (key === 'minSupportedVersion') return (compareVersions(version, value) ?? -1) >= 0;
                if (key === 'maxSupportedVersion') return (compareVersions(version, value) ?? 1) <= 0;
                return others;
            },
        );
    let view = { detectors: settings.detectors };
    for (const entry of settings.conditionalChanges ?? []) {
        if (asArray(entry.condition).some(holds)) view = /** @type {any} */ (immutableJSONPatch(view, entry.patchSettings));
    }
    return view.detectors ?? {};
}

// Features whose subfeatures may declare experiment metrics that consume events
// (see tests/experiment-metrics-tests.js).
const METRIC_PARENTS = [
    'contentScopeExperiments',
    'blockList',
    'contentBlocking',
];

/**
 * Event types something in a config consumes: counter and data `source`s, the `trigger.source`
 * of immediate telemetry entries, and experiment metric events.
 *
 * @param {Record<string, any> | undefined} configBody
 * @returns {Set<string>}
 */
export function eventHubConsumers(configBody) {
    const telemetry = /** @type {import('../../schema/features/event-hub').EventHubFeature<number> | undefined} */ (
        configBody?.features?.eventHub
    )?.settings.telemetry;
    const consumers = new Set();
    for (const entry of Object.values(telemetry ?? {})) {
        for (const param of Object.values(entry.parameters)) {
            if ('source' in param && param.source) consumers.add(param.source);
        }
        if ('source' in entry.trigger && entry.trigger.source) consumers.add(entry.trigger.source);
    }
    for (const parent of METRIC_PARENTS) {
        for (const subFeature of Object.values(configBody?.features?.[parent]?.features ?? {})) {
            for (const metric of Object.values(/** @type {Record<string, any>} */ (subFeature)?.settings?.metrics ?? {})) {
                if (typeof metric?.event === 'string') consumers.add(metric.event);
            }
        }
    }
    return consumers;
}

/**
 * The event types a detector's `fireEvent` actions send, wherever they sit in `actions`.
 *
 * @param {Record<string, any>} detector
 * @returns {string[]}
 */
export function fireEventTypes(detector) {
    /** @type {string[]} */
    const types = [];
    /**
     * @param {unknown} node
     */
    const visit = (node) => {
        if (Array.isArray(node)) node.forEach(visit);
        else if (isPlainObject(node)) {
            if (isPlainObject(node.fireEvent) && typeof node.fireEvent.type === 'string') types.push(node.fireEvent.type);
            Object.values(node).forEach(visit);
        }
    };
    visit(detector.actions);
    return [
        ...new Set(types),
    ];
}

/**
 * Whether any `breakageReportData` action sits in a detector's `actions`, in branches and sequences.
 *
 * @param {Record<string, any>} detector
 * @returns {boolean}
 */
export function writesBreakageData(detector) {
    /**
     * @param {unknown} node
     * @returns {boolean}
     */
    const visit = (node) => {
        if (Array.isArray(node)) return node.some(visit);
        if (!isPlainObject(node)) return false;
        return 'breakageReportData' in node || Object.values(node).some(visit);
    };
    return visit(detector.actions);
}

/**
 * Whether a breakage report can run the detector: neither the detector nor its `breakageReport`
 * trigger is disabled. The trigger is enabled when the config omits it, and run conditions only
 * narrow where it runs.
 *
 * @param {Record<string, any>} detector
 * @returns {boolean}
 */
export function runsOnBreakageReport(detector) {
    return detector.state !== 'disabled' && detector.triggers?.breakageReport?.state !== 'disabled';
}

/** `temp_` types are placeholders for detectors whose eventHub telemetry is not defined yet (for example, during experiments) */
export const TEMP_EVENT_TYPE_PREFIX = 'temp_';
