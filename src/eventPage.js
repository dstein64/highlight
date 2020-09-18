// TODO: Use consistent variable naming (camel case or underscores, not both)

// WARN: For functions that are called from the options page, proper scope is
// necessary (e.g., using a function declaration beginning with a 'function',
// or using a function expression beginning with 'var', but not a function
// expression beginning with 'let' or 'const').

const USER_AGENT = navigator.userAgent.toLowerCase();
const MOBILE = USER_AGENT.indexOf('android') > -1 && USER_AGENT.indexOf('firefox') > -1;

// total number of highlight states (min 2, max 4).
let NUM_HIGHLIGHT_STATES = 4;
// Firefox for mobile, doesn't show an browserAction icon, so only use two highlight
// states (on and off).
if (MOBILE)
    NUM_HIGHLIGHT_STATES = 2;

// *****************************
// * Utilities and Options
// *****************************

// This is called from options.js (see scope warning above).
function getNumHighlightStates() {
    return NUM_HIGHLIGHT_STATES;
}

// This is called from options.js (see scope warning above).
function getVersion() {
    return chrome.runtime.getManifest().version;
}

// This is called from options.js (see scope warning above).
function getPermissions(scope) {
    const permissions = {
        'autonomous_highlights': {
            permissions: ['tabs'],
            origins: ['<all_urls>']
        },
        'global_highlighting': {
            permissions: ['tabs'],
            origins: ['<all_urls>']
        }
    };
    return permissions[scope];
}

const getOptions = function() {
    let opts = localStorage['options'];
    if (opts) {
        opts = JSON.parse(opts);
    }
    return opts;
};

// This is called from options.js (see scope warning above).
function defaultOptions() {
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
    options['autonomous_block_list'] = false;
    options['autonomous_block_list_items'] = [];
    options['autonomous_block_list_exceptions'] = [];
    return options;
}

// Validate options
(function() {
    let opts = getOptions();
    if (!opts) {
        opts = Object.create(null);
    }

    const defaults = defaultOptions();

    // Set missing options using defaults.
    const default_keys = Object.keys(defaults);
    for (let i = 0; i < default_keys.length; i++) {
        const default_key = default_keys[i];
        if (!(default_key in opts)) {
            opts[default_key] = defaults[default_key];
        }
    }

    // Remove unknown options (these may have been set
    // by previous versions of the extension).
    const opt_keys = Object.keys(opts);
    for (let i = 0; i < opt_keys.length; i++) {
        const opt_key = opt_keys[i];
        if (!(opt_key in defaults)) {
            delete opts[opt_key];
        }
    }

    // Convert invalid settings to valid settings.
    if (![...Array(NUM_HIGHLIGHT_STATES).keys()].includes(opts.autonomous_state))
        opts.autonomous_state = defaults['autonomous_state'];

    localStorage['options'] = JSON.stringify(opts);
})();

// *****************************
// * Core
// *****************************

// a highlightState is a list with highlight state and success state
// this is used to manage highlight state, particularly for keeping
// icon in sync, and telling content.js what state to change to
const tabIdToHighlightState = new Map();

chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
    // don't have to check if tabId in map. delete will still work, but
    // will return false
    tabIdToHighlightState.delete(tabId);
});

// This is called from options.js (see scope warning above).
function highlightStateToIconId(state) {
    return state + (state > 0 ? 4 - NUM_HIGHLIGHT_STATES : 0);
}

// updates highlight state in tabIdToHighlightState, and also used to
// show the correct highlight icon
const updateHighlightState = function(tabId, highlight, success) {
    // null represents 'unknown'
    // true should always clobber false (for iframes)
    success = (typeof success) === 'undefined' ? null : success;

    // have to check for false. for null we don't want to set to zero.
    if (success === false)
        highlight = 0;

    tabIdToHighlightState.set(tabId, {highlight: highlight, success: success});

    const setIcon = function(iconId) {
        const path19 = 'icons/' + iconId + 'highlight19x19.png';
        const path38 = 'icons/' + iconId + 'highlight38x38.png';
        chrome.browserAction.setIcon({
            path: {
                '19': path19,
                '38': path38
            },
            tabId: tabId
        });
    };

    let iconId = highlightStateToIconId(highlight);
    if (success === null)
        iconId = '_';
    else if (success === false)
        iconId = 'X';

    setIcon(iconId);
};

chrome.runtime.onMessage.addListener(function(request, sender, response) {
    const proceed = request && sender && sender.tab;
    if (!proceed)
        return;
    const message = request.message;
    const tabId = sender.tab.id;
    if (message === 'updateHighlightState') {
        updateHighlightState(tabId, request.highlight, request.success);
    } else if (message === 'getHighlightState') {
        const highlightState = tabIdToHighlightState.get(tabId);
        response({
            'curHighlight': highlightState.highlight,
            'curSuccess': highlightState.success});
    } else if (message === 'getOptions') {
        response(getOptions());
    } else if (message === 'getParams') {
        response({'numHighlightStates': NUM_HIGHLIGHT_STATES});
    }
    // NOTE: if you're going to call response asynchronously,
    //       be sure to return true from this function.
    //       http://stackoverflow.com/questions/20077487/
    //              chrome-extension-message-passing-response-not-sent
});

const inject = function(tabId, runAt='document_idle', callback=function() {}) {
    const scripts = [
        'src/lib/readabilitySAX/readabilitySAX.js',
        'src/lib/Porter-Stemmer/PorterStemmer1980.js',
        'src/nlp.js',
        'src/utils.js',
        'src/content.js',
        'src/style.css'
    ];
    let fn = callback;
    for (let i = scripts.length - 1; i >= 0; --i) {
        let script = scripts[i];
        let fn_ = fn;
        fn = function() {
            let inject_ = function(id, options, callback) {callback()};
            if (script.endsWith('.css')) {
                inject_ = chrome.tabs.insertCSS;
            } else if (script.endsWith('.js')) {
                inject_ = chrome.tabs.executeScript;
            }
            // Only inject into the top-level frame. More permissions than activeTab
            // would be required for iframes of different origins.
            // https://stackoverflow.com/questions/59166046/using-tabs-executescript-in-iframe
            // The same permissions used for global highlighting seem to suffice.
            inject_(tabId, {file: script, allFrames: false, runAt: runAt}, fn_);
        }
    }
    fn();
};

// setting state to null results in automatically incrementing the state.
const highlight = function(tabId, showError, state=null, delay=null, runAt='document_idle') {
    if (state !== null && (state < 0 || state >= NUM_HIGHLIGHT_STATES)) {
        console.error(`invalid state: ${state}`);
        return;
    }
    const sendHighlightMessage = function() {
        if (state === null)
            state = (tabIdToHighlightState.get(tabId).highlight + 1) % NUM_HIGHLIGHT_STATES;
        chrome.tabs.sendMessage(
            tabId,
            {
                method: 'highlight',
                highlightState: state,
                delay: delay
            });
    };
    // First check if the current page is supported by trying to inject no-op code.
    // (e.g., https://chrome.google.com/webstore, chrome://extensions/, and other pages
    // do not support extensions).
    chrome.tabs.executeScript(
        tabId,
        {code: '(function(){})();'},
        function() {
            if (chrome.runtime.lastError) {
                if (showError)
                    alert('highlighting is not supported on this page.');
                return;
            }
            chrome.tabs.sendMessage(
                tabId,
                {method: 'ping'},
                {},
                function(resp) {
                    // On Firefox, in some cases just checking for lastError is not
                    // sufficient.
                    if (chrome.runtime.lastError || !resp) {
                        inject(tabId, runAt, sendHighlightMessage);
                    } else {
                        sendHighlightMessage();
                    }
                });
        });
};

// runAt: 'document_end' is used for manually triggered highlighting, so that
// highlighting occurs sooner than it otherwise would with 'document_idle'.

// Add a listener for loading new pages, for the autonomous highlight
// functionality. Without the proper tabs permissions, highlighting will
// fail (the tabs events can seemingly still be listened for, without some
// information like URL, and without the ability to inject javascript).
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    const options = getOptions();
    if (options.autonomous_highlights && changeInfo.status === 'complete') {
        if (options.autonomous_block_list) {
            const url = tab.url;
            if (url === undefined) return;
            let exception = false;
            for (const pattern of options.autonomous_block_list_exceptions) {
                // TODO: if url matches pattern, set exception=true and break
            }
            if (!exception) {
                for (const pattern of options.autonomous_block_list_items) {
                    // TODO: if url matches pattern, return
                    return;
                }
            }
        }
        highlight(
            tab.id, false, options.autonomous_state, options.autonomous_delay, 'document_idle');
    }
});

// This is called from options.js (see scope warning above).
function highlightAll(state) {
    chrome.tabs.query({}, function(tabs) {
        for (let i = 0; i < tabs.length; ++i) {
            highlight(tabs[i].id, false, state, 'document_end');
        }
    });
}

chrome.browserAction.onClicked.addListener(function(tab) {
    highlight(tab.id, true, null, 'document_end');
});

// *****************************
// * Context Menu
// *****************************

{
    const is_firefox = chrome.runtime.getURL('').startsWith('moz-extension://');
    let properties;

    chrome.contextMenus.create({
        type: 'normal',
        id: 'page_main',
        title: 'Auto Highlight',
        contexts: ['page']
    });

    const level_name_lookup = {
        2: {0: 'Off', 1: 'On'},
        3: {0: 'None', 1: 'Partial', 2: 'Max'},
        4: {0: 'None', 1: 'Low', 2: 'High', 3: 'Max'}
    };

    for (const context of ['page', 'browser_action']) {
        // Add highlighting items.
        let highlight_menu_id = null;
        // Use a submenu for the browser action, to prevent Firefox from automatically
        // putting items beyond the fourth in a submenu (i.e., keep the number of
        // Firefox browser action items less than or equal to four), and to prevent
        // Chrome from truncating items beyond the fifth (i.e., keep the number of
        // Chrome browser action items less than or equal to five).
        if (context === 'browser_action') {
            highlight_menu_id = 'highlight_' + context;
            properties = {
                type: 'normal',
                id: highlight_menu_id,
                title: 'State',
                contexts: [context]
            };
            chrome.contextMenus.create(properties);
        }
        for (let i = 0; i < NUM_HIGHLIGHT_STATES; ++i) {
            const id = 'highlight_' + i + '_' + context;
            properties = {
                type: 'normal',
                id: id,
                title: level_name_lookup[NUM_HIGHLIGHT_STATES][i],
                contexts: [context]
            };
            // Chrome does not support icons.
            if (is_firefox) {
                const iconName = highlightStateToIconId(i) + 'highlight';
                properties.icons = {
                    '16': 'icons/' + iconName + '16x16.png',
                    '32': 'icons/' + iconName + '32x32.png',
                }
            }
            if (context === 'page') {
                properties.parentId = 'page_main';
            } else if (highlight_menu_id !== null) {
                properties.parentId = highlight_menu_id;
            }
            chrome.contextMenus.create(properties);
        }

        // Add separator if we're in the page context
        if (context === 'page') {
            properties = {
                type: 'separator',
                contexts: [context],
            };
            if (context === 'page')
                properties.parentId = 'page_main';
            chrome.contextMenus.create(properties);
        }

        // Add global highlighting items
        const global_menu_id = 'global_' + context;
        properties = {
            type: 'normal',
            id: global_menu_id,
            title: 'Global Highlighting',
            contexts: [context],
        };
        if (context === 'page')
            properties.parentId = 'page_main';
        chrome.contextMenus.create(properties);
        for (let i = 0; i < NUM_HIGHLIGHT_STATES; ++i) {
            const id = 'global_' + i + '_' + context;
            properties = {
                type: 'normal',
                id: id,
                title: level_name_lookup[NUM_HIGHLIGHT_STATES][i],
                contexts: [context],
                parentId: global_menu_id
            };
            // Chrome does not support icons.
            if (is_firefox) {
                const iconName = highlightStateToIconId(i) + 'highlight';
                properties.icons = {
                    '16': 'icons/' + iconName + '16x16.png',
                    '32': 'icons/' + iconName + '32x32.png',
                }
            }
            chrome.contextMenus.create(properties);
        }

        // Add an options item for 1) the 'page' context and 2) the 'browser_action' context
        // on Firefox, since it doesn't have an Options item. This is not added for the
        // 'browser_action' context on Chrome, since it already has an Options item.
        if (context === 'page' || is_firefox) {
            const options_id = 'options_' + context;
            properties = {
                type: 'normal',
                id: options_id,
                title: 'Options',
                contexts: [context]
            };
            if (context === 'page')
                properties.parentId = 'page_main';
            chrome.contextMenus.create(properties);
        }
    }

    chrome.contextMenus.onClicked.addListener(function(info, tab) {
        const id = info.menuItemId;
        // TODO: USE MORE PRECISE MATCH FOR highlight_ and global_
        // TODO: i.e., check for the number suffix and the _ suffix
        if (id.startsWith('highlight_')) {
            const level = parseInt(id.slice('highlight_'.length).split('_')[0]);
            highlight(tab.id, true, level, 'document_end');
        } else if (id.startsWith('global_')) {
            const level = parseInt(id.slice('global_'.length).split('_')[0]);
            chrome.permissions.request(
                getPermissions('global_highlighting'),
                function (granted) {
                    if (granted)
                        highlightAll(level);
                });
        } else if (id.startsWith('options_')) {
            chrome.runtime.openOptionsPage();
        }
    });
}
