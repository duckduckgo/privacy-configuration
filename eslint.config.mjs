import globals from 'globals';
import ddgConfig from '@duckduckgo/eslint-config';

export default [
    ...ddgConfig,
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
