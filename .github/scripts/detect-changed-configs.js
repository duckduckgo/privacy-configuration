import fs from 'fs';
import path from 'path';
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
 * Usage: node detect-changed-configs.js <baseGeneratedDir> <headGeneratedDir>
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

if (process.argv.length !== 4) {
    console.error('Usage: node detect-changed-configs.js <baseGeneratedDir> <headGeneratedDir>');
    process.exit(1);
}

const baseDir = process.argv[2];
const headDir = process.argv[3];

const headVersionDir = path.join(headDir, versionDir);
const compiledConfigs = fs.existsSync(headVersionDir)
    ? fs.readdirSync(headVersionDir).filter((filename) => filename.endsWith('-config.json'))
    : [];

const changed = compiledConfigs.filter((filename) => mungedConfig(baseDir, filename) !== mungedConfig(headDir, filename));

process.stdout.write(JSON.stringify(changed));
