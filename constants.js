export const CURRENT_CONFIG_VERSION = 6;
export const OVERRIDE_DIR = 'overrides';
export const GENERATED_DIR = 'generated';
export const LISTS_DIR = 'features';
export const BROWSERS_SUBDIR = 'browsers/';
export const UNPROTECTED_LIST_NAME = 'unprotected-temporary.json';
// TDS each platform's clients load, relative to https://staticcdn.duckduckgo.com/trackerblocking/.
// Keep in step with the latest version per file in https://github.com/duckduckgo/tracker-blocklists/tree/main/web.
export const TDS_PATH_FOR_PLATFORM = {
    extension: 'v6/current/extension-tds.json',
    'browsers/chrome': 'v6/current/extension-tds.json',
    'browsers/firefox': 'v6/current/extension-tds.json',
    'browsers/brave': 'v6/current/extension-tds.json',
    'browsers/edge': 'v6/current/extension-tds.json',
    'browsers/edg': 'v6/current/extension-tds.json',
    'browsers/chromemv3': 'v6/current/extension-mv3-tds.json',
    'browsers/bravemv3': 'v6/current/extension-mv3-tds.json',
    'browsers/edgmv3': 'v6/current/extension-mv3-tds.json',
    'browsers/safarimv3': 'v5/current/extension-safari-tds.json',
    ios: 'v5/current/ios-tds.json',
    android: 'v5/current/android-tds.json',
    macos: 'v6/current/macos-tds.json',
    windows: 'v5/current/windows-tds.json',
};
