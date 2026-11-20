// @ts-check
import {
    PLATFORM_INJECT_NAMES,
    applyConditionalChanges,
    compareVersions,
    conditionBlocks,
    conditionalEntries,
    entryCondition,
} from '../../scripts/config-conditions.mjs';
import { isPlainObject } from '../../util.js';
import { EXPERIMENT_METRIC_PARENTS } from '../../constants.js';

/**
 * @typedef {import('../../scripts/config-conditions.mjs').Platform} Platform
 * @typedef {import('../../scripts/config-conditions.mjs').Version} Version
 * @typedef {import('../../scripts/config-conditions.mjs').Client} Client
 * @typedef {import('../../scripts/config-conditions.mjs').ConditionBlock} ConditionBlock
 * @typedef {Omit<Client, 'injectName' | 'version'>} ClientState - what a client's page, frame, build and cohorts decide
 */

/**
 * The platform of each generated config, and the first app version carrying this release: the
 * `minSupportedVersion` of the entry in the platform override that applies to this release's clients.
 * The versions are placeholders no client reaches until the app release carrying that C-S-S is known.
 *
 * iOS (7.x) and macOS (1.x) share the Apple inject names, and C-S-S compares versions across the two.
 * The placeholder `999.0.0` is above both, so until real versions replace it, the macOS view matches
 * iOS-only gates (`minSupportedVersion` 7.x), which no macOS release reaches, and both views miss
 * every range with a `maxSupportedVersion`, such as a macOS-only range. `patchedViews` still checks
 * the detectors each such entry patches, on its own.
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

/** Above this many client states, the config tests warn, and still check every state. */
export const MAX_CLIENT_STATES = 1000;

/**
 * The cohorts of each content scope experiment a client at this version can be in: those whose
 * subfeature is on at or below the version.
 *
 * @param {Record<string, any>} configBody
 * @param {Version} version
 * @returns {Record<string, string[]>}
 */
function experimentsAt(configBody, version) {
    /** @type {Record<string, string[]>} */
    const cohorts = {};
    for (const [
        name,
        subfeature,
    ] of Object.entries(configBody.features?.contentScopeExperiments?.features ?? {})) {
        const min = subfeature.minSupportedVersion;
        if (!EXPERIMENT_STATES.includes(subfeature.state)) continue;
        if (min !== undefined && (typeof min !== typeof version || compareVersions(version, min) < 0)) continue;
        cohorts[name] = (subfeature.cohorts ?? []).map((/** @type {{ name: string }} */ cohort) => cohort.name);
    }
    return cohorts;
}

/**
 * A C-S-S release on each side of and at every bound, so each range the bounds split holds one.
 *
 * @param {string[]} bounds - `major.minor.patch` releases
 * @returns {string[]}
 */
function versionsAround(bounds) {
    /** @param {string} version */
    const next = (version) => {
        const [
            major,
            minor,
            patch,
        ] = version.split('.').map(Number);
        return `${major}.${minor}.${patch + 1}`;
    };
    const versions = [
        '0.0.0',
        ...bounds.flatMap((bound) => [
            bound,
            next(bound),
        ]),
    ].sort(compareVersions);
    return versions.filter((version, index) => index === 0 || compareVersions(version, versions[index - 1]) !== 0);
}

/**
 * Every state of the page, frame, build and cohorts a client at this version can be in that decides
 * a webDetection condition, with a label for each. Only the keys some condition names add states, and
 * the states are every combination of:
 *
 * - each experiment a condition names: each of its cohorts, or not enrolled
 * - each domain a condition names, or none; a subdomain also matches a condition on its parent
 * - each URL pattern a condition names, or none
 * - the top frame or a subframe
 * - an internal build or not, and a preview build or not
 * - a C-S-S release in each range the version bounds split
 *
 * A key C-S-S doesn't match makes its block match no state, as in C-S-S.
 *
 * @param {Record<string, any>} configBody
 * @param {Version} version
 * @returns {Array<{ label: string, state: ClientState }>}
 */
export function clientStates(configBody, version) {
    const settings = configBody.features?.webDetection?.settings ?? {};
    /** @type {ConditionBlock[]} */
    const blocks = conditionalEntries(settings).flatMap((entry) => {
        const condition = entryCondition(entry);
        return condition === null ? [] : conditionBlocks({ condition });
    });
    /** @param {keyof ConditionBlock} key */
    const named = (key) => blocks.some((block) => Object.hasOwn(block, key));
    const enrolled = experimentsAt(configBody, version);

    /** @type {Array<Array<{ label: string, state: Partial<ClientState> }>>} */
    const dimensions = [];
    const experiments = [
        ...new Set(
            blocks.flatMap((block) =>
                block.experiment
                    ? [
                          block.experiment.experimentName,
                      ]
                    : [],
            ),
        ),
    ];
    for (const experiment of experiments) {
        dimensions.push([
            { label: `${experiment}: not enrolled`, state: {} },
            ...(enrolled[experiment] ?? []).map((cohort) => ({
                label: `${experiment}: ${cohort}`,
                state: { cohorts: { [experiment]: cohort } },
            })),
        ]);
    }
    const domains = [
        ...new Set(
            blocks.flatMap((block) =>
                typeof block.domain === 'string'
                    ? [
                          block.domain,
                      ]
                    : [],
            ),
        ),
    ];
    if (domains.length)
        dimensions.push([
            { label: 'no domain', state: {} },
            ...domains.map((domain) => ({ label: `domain ${domain}`, state: { domain } })),
        ]);
    const patterns = [
        ...new Set(blocks.filter((block) => Object.hasOwn(block, 'urlPattern')).map((block) => JSON.stringify(block.urlPattern))),
    ];
    if (patterns.length)
        dimensions.push([
            { label: 'no URL pattern', state: {} },
            ...patterns.map((urlPattern) => ({ label: `URL pattern ${urlPattern}`, state: { urlPattern } })),
        ]);
    if (named('context'))
        dimensions.push([
            { label: 'top frame', state: { frame: false } },
            { label: 'subframe', state: { frame: true } },
        ]);
    for (const key of /** @type {const} */ ([
        'internal',
        'preview',
    ])) {
        if (named(key))
            dimensions.push([
                { label: `not ${key}`, state: { [key]: false } },
                { label: key, state: { [key]: true } },
            ]);
    }
    const bounds = blocks.flatMap((block) =>
        [
            block.minContentScopeScriptsVersion,
            block.maxContentScopeScriptsVersion,
        ].filter((bound) => typeof bound === 'string' && /^\d+\.\d+\.\d+$/.test(bound)),
    );
    if (named('minContentScopeScriptsVersion') || named('maxContentScopeScriptsVersion'))
        dimensions.push(
            versionsAround(/** @type {string[]} */ (bounds)).map((contentScopeScriptsVersion) => ({
                label: `C-S-S ${contentScopeScriptsVersion}`,
                state: { contentScopeScriptsVersion },
            })),
        );

    /** @type {Array<{ labels: string[], state: ClientState }>} */
    let states = [
        { labels: [], state: { cohorts: {} } },
    ];
    for (const options of dimensions) {
        states = states.flatMap(({ labels, state }) =>
            options.map((option) => ({
                labels: [
                    ...labels,
                    option.label,
                ],
                state: { ...state, ...option.state, cohorts: { ...state.cohorts, ...option.state.cohorts } },
            })),
        );
    }
    return states.map(({ labels, state }) => ({ label: labels.join(', '), state }));
}

/**
 * The detectors each of a platform's inject names sees once `conditionalChanges` apply, in each
 * state `clientStates` gives, with the entries whose patch fails, which C-S-S skips, or whose
 * operation reads a pointer that names no value, which C-S-S applies as a no-op.
 *
 * @param {Record<string, any>} configBody
 * @param {Platform} platform
 * @param {Version} version
 * @returns {Array<{ label: string, injectName: string, detectors: Record<string, Record<string, any>>, failed: unknown[] }>}
 */
export function clientViews(configBody, platform, version) {
    const settings = configBody.features?.webDetection?.settings;
    if (!settings) return [];
    const states = clientStates(configBody, version);
    return PLATFORM_INJECT_NAMES[platform].flatMap((injectName) =>
        states.map(({ label, state }) => {
            const view = applyConditionalChanges(settings, { ...state, injectName, version }, { requireTargets: true });
            return {
                label: [
                    `${injectName} ${version}`,
                    label,
                ]
                    .filter(Boolean)
                    .join(', '),
                injectName,
                detectors: view.settings.detectors ?? {},
                failed: view.failed,
            };
        }),
    );
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
    )?.settings?.telemetry;
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
