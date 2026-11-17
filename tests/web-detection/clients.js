import { PLATFORM_INJECT_NAMES, applyConditionalChanges, compareVersions } from '../../scripts/config-conditions.mjs';
import { isPlainObject } from '../../util.js';
import { EXPERIMENT_METRIC_PARENTS } from '../../constants.js';

/**
 * @typedef {import('../../scripts/config-conditions.mjs').Platform} Platform
 * @typedef {import('../../scripts/config-conditions.mjs').Version} Version
 */

/**
 * The platform of each generated config, and the first app version carrying this release: the
 * `minSupportedVersion` of the entry in the platform override that applies to this release's clients.
 * The versions are placeholders no client reaches until the app release carrying that C-S-S is known.
 *
 * @type {Array<{ configs: RegExp, platform: Platform, version: Version }>}
 */
export const CLIENT_RELEASES = [
    { configs: /^v\d+\/android-config\.json$/, platform: 'android', version: 99990000 },
    { configs: /^v\d+\/windows-config\.json$/, platform: 'windows', version: '999.0.0' },
    { configs: /^v\d+\/ios-config\.json$/, platform: 'ios', version: '999.0.0' },
    { configs: /^v\d+\/macos-config\.json$/, platform: 'macos', version: '999.0.0' },
    { configs: /^v\d+\/extension(-[a-z0-9]+)?-config\.json$/, platform: 'extension', version: '9999.1.1' },
];

/** Subfeature states a client runs an experiment in, in some build. */
const EXPERIMENT_STATES = [
    'enabled',
    'internal',
    'preview',
];

/**
 * The content scope experiments a client at this version can be in, each holding every cohort: those
 * whose subfeature is on at or below the version.
 *
 * @param {Record<string, any>} configBody
 * @param {Version} version
 * @returns {Record<string, true>}
 */
function experimentsAt(configBody, version) {
    /** @type {Record<string, true>} */
    const cohorts = {};
    for (const [
        name,
        subfeature,
    ] of Object.entries(configBody.features?.contentScopeExperiments?.features ?? {})) {
        const min = subfeature.minSupportedVersion;
        if (!EXPERIMENT_STATES.includes(subfeature.state)) continue;
        if (min !== undefined && (typeof min !== typeof version || compareVersions(version, min) < 0)) continue;
        cohorts[name] = true;
    }
    return cohorts;
}

/**
 * The detectors each of a platform's inject names sees once `conditionalChanges` apply, with the
 * entries whose patch fails, which C-S-S skips.
 *
 * @param {Record<string, any>} configBody
 * @param {Platform} platform
 * @param {Version} version
 * @param {boolean} assumeUndecided - whether conditions on the page, frame or build hold, and every
 *   cohort of each experiment the client can be in, or the client is in no experiment
 * @returns {Array<{ label: string, injectName: string, assumeUndecided: boolean, detectors: Record<string, Record<string, any>>, failed: unknown[] }>}
 */
export function clientViews(configBody, platform, version, assumeUndecided) {
    const settings = configBody.features?.webDetection?.settings;
    if (!settings) return [];
    const cohorts = assumeUndecided ? experimentsAt(configBody, version) : {};
    return PLATFORM_INJECT_NAMES[platform].map((injectName) => {
        const view = applyConditionalChanges(settings, { injectName, version, cohorts, assumeUndecided });
        return {
            label: `${injectName} ${version}${assumeUndecided ? ' (any page, build and cohort)' : ''}`,
            injectName,
            assumeUndecided,
            detectors: view.settings.detectors ?? {},
            failed: view.failed,
        };
    });
}

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
    for (const parent of EXPERIMENT_METRIC_PARENTS) {
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

/**
 * An error when a breakage report runs the detector and no `breakageReportData` action writes to its
 * breakage entry.
 *
 * @param {Record<string, any>} detector
 * @param {string} path
 * @returns {string[]}
 */
export function breakageDataErrors(detector, path) {
    if (!runsOnBreakageReport(detector) || writesBreakageData(detector)) return [];
    return [
        `${path}: runs when a breakage report is made, since the \`breakageReport\` trigger is on unless set to "disabled" (on by default), but no \`breakageReportData\` action writes to its breakage entry; add one, or set \`triggers.breakageReport.state\` to "disabled"`,
    ];
}

/** `temp_` types are placeholders for detectors whose eventHub telemetry is not defined yet (for example, during experiments) */
export const TEMP_EVENT_TYPE_PREFIX = 'temp_';
