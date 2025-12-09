import globals from 'globals';
import ddgConfig from '@duckduckgo/eslint-config';
import json from 'eslint-plugin-json';
import jsonc from 'eslint-plugin-jsonc';

export default [
    ...ddgConfig,
    // Use JSONC parser for features/ and overrides/ (allows comments)
    ...jsonc.configs['flat/recommended-with-jsonc'].map((config) => ({
        ...config,
        files: ['features/**/*.json', 'overrides/**/*.json'],
    })),
    // Use strict JSON for other JSON files (generated, package.json, etc.)
    {
        files: ['**/*.json'],
        ignores: ['features/**/*.json', 'overrides/**/*.json'],
        ...json.configs.recommended,
    },
    {
        languageOptions: {
            globals: {
                ...globals.commonjs,
                ...globals.browser,
                ...globals.jasmine,
                ...globals.node,
            },
        },
    },
];
