import fs from 'fs';
import path from 'path';
import { expect } from 'chai';

/**
 * File size validation tests. These tests ensure the built config files stay within
 * reasonable size limits to prevent performance issues for clients.
 */
describe('File size validation', () => {
    const GENERATED_DIR = path.join(import.meta.dirname, '..', 'generated');
    const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB hard cap

    // Get all config versions and files
    const getConfigFiles = () => {
        const files = [];
        if (!fs.existsSync(GENERATED_DIR)) {
            throw new Error('Generated directory does not exist. Run `npm run build` first.');
        }

        const versions = fs
            .readdirSync(GENERATED_DIR)
            .filter((dir) => dir.startsWith('v') && fs.statSync(path.join(GENERATED_DIR, dir)).isDirectory());

        for (const version of versions) {
            const versionDir = path.join(GENERATED_DIR, version);
            const configFiles = fs.readdirSync(versionDir).filter((file) => file.endsWith('-config.json'));

            for (const file of configFiles) {
                files.push({
                    version,
                    filename: file,
                    filepath: path.join(versionDir, file),
                });
            }
        }

        return files;
    };

    describe('2MB hard cap enforcement', () => {
        const configFiles = getConfigFiles();

        configFiles.forEach(({ version, filename, filepath }) => {
            it(`${version}/${filename} should not exceed 2MB`, () => {
                const stats = fs.statSync(filepath);
                const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

                expect(stats.size, `File ${version}/${filename} is ${sizeInMB}MB, exceeding 2MB limit`).to.be.at.most(MAX_FILE_SIZE_BYTES);
            });
        });

        it('should have at least one config file to test', () => {
            expect(configFiles.length).to.be.greaterThan(0);
        });
    });

    describe('File size reporting', () => {
        it('should report sizes of all config files', () => {
            const configFiles = getConfigFiles();

            console.log('\n=== Config File Sizes ===');
            let totalSize = 0;

            configFiles.forEach(({ version, filename, filepath }) => {
                const stats = fs.statSync(filepath);
                const sizeInKB = (stats.size / 1024).toFixed(1);
                const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
                totalSize += stats.size;

                console.log(`${version}/${filename}: ${sizeInKB}KB (${sizeInMB}MB)`);
            });

            const totalSizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
            console.log(`\nTotal size across all configs: ${totalSizeInMB}MB`);
            console.log('=========================\n');

            // Verify we processed config files
            expect(configFiles.length).to.be.greaterThan(0);
        });
    });
});
