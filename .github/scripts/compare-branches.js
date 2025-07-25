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
    const branch1Dir = path.join(tempDir, `${branch1.replace(/\//g, '-')}-repo`);
    const branch2Dir = path.join(tempDir, `${branch2.replace(/\//g, '-')}-repo`);
    const branch1GeneratedDir = path.join(tempDir, `${branch1.replace(/\//g, '-')}-generated`);
    const branch2GeneratedDir = path.join(tempDir, `${branch2.replace(/\//g, '-')}-generated`);

    console.log(`Comparing branches: ${branch1} vs ${branch2}`);
    console.log('=' * 50);

    try {
        // Create temp directories
        fs.mkdirSync(tempDir, { recursive: true });
        fs.mkdirSync(branch1GeneratedDir, { recursive: true });
        fs.mkdirSync(branch2GeneratedDir, { recursive: true });
        fs.mkdirSync(branch1Dir, { recursive: true });
        fs.mkdirSync(branch2Dir, { recursive: true });

        // Export branch1 contents using git archive
        console.log(`\n📦 Exporting ${branch1}...`);
        execSync(`git archive --format=tar ${branch1} | tar -x -C ${branch1Dir}`, { stdio: 'inherit' });

        // Export branch2 contents using git archive
        console.log(`\n📦 Exporting ${branch2}...`);
        execSync(`git archive --format=tar ${branch2} | tar -x -C ${branch2Dir}`, { stdio: 'inherit' });

        // Copy node_modules to both directories if it exists
        if (fs.existsSync('node_modules')) {
            console.log('\n📦 Copying node_modules to both directories...');
            execSync(`cp -r node_modules ${branch1Dir}/`, { stdio: 'inherit' });
            execSync(`cp -r node_modules ${branch2Dir}/`, { stdio: 'inherit' });
        }

        // Build branch1
        console.log(`\n📦 Building ${branch1}...`);
        execSync('npm run build', { stdio: 'inherit', cwd: branch1Dir });
        execSync(`cp -r ${path.join(branch1Dir, 'generated')}/* ${branch1GeneratedDir}/`, { stdio: 'inherit' });

        // Build branch2
        console.log(`\n📦 Building ${branch2}...`);
        execSync('npm run build', { stdio: 'inherit', cwd: branch2Dir });
        execSync(`cp -r ${path.join(branch2Dir, 'generated')}/* ${branch2GeneratedDir}/`, { stdio: 'inherit' });

        // Run comparison
        console.log('\n🔍 Running comparison...');
        execSync(`node .github/scripts/json-diff-directories.js ${branch1GeneratedDir} ${branch2GeneratedDir}`, { stdio: 'inherit' });
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
