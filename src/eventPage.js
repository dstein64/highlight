// TODO: Use consistent variable naming (camel case or underscores, not both)

// *****************************
// * Utilities and Options
// *****************************

var getVersion = function() {
    var version = chrome.runtime.getManifest().version;
    return version;
};

var getOptions = function() {
    var opts = localStorage["options"];
    if (opts) {
        opts = JSON.parse(opts);
    }
    return opts;
};

var defaultOptions = function() {
    var options = Object.create(null);
    var yellow = "#FFFF00";
    var black = "#000000";
    var red = "#FF0000";
    options['highlight_color'] = yellow;
    options['text_color'] = black;
    options['link_color'] = red;
    return options;
};

// Validate options
(function() {
    var opts = getOptions();
    if (!opts) {
        opts = Object.create(null);
    }
    
    var defaults = defaultOptions();
  
    // Set missing options using defaults.
    
    var default_keys = Object.keys(defaults);
    for (var i = 0; i < default_keys.length; i++) {
        var default_key = default_keys[i];
        if (!(default_key in opts)) {
            opts[default_key] = defaults[default_key];
        }
    }
    
    // Remove unknown options (these may have been set
    // by previous versions of the extension).
    var opt_keys = Object.keys(opts);
    for (var i = 0; i < opt_keys.length; i++) {
        var opt_key = opt_keys[i];
        if (!(opt_key in defaults)) {
            delete opts[opt_key];
        }
    }
  
    localStorage["options"] = JSON.stringify(opts);
})();

// *****************************
// * Core
// *****************************

var onStartup = false; // have we heard from onStartup?
chrome.runtime.onStartup.addListener(function() {
    onStartup = true;
});

// a highlightState is a list with highlight state and success state
// this is used to manage highlight state, particularly for keeping
// icon in sync, and telling content.js what state to change to
var tabIdToHighlightState = new Map();

chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
    // don't have to check if tabId in map. delete will still work, but
    // will return false
    tabIdToHighlightState.delete(tabId);
});

var highlightStates = 4; // total number of states

// updates highlight state in tabIdToHighlightState, and also used to
// show the correct highlight icon
var updateHighlightState = function(tabId, highlight, success) {
    // null represents 'unknown'
    // true should always clobber false (for iframes)
    success = (typeof success) === 'undefined' ? null : success;
    // never change state indicating successful highlighting
    // to unsuccessful highlighting. This is to accommodate that different
    // iframes can send conflicting status.
    // If one succeeded, keep that state
    var curHighlight = 0;
    var curSuccess = null;
    if (tabIdToHighlightState.has(tabId)) {
        var curState = tabIdToHighlightState.get(tabId);
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
    
    // now that we've updated state, show the corresponding icon
    var iconName = highlight + 'highlight';
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
    var proceed = request && sender && sender.tab;
    if (!proceed)
        return;
    var message = request.message;
    var tabId = sender.tab.id;
    if (message === 'updateHighlightState') {
        updateHighlightState(tabId, request.highlight, request.success);
    } else if (message === 'getHighlightState') {
        var highlightState = tabIdToHighlightState.get(tabId);
        response({
            'curHighlight': highlightState[0],
            'curSuccess': highlightState[1]});
    } else if (message === 'getOptions') {
        response(getOptions());
    }
    // NOTE: if you're going to call response asynchronously,
    //       be sure to return true from this function.
    //       http://stackoverflow.com/questions/20077487/
    //              chrome-extension-message-passing-response-not-sent
});

var inject = function(callback=function() {}) {
    var scripts = [
        'src/lib/readabilitySAX/readabilitySAX.js',
        'src/lib/Porter-Stemmer/PorterStemmer1980.js',
        'src/nlp.js',
        'src/utils.js',
        'src/content.js',
        'src/style.css'
    ];
    let fn = callback;
    for (var i = scripts.length - 1; i >= 0; --i) {
        let script = scripts[i];
        let fn_ = fn;
        fn = function() {
            let inject_ = function(id, options, callback) {callback()};
            if (script.endsWith('.css')) {
                inject_ = chrome.tabs.insertCSS;
            } else if (script.endsWith('.js')) {
                inject_ = chrome.tabs.executeScript;
            }
            inject_({file: script, allFrames: true}, fn_);
        }
    }
    fn();
};

chrome.browserAction.onClicked.addListener(function(tab) {
    var highlight = function() {
        var highlightState = tabIdToHighlightState.get(tab.id)[0];
        chrome.tabs.sendMessage(
            tab.id,
            {
                method: 'highlight',
                highlightState: (highlightState + 1) % highlightStates
            });
    };
    // First check if the current page is supported by trying to inject no-op code.
    // (e.g., https://chrome.google.com/webstore, chrome://extensions/, and other pages
    // do not support extensions).
    chrome.tabs.executeScript(
        {code: '(function(){})();'},
        function() {
            if (chrome.runtime.lastError) {
                alert("highlighting is not supported on this page.");
                return;
            }
            chrome.tabs.sendMessage(
                tab.id,
                {method: 'ping'},
                {},
                function(resp) {
                    // On Firefox, in some cases just checking for lastError is not
                    // sufficient.
                    if (chrome.runtime.lastError || !resp) {
                        inject(highlight);
                    } else {
                        highlight();
                    }
                });
        });
});
