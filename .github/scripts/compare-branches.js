#!/usr/bin/env node

import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

/**
 * Compare two branches by building each and running the diff analysis
 * @param {string} branch1 - First branch name
 * @param {string} branch2 - Second branch name
 * @param {boolean} cleanup - Whether to cleanup temporary files
 */
function compareBranches(branch1, branch2, cleanup = true) {
    const tempDir = '/tmp/branch-comparison';
    const branch1Dir = path.join(tempDir, `${branch1.replace(/\//g, '-')}-generated`);
    const branch2Dir = path.join(tempDir, `${branch2.replace(/\//g, '-')}-generated`);

    console.log(`Comparing branches: ${branch1} vs ${branch2}`);
    console.log('=' * 50);

    try {
        // Create temp directories
        fs.mkdirSync(tempDir, { recursive: true });
        fs.mkdirSync(branch1Dir, { recursive: true });
        fs.mkdirSync(branch2Dir, { recursive: true });

        // Build branch1
        console.log(`\n📦 Building ${branch1}...`);
        execSync(`git checkout ${branch1}`, { stdio: 'inherit' });
        execSync('npm run build', { stdio: 'inherit' });
        execSync(`cp -r generated/* ${branch1Dir}/`, { stdio: 'inherit' });

        // Build branch2
        console.log(`\n📦 Building ${branch2}...`);
        execSync(`git checkout ${branch2}`, { stdio: 'inherit' });
        execSync('npm run build', { stdio: 'inherit' });
        execSync(`cp -r generated/* ${branch2Dir}/`, { stdio: 'inherit' });

        // Run comparison
        console.log('\n🔍 Running comparison...');
        execSync(`node .github/scripts/json-diff-directories.js ${branch1Dir} ${branch2Dir}`, { stdio: 'inherit' });
    } catch (error) {
        console.error('❌ Error during comparison:', error.message);
        process.exit(1);
    } finally {
        // Cleanup
        if (cleanup) {
            console.log('\n🧹 Cleaning up temporary files...');
            try {
                execSync(`rm -rf ${tempDir}`, { stdio: 'inherit' });
            } catch (error) {
                console.warn('⚠️  Warning: Could not cleanup temporary files:', error.message);
            }
        } else {
            console.log(`\n📁 Temporary files preserved in: ${tempDir}`);
        }
    }
}

// CLI usage
if (process.argv.length < 4) {
    console.error('Usage: node compare-branches.js <branch1> <branch2> [--no-cleanup]');
    console.error('Example: node compare-branches.js main feature-branch');
    console.error('Example: node compare-branches.js main feature-branch --no-cleanup');
    process.exit(1);
}

const branch1 = process.argv[2];
const branch2 = process.argv[3];
const cleanup = !process.argv.includes('--no-cleanup');

compareBranches(branch1, branch2, cleanup);
