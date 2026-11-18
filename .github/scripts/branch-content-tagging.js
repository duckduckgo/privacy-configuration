import fs from 'fs';
import { CURRENT_CONFIG_VERSION } from '../../constants.js';
import { readFilesRecursively, mungeFileContents } from '../../automation-utils.js';

const PLATFORM_MAP = {
    'windows-config.json': 'windows',
    'ios-config.json': 'ios',
    'android-config.json': 'android',
    'macos-config.json': 'macos',
    'extension-config.json': 'extension',
};

const EXTENSION_PATTERN = /^extension-.*-config\.json$/;

function getPlatformFromFilename(filename) {
    if (PLATFORM_MAP[filename]) return PLATFORM_MAP[filename];
    if (EXTENSION_PATTERN.test(filename)) return 'extension';
    return null;
}

function detectFeatureStateChanges(baseConfig, prConfig) {
    const changes = [];
    const baseFeatures = baseConfig?.features || {};
    const prFeatures = prConfig?.features || {};

    const allFeatureKeys = new Set([
        ...Object.keys(baseFeatures),
        ...Object.keys(prFeatures),
    ]);

    for (const key of allFeatureKeys) {
        const baseState = baseFeatures[key]?.state || 'missing';
        const prState = prFeatures[key]?.state || 'missing';

        if (baseState !== prState) {
            changes.push({
                feature: key,
                from: baseState,
                to: prState,
            });
        }

        const baseSubfeatures = baseFeatures[key]?.features || {};
        const prSubfeatures = prFeatures[key]?.features || {};
        const allSubKeys = new Set([
            ...Object.keys(baseSubfeatures),
            ...Object.keys(prSubfeatures),
        ]);

        for (const subKey of allSubKeys) {
            const baseSub = baseSubfeatures[subKey]?.state || 'missing';
            const prSub = prSubfeatures[subKey]?.state || 'missing';

            if (baseSub !== prSub) {
                changes.push({
                    feature: `${key}.${subKey}`,
                    from: baseSub,
                    to: prSub,
                });
            }
        }
    }

    return changes;
}

export function analyzeConfigs(dir1, dir2) {
    const latestPrefix = `v${CURRENT_CONFIG_VERSION}/`;

    const dir1Files = readFilesRecursively(dir1);
    const dir2Files = readFilesRecursively(dir2);

    const affectedPlatforms = new Set();
    const featureChanges = [];

    const latestDir1 = {};
    const latestDir2 = {};

    for (const [
        filePath,
        content,
    ] of Object.entries(dir1Files)) {
        if (filePath.startsWith(latestPrefix)) {
            latestDir1[filePath.slice(latestPrefix.length)] = content;
        }
    }
    for (const [
        filePath,
        content,
    ] of Object.entries(dir2Files)) {
        if (filePath.startsWith(latestPrefix)) {
            latestDir2[filePath.slice(latestPrefix.length)] = content;
        }
    }

    const allFiles = new Set([
        ...Object.keys(latestDir1),
        ...Object.keys(latestDir2),
    ]);

    for (const filename of allFiles) {
        const baseContent = latestDir1[filename];
        const prContent = latestDir2[filename];

        if (!baseContent || !prContent) {
            const platform = getPlatformFromFilename(filename);
            if (platform) affectedPlatforms.add(platform);
            continue;
        }

        const baseMunged = mungeFileContents(baseContent, filename);
        const prMunged = mungeFileContents(prContent, filename);

        if (baseMunged === prMunged) continue;

        const platform = getPlatformFromFilename(filename);
        if (!platform) continue;

        affectedPlatforms.add(platform);

        try {
            const baseJson = JSON.parse(baseMunged);
            const prJson = JSON.parse(prMunged);
            const changes = detectFeatureStateChanges(baseJson, prJson);

            for (const change of changes) {
                featureChanges.push({ platform, ...change });
            }
        } catch {
            // JSON parse failure - platform is still tagged as affected
        }
    }

    return {
        platforms: [
            ...affectedPlatforms,
        ].sort(),
        featureChanges,
    };
}

export function runBranchContentTagging(dir1, dir2) {
    if (!fs.existsSync(`${dir1}/v${CURRENT_CONFIG_VERSION}`)) {
        return { platforms: [], featureChanges: [] };
    }

    return analyzeConfigs(dir1, dir2);
}

function isExecutedAsScript() {
    return import.meta.url === new URL(process.argv[1], 'file:').href;
}

if (isExecutedAsScript()) {
    if (process.argv.length !== 4) {
        console.error('Usage: node branch-content-tagging.js <base_generated_dir> <pr_generated_dir>');
        process.exit(1);
    }

    const analysis = runBranchContentTagging(process.argv[2], process.argv[3]);
    console.log(JSON.stringify(analysis, null, 2));
}
