import fs from 'fs';
import os from 'os';
import path from 'path';
import { expect } from 'chai';
import { CURRENT_CONFIG_VERSION } from '../constants.js';
import { detectChangedConfigs } from '../.github/scripts/diff-directories.js';

const versionDir = `v${CURRENT_CONFIG_VERSION}`;

function writeConfig(generatedDir, filename, contents) {
    const directory = path.join(generatedDir, versionDir);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, filename), JSON.stringify(contents));
}

describe('detect-changed-configs', () => {
    let temporaryDirectory;
    let baseDir;
    let headDir;

    beforeEach(() => {
        temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-changed-configs-'));
        baseDir = path.join(temporaryDirectory, 'base');
        headDir = path.join(temporaryDirectory, 'head');
    });

    afterEach(() => {
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    });

    it('ignores generated version and feature hash changes', () => {
        writeConfig(baseDir, 'ios-config.json', {
            version: 1,
            features: { example: { state: 'enabled', hash: 'base-hash' } },
        });
        writeConfig(headDir, 'ios-config.json', {
            version: 2,
            features: { example: { state: 'enabled', hash: 'head-hash' } },
        });

        expect(detectChangedConfigs(baseDir, headDir)).to.deep.equal([]);
    });

    it('reports a material compiled config change', () => {
        writeConfig(baseDir, 'ios-config.json', {
            version: 1,
            features: { example: { state: 'disabled', hash: 'base-hash' } },
        });
        writeConfig(headDir, 'ios-config.json', {
            version: 2,
            features: { example: { state: 'enabled', hash: 'head-hash' } },
        });

        expect(detectChangedConfigs(baseDir, headDir)).to.deep.equal([
            'ios-config.json',
        ]);
    });

    it('reports a newly deployed config', () => {
        writeConfig(headDir, 'macos-config.json', {
            version: 2,
            features: { example: { state: 'enabled', hash: 'head-hash' } },
        });

        expect(detectChangedConfigs(baseDir, headDir)).to.deep.equal([
            'macos-config.json',
        ]);
    });

    it('reports a removed compiled config', () => {
        writeConfig(baseDir, 'ios-config.json', {
            version: 1,
            features: { example: { state: 'enabled', hash: 'base-hash' } },
        });

        expect(detectChangedConfigs(baseDir, headDir)).to.deep.equal([
            'ios-config.json',
        ]);
    });
});
