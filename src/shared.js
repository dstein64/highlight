// The code in here is imported by eventPage.js and options.js.
// It was originally defined within eventPage.js, and called in options.js
// through chrome.extension.getBackgroundPage(). This was no longer possible
// after switching to Manifest V3. Implementing the functions here was deemed
// preferable to keeping them in eventPage.js and making them accessible through
// messages, since the asynchronous nature would complicate the code in options.js.

const USER_AGENT = navigator.userAgent.toLowerCase();
const MOBILE = USER_AGENT.indexOf('android') > -1 && USER_AGENT.indexOf('firefox') > -1;
const IS_FIREFOX = chrome.runtime.getURL('').startsWith('moz-extension://');

// total number of highlight states (min 2, max 4).
let NUM_HIGHLIGHT_STATES = 4;
// Firefox for mobile doesn't show a browserAction icon, so only use two highlight
// states (on and off).
if (MOBILE)
    NUM_HIGHLIGHT_STATES = 2;

// Takes an optional scope, which can be null to refer to all.
// When no scope is specified, the container dictionary is returned.
const getPermissions = function(scope) {
    const permissions = {
        'autonomous_highlights': {
            permissions: ['tabs'],
            origins: ['<all_urls>']
        },
        'global_highlighting': {
            permissions: ['tabs'],
            origins: ['<all_urls>']
        },
        'copy_highlights': {
            permissions: ['clipboardWrite'],
            origins: []
        }
    };
    if (scope === null) {
        const _permissions = new Set();
        const origins = new Set();
        for (const [key, value] of Object.entries(permissions)) {
            value.permissions.forEach(x => _permissions.add(x));
            value.origins.forEach(x => origins.add(x));
        }
        const result = {
            permissions: Array.from(_permissions),
            origins: Array.from(origins)
        };
        return result;
    } else if (scope === undefined) {
        return permissions;
    } else {
        return permissions[scope];
    }
};

// Saves options (asynchronously).
const saveOptions = function(options, callback=function() {}) {
    // Deep copy so this function is not destructive.
    options = JSON.parse(JSON.stringify(options));
    // Disable autonomous highlighting if its required permissions were
    // removed.
    chrome.permissions.contains(
        getPermissions('autonomous_highlights'),
        function(result) {
            if (!result)
                options.autonomous_highlights = false;
            chrome.storage.local.get(['options'], function(storage) {
                const json = JSON.stringify(storage.options);
                // Don't save if there are no changes (to prevent 'storage' event listeners
                // from responding when they don't need to).
                // XXX: The comparison will fail if the keys are in different order.
                if (JSON.stringify(storage.options) !== JSON.stringify(options)) {
                    chrome.storage.local.set({options: options}, callback);
                } else {
                    callback();
                }
            });
        });
};

const defaultOptions = function() {
    const options = Object.create(null);
    const yellow = '#FFFF00';
    const black = '#000000';
    const red = '#FF0000';
    options['highlight_color'] = yellow;
    options['text_color'] = black;
    options['link_color'] = red;
    options['tinted_highlights'] = false;
    options['autonomous_highlights'] = false;
    options['autonomous_delay'] = 0;
    options['autonomous_state'] = Math.min(2, NUM_HIGHLIGHT_STATES - 1);
    // Enable the blocklist by default, so that it's ready in case
    // autonomous_highlights is enabled (which is disabled by default).
    options['autonomous_blocklist'] = true;
    options['autonomous_blocklist_items'] = [];
    options['autonomous_blocklist_exceptions'] = [];
    return options;
};

// This is called from options.js (see scope warning above).
const highlightStateToIconId = function(state) {
    return state + (state > 0 ? 4 - NUM_HIGHLIGHT_STATES : 0);
};

