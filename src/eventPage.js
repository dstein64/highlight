// TODO: Use consistent variable naming (camel case or underscores, not both)

// WARN: For functions that are called from the options page, proper scope is
// necessary (e.g., using a function declaration beginning with a 'function',
// or using a function expression beginning with 'var', but not a function
// expression beginning with 'let' or 'const').

const USER_AGENT = navigator.userAgent.toLowerCase();
const MOBILE = USER_AGENT.indexOf('android') > -1 && USER_AGENT.indexOf('firefox') > -1;

// total number of highlight states (min 2, max 4).
let NUM_HIGHLIGHT_STATES = 4;
// Firefox for mobile doesn't show a browserAction icon, so only use two highlight
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

// This is called from options.js (see scope warning above).
function getOptions() {
    // Don't check for permissions here, in order to keep the funtion synchronous.
    let opts = localStorage['options'];
    if (opts) {
        opts = JSON.parse(opts);
    }
    return opts;
}

// This is called from options.js (see scope warning above).
// Saves options (asynchronously).
function saveOptions(options, callback=null) {
    // Deep copy so this function is not destructive.
    options = JSON.parse(JSON.stringify(options));
    // Disable autonomous highlighting if its required permissions were
    // removed.
    chrome.permissions.contains(
        getPermissions('autonomous_highlights'),
        function(result) {
            if (!result)
                options.autonomous_highlights = false;
            // Don't save if there are no changes (to prevent 'storage' event listeners
            // from responding when they don't need to).
            // XXX: The comparison will fail if the keys are in different order.
            const json = JSON.stringify(options);
            if (json !== localStorage['options'])
                localStorage['options'] = JSON.stringify(options);
            if (callback !== null)
                callback();
        });
}

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
    options['autonomous_blocklist'] = false;
    options['autonomous_blocklist_items'] = [];
    options['autonomous_blocklist_exceptions'] = [];
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

    saveOptions(opts);
})();

// *****************************
// * Match Patterns
// *   - https://developer.chrome.com/extensions/match_patterns
// *   - https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns
// *****************************

// From Chrome documentation:
//   A match pattern is essentially a URL that begins with a permitted scheme
//   (http, https, file, or ftp, and that can contain '*' characters.
//   The special pattern <all_urls> matches any URL that starts with a permitted scheme.
//   Each match pattern has 3 parts:
//     * scheme — for example, http or file or *
//     * host — for example, www.google.com or *.google.com or *;
//       if the scheme is file, there is no host part
//     * path — for example, /*, /foo*, or /foo/bar. The path must
//       be present in a host permission, but is always treated as /*.
//   Here's the basic syntax:
//     <url-pattern> := <scheme>://<host><path>
//     <scheme> := '*' | 'http' | 'https' | 'file' | 'ftp'
//     <host> := '*' | '*.' <any char except '/' and '*'>+
//     <path> := '/' <any chars>
//   The meaning of '*' depends on whether it's in the scheme, host, or path part.
//   If the scheme is *, then it matches either http or https, and not file, or ftp.
//   If the host is just *, then it matches any host. If the host is *.hostname,
//   then it matches the specified host or any of its subdomains. In the path section,
//   each '*' matches 0 or more characters. The following table shows some valid patterns.

// This is called from options.js (see scope warning above).
function MatchPattern(pattern) {
    const pattern_error = 'Invalid MatchPattern';
    const all_urls = '<all_urls>';
    const valid_schemes = ['http', 'https', 'file', 'ftp'];

    let scheme_glob = null;
    let host_glob = null;
    let path_glob = null;

    if (pattern !== all_urls) {
        const scheme_sep = '://';
        const scheme_sep_idx = pattern.indexOf(scheme_sep);
        if (scheme_sep_idx === -1)
            throw pattern_error;
        scheme_glob = pattern.slice(0, scheme_sep_idx);
        if (scheme_glob !== '*' && !valid_schemes.includes(scheme_glob))
            throw pattern_error;
        const host_path = pattern.slice(scheme_sep_idx + scheme_sep.length);
        if (scheme_glob === 'file') {
            // file schemes have no host
            path_glob = host_path;
        } else {
            const path_sep = '/';
            const path_sep_idx = host_path.indexOf(path_sep);
            if (path_sep_idx === -1)
                throw pattern_error;
            host_glob = host_path.slice(0, path_sep_idx);
            if (host_glob.length === 0)
                throw pattern_error;
            // Make sure that there is at most one asterisk in the host, and that it occurs
            // as the first character.
            if (host_glob.indexOf('*') > -1) {
                if (host_glob.slice(1).indexOf('*') > -1)
                    throw pattern_error;
            }
            // Make sure that host starting with '*.' is followed by at least one character.
            if (host_glob.startsWith('*.') && host_glob.length <= 2)
                throw pattern_error;
            path_glob = host_path.slice(path_sep_idx);
        }
    }

    const glob_matches = function(glob, text) {
        // The following function is from:
        //   https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Escaping
        // (formatting and naming modified)
        const escape = function(string) {
            // $& means the whole matched string
            return string.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
        };
        const parts = glob.split('*').map(escape);
        const re = new RegExp('^' + parts.join('.*') + '$');
        return text.match(re) !== null;
    };

    this.matches = (url) => {
        const url_error = 'Invalid URL';
        try {
            if (pattern === all_urls)
                return true;
            const parsed = new URL(url);
            // Remove the trailing ":"
            const scheme = parsed.protocol.slice(0, -1);
            if (!valid_schemes.includes(scheme))
                return false;
            // For scheme, * only matches http and https.
            // Specs:
            //   "If the scheme is *, then it matches either http or https, and
            //   not file, or ftp."
            if (scheme_glob === '*') {
                if (!['http', 'https'].includes(scheme))
                    return false;
            } else if (scheme !== scheme_glob) {
                return false;
            }
            if (!glob_matches(host_glob, parsed.hostname)) {
                if (!host_glob.startsWith('*.'))
                    return false;
                // When a host glob starts with "*.", you also have to check the
                // hostname compared to the text that follows "*.".
                // Specs:
                //   "If the host is *.hostname, then it matches the specified
                //   host or any of its subdomains."
                if (host_glob.slice(2) !== parsed.hostname)
                    return false;
            }
            const path = parsed.pathname + parsed.search + parsed.hash;
            if (!glob_matches(path_glob, path))
                return false;
            return true;
        } catch (err) {
            throw url_error;
        }
    };
}

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
    const url_matches = function(url, list) {
        const hostname = new URL(url).hostname;
        for (const item of list) {
            if (item.type === 'hostname' && item.data === hostname)
                return true;
            if (item.type === 'address' && item.data === url)
                return true;
            if (item.type === 'pattern') {
                try {
                    const match_pattern = new MatchPattern(item.data);
                    if (match_pattern.matches(url))
                        return true;
                } catch (err) {}
            }
        }
        return false;
    };
    const options = getOptions();
    if (options.autonomous_highlights && changeInfo.status === 'complete') {
        if (options.autonomous_blocklist) {
            const url = tab.url;
            if (url === undefined) return;
            const exception = url_matches(url, options.autonomous_blocklist_exceptions);
            if (!exception && url_matches(url, options.autonomous_blocklist_items))
                return;
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

chrome.permissions.onRemoved.addListener(function() {
    // saveOptions() handles the check for missing permissions.
    saveOptions(getOptions());
});

// *****************************
// * Context Menu
// *****************************

{
    const is_firefox = chrome.runtime.getURL('').startsWith('moz-extension://');
    // As of 2019/9/18, Chrome does not support icons.
    const icons_supported = is_firefox;
    let properties;

    const level_name_lookup = {
        2: {0: 'Off', 1: 'On'},
        3: {0: 'None', 1: 'Partial', 2: 'Max'},
        4: {0: 'None', 1: 'Low', 2: 'High', 3: 'Max'}
    };

    const contexts = ['page', 'browser_action'];
    for (const context of contexts) {
        let main_menu_id = null;
        if (context === 'page') {
            main_menu_id = 'main_' + context;
            chrome.contextMenus.create({
                type: 'normal',
                id: main_menu_id,
                title: 'Auto Highlight',
                contexts: ['page']
            });
        }

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
            if (icons_supported) {
                properties.icons = {
                    '16': 'icons/16x16.png',
                    '32': 'icons/32x32.png',
                };
            }
            chrome.contextMenus.create(properties);
        }
        for (let i = 0; i < NUM_HIGHLIGHT_STATES; ++i) {
            const id = `highlight_${i}_${context}`;
            properties = {
                type: 'normal',
                id: id,
                title: level_name_lookup[NUM_HIGHLIGHT_STATES][i],
                contexts: [context]
            };
            if (icons_supported) {
                const iconName = highlightStateToIconId(i) + 'highlight';
                properties.icons = {
                    '16': `icons/${iconName}16x16.png`,
                    '32': `icons/${iconName}32x32.png`,
                };
            }
            if (main_menu_id !== null) {
                properties.parentId = main_menu_id;
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
            if (main_menu_id !== null)
                properties.parentId = main_menu_id;
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
        if (icons_supported) {
            properties.icons = {
                '16': 'icons/global16x16.png',
                '32': 'icons/global32x32.png',
            };
        }
        if (main_menu_id !== null)
            properties.parentId = main_menu_id;
        chrome.contextMenus.create(properties);
        for (let i = 0; i < NUM_HIGHLIGHT_STATES; ++i) {
            const id = `global_${i}_${context}`;
            properties = {
                type: 'normal',
                id: id,
                title: level_name_lookup[NUM_HIGHLIGHT_STATES][i],
                contexts: [context],
                parentId: global_menu_id
            };
            if (icons_supported) {
                const iconName = highlightStateToIconId(i) + 'highlight';
                properties.icons = {
                    '16': `icons/${iconName}16x16.png`,
                    '32': `icons/${iconName}32x32.png`,
                };
            }
            chrome.contextMenus.create(properties);
        }

        // Add autonomous highlights items
        const autonomous_menu_id = 'autonomous_' + context;
        properties = {
            type: 'normal',
            id: autonomous_menu_id,
            title: 'Autonomous Highlights',
            contexts: [context],
        };
        if (icons_supported) {
            properties.icons = {
                '16': 'icons/autonomous16x16.png',
                '32': 'icons/autonomous32x32.png',
            };
        }
        if (main_menu_id !== null)
            properties.parentId = main_menu_id;
        chrome.contextMenus.create(properties);
        const autonomous_titles = {
            hostname_blocklist: 'Add hostname to blocklist',
            address_blocklist: 'Add page address to blocklist',
            hostname_exception: 'Add hostname as blocklist exception',
            address_exception: 'Add page address as blocklist exception',
        };
        for (const target of ['blocklist', 'exception']) {
            for (const item_type of ['hostname', 'address']) {
                const id = `autonomous_${item_type}_${target}_${context}`;
                const title = autonomous_titles[`${item_type}_${target}`];
                properties = {
                    type: 'normal',
                    id: id,
                    title: title,
                    contexts: [context],
                    parentId: autonomous_menu_id
                };
                if (icons_supported) {
                    properties.icons = {
                        '16': `icons/autonomous_${item_type}_${target}16x16.png`,
                        '32': `icons/autonomous_${item_type}_${target}32x32.png`,
                    };
                }
                chrome.contextMenus.create(properties);
            }
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
            if (icons_supported) {
                properties.icons = {
                    '16': 'icons/options16x16.png',
                    '32': 'icons/options32x32.png',
                }
            }
            if (main_menu_id !== null)
                properties.parentId = main_menu_id;
            chrome.contextMenus.create(properties);
        }
    }

    const joined_contexts = contexts.join('|');
    // Matches pattern: 'highlight_NUM_CONTEXT'
    const highlight_re = new RegExp(
        `^highlight_[0-${NUM_HIGHLIGHT_STATES - 1}]_(?:${joined_contexts})$`);
    // Matches pattern: 'global_NUM_CONTEXT'
    const global_re = new RegExp(
        `^global_[0-${NUM_HIGHLIGHT_STATES - 1}]_(?:${joined_contexts})$`);
    // Matches pattern: 'global_CONTEXT'
    const options_re = new RegExp(`^options_(?:${joined_contexts})$`);

    chrome.contextMenus.onClicked.addListener(function(info, tab) {
        const id = info.menuItemId;
        if (id.match(highlight_re) !== null) {
            const level = parseInt(id.slice('highlight_'.length).split('_')[0]);
            highlight(tab.id, true, level, 'document_end');
        } else if (id.match(global_re) !== null) {
            const level = parseInt(id.slice('global_'.length).split('_')[0]);
            chrome.permissions.request(
                getPermissions('global_highlighting'),
                function (granted) {
                    if (granted)
                        highlightAll(level);
                });
        } else if (id.match(options_re)) {
            chrome.runtime.openOptionsPage();
        } else if (id.startsWith('autonomous_')) {
            const splits = id.split('_');
            const item_type = splits[1];  // hostname or address
            const target = splits[2];     // blocklist or exception
            const item = {type: item_type};
            if (item_type === 'hostname') {
                item.data = new URL(tab.url).hostname;
            } else if (item_type === 'address') {
                item.data = tab.url;
            } else {
                throw 'Unhandled item type: ' + item_type;
            }
            const options = getOptions();
            let key;
            if (target === 'blocklist') {
                key = 'autonomous_blocklist_items';
            } else if (target === 'exception') {
                key = 'autonomous_blocklist_exceptions';
            } else {
                throw 'Unhandled target: ' + target;
            }
            options[key].push(item);
            saveOptions(options);
        } else {
            throw 'Unhandled menu ID: ' + id;
        }
    });
}
