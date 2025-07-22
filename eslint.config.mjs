import globals from 'globals';
import ddgConfig from '@duckduckgo/eslint-config';
import json from 'eslint-plugin-json';

export default [
    ...ddgConfig,
    {
        files: ['**/*.json'],
        ...json.configs.recommended,
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            globals: {
                ...globals.mocha,
            },
        },
        rules: {
            'no-unused-expressions': 'off',
        },
    },
    {
        languageOptions: {
            globals: {
                ...globals.commonjs,
                ...globals.browser,
                ...globals.jasmine,
                ...globals.node,
                ...globals.mocha,
            },
        },
    },
];
