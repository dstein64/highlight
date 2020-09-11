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
    // never change state indicating successful highlighting
    // to unsuccessful highlighting. This is to accommodate that different
    // iframes can send conflicting status.
    // If one succeeded, keep that state
    let curHighlight = 0;
    let curSuccess = null;
    if (tabIdToHighlightState.has(tabId)) {
        const curState = tabIdToHighlightState.get(tabId);
        curHighlight = curState[0];
        curSuccess = curState[1];
        // could just check (curSuccess), but since null has meaning too,
        // this is clearer IMO
        if (success === false
                && curSuccess === true
                && curHighlight > 0) {
            // if state has not changed, and we already have a successful
            // icon, keep it (to prevent iframe overriding)
            return;
        }
    }

    // have to check for false. for null we don't want to set to zero.
    if (success === false)
        highlight = 0;

    tabIdToHighlightState.set(tabId, [highlight, success]);

    // now that we've updated state, show the corresponding icon.
    // for highlight states greater than 0, jump to a less-full highlighter icon if there are less
    // than 4 total highlight states.
    let iconName = highlightStateToIconId(highlight) + 'highlight';
    if (success === false)
        iconName = 'Xhighlight';

    path19 = 'icons/' + iconName + '19x19.png';
    path38 = 'icons/' + iconName + '38x38.png';

    chrome.browserAction.setIcon({
        path: {
            '19': path19,
            '38': path38
        },
        tabId: tabId
    });
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
            'curHighlight': highlightState[0],
            'curSuccess': highlightState[1]});
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

const inject = function(tabId, callback=function() {}) {
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
            inject_(tabId, {file: script, allFrames: true}, fn_);
        }
    }
    fn();
};

// setting state to null results in automatically incrementing the state.
const highlight = function(tabId, showError, state=null, delay=null) {
    if (state !== null && (state < 0 || state >= NUM_HIGHLIGHT_STATES)) {
        console.error(`invalid state: ${state}`);
        return;
    }
    const sendHighlightMessage = function() {
        if (state === null)
            state = (tabIdToHighlightState.get(tabId)[0] + 1) % NUM_HIGHLIGHT_STATES;
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
                        inject(tabId, sendHighlightMessage);
                    } else {
                        sendHighlightMessage();
                    }
                });
        });
};

// Add a listener for loading new pages, for the autonomous highlight
// functionality. Without the proper tabs permissions, highlighting will
// fail (the tabs events can seemingly still be listened for, without some
// information like URL, and without the ability to inject javascript).
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    const options = getOptions();
    if (options.autonomous_highlights && changeInfo.status === 'complete') {
        highlight(tab.id, false, options.autonomous_state, options.autonomous_delay);
    }
});

// This is called from options.js (see scope warning above).
function highlightAll(state) {
    chrome.tabs.query({}, function(tabs) {
        for (let i = 0; i < tabs.length; ++i) {
            highlight(tabs[i].id, false, state);
        }
    });
}

chrome.browserAction.onClicked.addListener(function(tab) {
    highlight(tab.id, true, null);
});
