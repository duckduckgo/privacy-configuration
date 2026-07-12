import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { CURRENT_CONFIG_VERSION } from '../../constants.js';
import { mungeFileContents } from '../../automation-utils.js';

/**
 * Detects which compiled per-platform configs changed between two built `generated` directories.
 *
 * Works on the compiled output (generated/v<N>/<platform>-config.json) rather than the source
 * override/feature files, so a rollout driven by a shared features/** file is caught even when no
 * overrides/<platform>-override.json was touched. Files are normalised with mungeFileContents
 * (which strips the per-build `version` and feature `hash` fields) before comparison, so routine
 * build noise is not reported as a change - the same equality check json-diff-directories.js uses.
 *
 * Usage: node detect-changed-configs.js <baseGeneratedDir> <headGeneratedDir> [configFilename...]
 * Prints a JSON array of changed compiled config filenames, e.g. ["ios-config.json"].
 */

const versionDir = `v${CURRENT_CONFIG_VERSION}`;

function mungedConfig(generatedDir, filename) {
    const filePath = path.join(generatedDir, versionDir, filename);
    if (!fs.existsSync(filePath)) {
        return null;
    }
    return mungeFileContents(fs.readFileSync(filePath, 'utf-8'), filePath);
}

function compiledConfigFilenames(generatedDir) {
    const directory = path.join(generatedDir, versionDir);
    return fs.existsSync(directory) ? fs.readdirSync(directory).filter((filename) => filename.endsWith('-config.json')) : [];
}

export function detectChangedConfigs(baseDir, headDir, configFilenames = undefined) {
    const compiledConfigs =
        configFilenames ??
        [
            ...new Set([
                ...compiledConfigFilenames(baseDir),
                ...compiledConfigFilenames(headDir),
            ]),
        ].sort();

    return compiledConfigs.filter((filename) => mungedConfig(baseDir, filename) !== mungedConfig(headDir, filename));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [
        baseDir,
        headDir,
        ...configFilenames
    ] = process.argv.slice(2);

    if (!baseDir || !headDir) {
        console.error('Usage: node detect-changed-configs.js <baseGeneratedDir> <headGeneratedDir> [configFilename...]');
        process.exit(1);
    }

    const changed = detectChangedConfigs(baseDir, headDir, configFilenames.length > 0 ? configFilenames : undefined);
    process.stdout.write(JSON.stringify(changed));
}
