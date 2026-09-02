import { expect } from 'chai';
import fs from 'fs';
import platforms from '../platforms.js';

/**
 * Detector labels as emitted by C-S-S (content-scope-scripts
 * injected/src/features/detector-perf.js call sites): the three on-demand
 * detector utils plus the pooled label for config-driven webDetection scans.
 * A new timed call site in C-S-S must be added here and given eventHub
 * parameters before it ships.
 */
const DETECTORS = [
    'bot',
    'fraud',
    'adwall',
    'webDetection',
];

const platformOutput = platforms.map((item) => item.replace('browsers/', 'extension-'));

const latestConfigs = platformOutput.map((plat) => {
    return {
        name: `v5/${plat}-config.json`,
        body: JSON.parse(fs.readFileSync(`./generated/v5/${plat}-config.json`)),
    };
});

/**
 * Assert a threshold list is usable as bin edges: positive finite numbers in
 * strictly ascending order. Clients fall back to code defaults on malformed
 * values, silently ignoring the config — so a bad value fails the build here.
 *
 * @param {unknown} edges
 * @param {string} path - used in error messages
 */
function assertThresholdEdges(edges, path) {
    expect(Array.isArray(edges), `${path}: expected an array, got ${JSON.stringify(edges)}`).to.equal(true);
    const values = /** @type {unknown[]} */ (edges);
    expect(values.length, `${path}: expected at least one edge`).to.be.greaterThan(0);
    for (const [
        index,
        edge,
    ] of values.entries()) {
        expect(
            typeof edge === 'number' && Number.isFinite(edge) && edge > 0,
            `${path}[${index}]: expected a positive finite number, got ${JSON.stringify(edge)}`,
        ).to.equal(true);
    }
    for (let i = 1; i < values.length; i++) {
        expect(
            Number(values[i]) > Number(values[i - 1]),
            `${path}: edges must be strictly ascending, got ${JSON.stringify(values)}`,
        ).to.equal(true);
    }
}

/**
 * Compute every event type the C-S-S detectorPerf feature can emit under the
 * given settings. Mirrors the naming scheme in
 * content-scope-scripts/injected/src/features/detector-perf.js.
 *
 * @param {Record<string, any>} settings
 * @returns {Set<string>}
 */
function expectedEventTypes(settings) {
    const defaults = settings.defaults ?? {};
    const overrides = settings.detectorOverrides ?? {};
    const types = new Set([
        'detectorPerf_measured',
        // Immediate severe event: fired when the highest edge of a threshold
        // family is crossed, consumed by an immediate-trigger pixel that
        // forwards the data payload (detector, kind, thresholdMs).
        'detectorPerf_severe',
    ]);
    for (const name of DETECTORS) {
        types.add(`detectorPerf_${name}_ran`);
        const single = overrides[name]?.singleRunThresholdsMs ?? defaults.singleRunThresholdsMs ?? [];
        const total = overrides[name]?.totalPerPageThresholdsMs ?? defaults.totalPerPageThresholdsMs ?? [];
        for (const edge of single) {
            types.add(`detectorPerf_${name}_over${edge}ms`);
        }
        for (const edge of total) {
            types.add(`detectorPerf_${name}_total_over${edge}ms`);
        }
    }
    for (const edge of settings.combinedThresholdsMs ?? []) {
        types.add(`detectorPerf_combined_over${edge}ms`);
    }
    return types;
}

/**
 * Collect every eventHub source that consumes an event: parameter sources
 * (period counters/data) and immediate trigger sources.
 *
 * @param {Record<string, any> | undefined} telemetry
 * @returns {Map<string, string[]>} source → telemetry entry names
 */
function collectSources(telemetry) {
    const sources = new Map();
    for (const [
        entryName,
        entry,
    ] of Object.entries(telemetry ?? {})) {
        if (entry.trigger?.type === 'immediate' && entry.trigger.source) {
            const entries = sources.get(entry.trigger.source) ?? [];
            entries.push(entryName);
            sources.set(entry.trigger.source, entries);
        }
        for (const param of Object.values(entry.parameters ?? {})) {
            if (!param.source) continue;
            const entries = sources.get(param.source) ?? [];
            entries.push(entryName);
            sources.set(param.source, entries);
        }
    }
    return sources;
}

describe('detectorPerf config tests', () => {
    let sawDetectorPerf = false;

    for (const config of latestConfigs) {
        const detectorPerf = config.body.features?.detectorPerf;
        if (!detectorPerf?.settings) continue;
        sawDetectorPerf = true;
        const settings = detectorPerf.settings;

        describe(config.name, () => {
            it('threshold edges are positive and strictly ascending', () => {
                assertThresholdEdges(settings.defaults?.singleRunThresholdsMs, 'defaults/singleRunThresholdsMs');
                assertThresholdEdges(settings.defaults?.totalPerPageThresholdsMs, 'defaults/totalPerPageThresholdsMs');
                assertThresholdEdges(settings.combinedThresholdsMs, 'combinedThresholdsMs');
                for (const [
                    name,
                    override,
                ] of Object.entries(settings.detectorOverrides ?? {})) {
                    if (override.singleRunThresholdsMs !== undefined) {
                        assertThresholdEdges(override.singleRunThresholdsMs, `detectorOverrides/${name}/singleRunThresholdsMs`);
                    }
                    if (override.totalPerPageThresholdsMs !== undefined) {
                        assertThresholdEdges(override.totalPerPageThresholdsMs, `detectorOverrides/${name}/totalPerPageThresholdsMs`);
                    }
                }
            });

            it('every emittable event type has an eventHub parameter source', () => {
                const sources = collectSources(config.body.features?.eventHub?.settings?.telemetry);
                for (const type of expectedEventTypes(settings)) {
                    expect(sources.has(type)).to.equal(
                        true,
                        `detectorPerf can emit '${type}' but no eventHub telemetry parameter consumes it — ` +
                            `add matching parameters to features/event-hub.json or remove the threshold edge`,
                    );
                }
            });

            it('every detectorPerf eventHub source is an emittable event type (no stale entries)', () => {
                const sources = collectSources(config.body.features?.eventHub?.settings?.telemetry);
                const expected = expectedEventTypes(settings);
                for (const [
                    source,
                    entryNames,
                ] of sources) {
                    if (!source.startsWith('detectorPerf_')) continue;
                    expect(expected.has(source)).to.equal(
                        true,
                        `eventHub entries [${entryNames.join(', ')}] consume '${source}' but detectorPerf can no longer emit it — ` +
                            `update the eventHub parameters to match the configured threshold edges`,
                    );
                }
            });
        });
    }

    it('exercises at least one config with detectorPerf (sanity)', () => {
        expect(sawDetectorPerf).to.equal(true);
    });

    // Period counters live in the base feature file and are inherited by all
    // platforms (harmless where the feature is absent — the sources just never
    // fire; same as the captcha week counters). The immediate severe entry is
    // different: it belongs only in overrides for platforms that run the
    // feature, and must never reach Android (see the test below).
    it('configs without detectorPerf have no immediate detectorPerf entries', () => {
        for (const config of latestConfigs) {
            if (config.body.features?.detectorPerf) continue;
            const telemetry = config.body.features?.eventHub?.settings?.telemetry ?? {};
            for (const [
                entryName,
                entry,
            ] of Object.entries(telemetry)) {
                const isDetectorPerfImmediate =
                    entry.trigger?.type === 'immediate' && String(entry.trigger.source).startsWith('detectorPerf_');
                expect(isDetectorPerfImmediate).to.equal(
                    false,
                    `${config.name}: telemetry entry '${entryName}' is an immediate detectorPerf pixel but the config has no detectorPerf feature`,
                );
            }
        }
    });

    // Android's EventHub config parser is period + counter only and fails hard
    // on an immediate-trigger entry, rejecting the *entire* telemetry set
    // (including the shipped adwalls/captcha pixels). Keep immediate entries
    // out of Android configs until the parser is entry-tolerant.
    it('android configs contain no immediate-trigger telemetry entries', () => {
        for (const config of latestConfigs) {
            if (!config.name.includes('android')) continue;
            const telemetry = config.body.features?.eventHub?.settings?.telemetry ?? {};
            for (const [
                entryName,
                entry,
            ] of Object.entries(telemetry)) {
                expect(entry.trigger?.type).to.not.equal(
                    'immediate',
                    `${config.name}: telemetry entry '${entryName}' uses an immediate trigger, which Android's EventHub parser rejects wholesale`,
                );
            }
        }
    });
});
