import globals from 'globals';
import ddgConfig from '@duckduckgo/eslint-config';
import json from 'eslint-plugin-json';

export default [
    ...ddgConfig,
    {
        files: [
            '**/*.json',
        ],
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
