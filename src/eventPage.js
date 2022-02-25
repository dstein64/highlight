// TODO: Use consistent variable naming (camel case or underscores, not both)

importScripts('matchPattern.js', 'shared.js');

// *****************************
// * Utilities and Options
// *****************************

(function() {
    // Validate options
    chrome.storage.local.get({options: {}}, function(result) {
        let opts = result.options;
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
    });
})();

// *****************************
// * Core
// *****************************

// show the correct highlight icon
const updateIcon = function(tabId, highlight, success) {
    const setIcon = function(iconId) {
        const path19 = '../icons/' + iconId + 'highlight19x19.png';
        const path38 = '../icons/' + iconId + 'highlight38x38.png';
        chrome.action.setIcon({
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

// Injects Auto Highlight if it hasn't been injected yet, and runs the specified callback.
const injectThenRun = function(tabId, runAt='document_idle', callback=function() {}) {
    let fn = callback;
    // First check if the current page is supported by trying to inject no-op code.
    // (e.g., https://chrome.google.com/webstore, https://addons.mozilla.org/en-US/firefox/,
    // chrome://extensions/, and other pages do not support extensions).
    chrome.scripting.executeScript({
        target: {tabId: tabId},
        func: () => {
            (function () {})();
        }
    }, (results) => {
        if (chrome.runtime.lastError) {
            // Earlier versions used an option to injectThenRun to specify whether an error
            // message should be shown here using alert():
            //   Auto Highlight is not supported on this page.
            // This was avoided on Firefox, since it led to an error popup, and also avoided
            // for non-user actions (e.g., autonomous highlights).
            // However, with manifest v3's service workers, showing a message with alert()
            // is not possible.
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
                    fn = () => {
                        // Only inject into the top-level frame. More permissions than activeTab
                        // would be required for iframes of different origins.
                        // https://stackoverflow.com/questions/59166046/using-tabs-executescript-in-iframe
                        // The same permissions used for global highlighting seem to suffice.
                        const styles = ['src/style.css'];
                        chrome.scripting.insertCSS({
                            target: {tabId: tabId, allFrames: false},
                            files: styles
                        }, () => {
                            const scripts = [
                                'src/lib/readabilitySAX/readabilitySAX.js',
                                'src/lib/Porter-Stemmer/PorterStemmer1980.js',
                                'src/nlp.js',
                                'src/content.js'
                            ];
                            chrome.scripting.executeScript({
                                target: {tabId: tabId, allFrames: false},
                                files: scripts
                            }, () => {
                                callback();
                            });
                        });
                    }
                }
                fn();
            });
    });
};

// setting state to null results in automatically incrementing the state.
const highlight = function(tabId, state=null, runAt='document_idle', delay=0) {
    if (state !== null && (state < 0 || state >= NUM_HIGHLIGHT_STATES)) {
        console.error(`invalid state: ${state}`);
        return;
    }
    const sendHighlightMessage = function() {
        chrome.tabs.sendMessage(
            tabId,
            {
                method: 'highlight',
                highlightState: state,
                delay: delay
            });
    };
    injectThenRun(tabId, runAt, sendHighlightMessage);
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
    chrome.storage.local.get(['options'], (storage) => {
        const options = storage.options;
        if (options.autonomous_highlights && changeInfo.status === 'complete') {
            if (options.autonomous_blocklist) {
                const url = tab.url;
                if (url === undefined) return;
                const exception = url_matches(url, options.autonomous_blocklist_exceptions);
                if (!exception && url_matches(url, options.autonomous_blocklist_items))
                    return;
            }
            highlight(
                tab.id, options.autonomous_state, 'document_idle', options.autonomous_delay);
        }
    });
});

const highlightAll = function(state) {
    chrome.tabs.query({}, function(tabs) {
        for (let i = 0; i < tabs.length; ++i) {
            highlight(tabs[i].id, state, 'document_end');
        }
    });
};

chrome.action.onClicked.addListener(function(tab) {
    highlight(tab.id, null, 'document_end');
});

chrome.permissions.onRemoved.addListener(function() {
    chrome.storage.local.get(['options'], (storage) => {
        // saveOptions() handles the check for missing permissions.
        saveOptions(storage.options);
    });
});

chrome.runtime.onMessage.addListener(function(request, sender, response) {
    const message = request.message;
    if (message === 'updateIcon') {
        updateIcon(sender.tab.id, request.highlight, request.success);
    } else if (message === 'getParams') {
        response({'numHighlightStates': NUM_HIGHLIGHT_STATES});
    } else if (message === 'highlightAll') {
        highlightAll(request.state);
        // Respond so that a callback can be executed without "Unchecked runtime.lastError".
        response(true);
    }
    // NOTE: if you're going to call response asynchronously,
    //       be sure to return true from this function.
    //       http://stackoverflow.com/questions/20077487/
    //              chrome-extension-message-passing-response-not-sent
});

// *****************************
// * Context Menu
// *****************************

// Context menus are removed then re-created when the service worker resumes.
// This avoids the following error on each context menu creation:
//   Unchecked runtime.lastError: Cannot create item with duplicate id _______
chrome.contextMenus.removeAll(function() {
    // As of 2019/9/18, Chrome does not support icons.
    const icons_supported = IS_FIREFOX;
    const black_square = String.fromCodePoint('0x25FC');
    const white_square = String.fromCodePoint('0x25FB');
    const level_emoji_lookup = {};
    for (let i = 0; i < NUM_HIGHLIGHT_STATES; i++) {
        level_emoji_lookup[i] = '';
        for (let j = 0; j < NUM_HIGHLIGHT_STATES - 1; j++) {
            level_emoji_lookup[i] += j < i ? black_square : white_square;
        }
    }
    let properties;

    const level_name_lookup = {
        2: {0: 'Off', 1: 'On'},
        3: {0: 'None', 1: 'Partial', 2: 'Max'},
        4: {0: 'None', 1: 'Low', 2: 'High', 3: 'Max'}
    };

    const contexts = ['page', 'action'];
    for (const context of contexts) {
        // Add highlighting items.
        let highlight_menu_id = 'highlight_' + context;
        properties = {
            type: 'normal',
            id: highlight_menu_id,
            title: 'State',
            contexts: [context]
        };
        if (icons_supported) {
            properties.icons = {
                '16': 'icons/state16x16.png',
                '32': 'icons/state32x32.png',
            };
        } else {
            properties.title = String.fromCodePoint('0x1F39B') + ' ' + properties.title;
        }
        chrome.contextMenus.create(properties);
        for (let i = 0; i < NUM_HIGHLIGHT_STATES; ++i) {
            const id = `highlight_${i}_${context}`;
            properties = {
                type: 'normal',
                id: id,
                title: level_name_lookup[NUM_HIGHLIGHT_STATES][i],
                contexts: [context],
                parentId: highlight_menu_id
            };
            if (icons_supported) {
                const iconName = highlightStateToIconId(i) + 'highlight';
                properties.icons = {
                    '16': `icons/${iconName}16x16.png`,
                    '32': `icons/${iconName}32x32.png`,
                };
            } else {
                properties.title = level_emoji_lookup[i] + ' ' + properties.title;
            }
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
        } else {
            properties.title = String.fromCodePoint('0x1F30E') + ' ' + properties.title;
        }
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
            } else {
                properties.title = level_emoji_lookup[i] + ' ' + properties.title;
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
        } else {
            properties.title = String.fromCodePoint('0x1F916') + ' ' + properties.title;
        }
        chrome.contextMenus.create(properties);
        const autonomous_titles = {
            hostname_blocklist: 'Add hostname to blocklist',
            address_blocklist: 'Add page address to blocklist',
            hostname_exception: 'Add hostname as blocklist exception',
            address_exception: 'Add page address as blocklist exception',
        };
        const autonomous_emoji_lookup = {
            hostname_blocklist: String.fromCodePoint('0x1F534'),
            address_blocklist: String.fromCodePoint('0x1F7E5'),
            hostname_exception: String.fromCodePoint('0x1F7E2'),
            address_exception: String.fromCodePoint('0x1F7E9')
        };
        for (const target of ['blocklist', 'exception']) {
            for (const item_type of ['hostname', 'address']) {
                const id = `autonomous_${item_type}_${target}_${context}`;
                const key = `${item_type}_${target}`;
                const title = autonomous_titles[key];
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
                } else {
                    properties.title = autonomous_emoji_lookup[key] + ' ' + properties.title;
                }
                chrome.contextMenus.create(properties);
            }
        }

        // Add copy-to-clipboard item
        const clipboard_id = 'clipboard_' + context;
        properties = {
            type: 'normal',
            id: clipboard_id,
            title: 'Copy Highlights',
            contexts: [context]
        };
        if (icons_supported) {
            properties.icons = {
                '16': 'icons/clipboard16x16.png',
                '32': 'icons/clipboard32x32.png',
            }
        } else {
            properties.title = String.fromCodePoint('0x1F4DD') + ' ' + properties.title;
        }
        chrome.contextMenus.create(properties);

        // Add an options item for 1) the 'page' context and 2) the 'browser_action' context
        // on Firefox, since it doesn't have an Options item. This is not added for the
        // 'browser_action' context on Chrome, since it already has an Options item.
        if (context === 'page' || IS_FIREFOX) {
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
            } else {
                properties.title = String.fromCodePoint('0x1F527') + ' ' + properties.title;
            }
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
    // Matches pattern: 'clipboard_CONTEXT'
    const clipboard_re = new RegExp(`^clipboard_(?:${joined_contexts})$`);
    // Matches pattern: 'options_CONTEXT'
    const options_re = new RegExp(`^options_(?:${joined_contexts})$`);

    chrome.contextMenus.onClicked.addListener(function(info, tab) {
        const id = info.menuItemId;
        if (id.match(highlight_re) !== null) {
            const level = parseInt(id.slice('highlight_'.length).split('_')[0]);
            highlight(tab.id, level, 'document_end');
        } else if (id.match(global_re) !== null) {
            const level = parseInt(id.slice('global_'.length).split('_')[0]);
            chrome.permissions.request(
                getPermissions('global_highlighting'),
                function (granted) {
                    if (granted)
                        highlightAll(level);
                });
        } else if (id.match(clipboard_re) !== null) {
            // On Firefox, copying to the clipboard with execCommand('copy') requires the
            // clipboardWrite permission to avoid an exception:
            // > "document.execCommand(‘cut’/‘copy’) was denied because it was not called
            // > from inside a short running user-generated event handler."
            // On Chrome, the permission is "recommended for extensions and packaged apps"
            // when using execCommand('copy').
            // https://developer.chrome.com/docs/extensions/mv2/declare_permissions/
            chrome.permissions.request(
                getPermissions('copy_highlights'),
                function (granted) {
                    if (granted) {
                        // Inject Auto Highlight prior to sending the message so that there is always
                        // a handler to process the message, even prior to the initial highlight request.
                        injectThenRun(tab.id, 'document_idle', function() {
                            chrome.tabs.sendMessage(tab.id, {method: 'copyHighlights'});
                        });
                    }
                });
        } else if (id.match(options_re) !== null) {
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
                throw new Error('Unhandled item type: ' + item_type);
            }
            chrome.storage.local.get(['options'], (storage) => {
                const options = storage.options;
                let key;
                if (target === 'blocklist') {
                    key = 'autonomous_blocklist_items';
                } else if (target === 'exception') {
                    key = 'autonomous_blocklist_exceptions';
                } else {
                    throw new Error('Unhandled target: ' + target);
                }
                options[key].push(item);
                saveOptions(options);
            });
        } else {
            throw new Error('Unhandled menu ID: ' + id);
        }
    });
});
