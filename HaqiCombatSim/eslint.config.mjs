import globals from 'globals';

export default [{
    files: ['js/**/*.js'],
    languageOptions: {
        globals: {
            ...globals.browser,
            __HAQI_PACKED_DATA__: 'readonly',
            __HAQI_ASSET_MODE__: 'readonly',
            __HAQI_SDK_URL__: 'readonly',
        },
    },
    rules: { 'no-undef': 'error' },
}];
