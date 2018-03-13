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

// Maps color ID to a list of properties
// (name, background/highlight color, text color, link color)
var COLOR_MAP = {
    'yellow': ['Yellow', 'yellow',     'black', 'red'],
    'blue':   ['Blue',   'skyblue',    'black', 'red'],
    'orange': ['Orange', 'sandybrown', 'black', 'red'],
    'green':  ['Green',  'palegreen',  'black', 'red'],
    'pink':   ['Pink',   'lightpink',  'black', 'red']
};

var defaultOptions = function() {
    var options = Object.create(null);
    options['color'] = 'yellow';
    return options;
};

// Set missing options using defaults
(function() {
    var opts = getOptions();
    if (!opts) {
        opts = Object.create(null);
    }
    
    var defaults = defaultOptions();
    
    var keys = Object.keys(defaults);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (!(key in opts)) {
            opts[key] = defaults[key];
        }
    }
  
    ocalStorage["options"] = JSON.stringify(opts);
})();

// *****************************
// * Core
// *****************************

// list of content scripts we've heard from
// this gets sent earlier than tabIdToHighlightState
// reflects. (removal code is below)
var ping = new Set();

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
    // will return false a hacky way to call tabIdToHighlightState.delete,
    // which doesn't give IDE errors
    tabIdToHighlightState['delete'](tabId);
    ping['delete'](tabId);
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
    
    chrome.pageAction.setIcon({path: {'19': path19,
                                      '38': path38},
                               tabId: tabId});
    chrome.pageAction.show(tabId);
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
        response({'curHighlight': highlightState[0],
                  'curSuccess': highlightState[1]});
    } else if (message === 'getOptions') {
        response(getOptions());
    } else if (message === 'ping') {
        ping.add(tabId);
    } else if (message === 'getSharedGlobals') {
        sharedGlobals = {
            'COLOR_MAP': COLOR_MAP
        };
        response(sharedGlobals);
    }
    // NOTE: if you're going to call response asynchronously,
    //       be sure to return true from this function.
    //       http://stackoverflow.com/questions/20077487/
    //              chrome-extension-message-passing-response-not-sent
});

chrome.pageAction.onClicked.addListener(function(tab) {
    var tabId = tab.id;
    var highlightState = tabIdToHighlightState.get(tabId)[0];
    chrome.tabs.sendMessage(
        tabId, { method: 'highlight',
                 highlightState: (highlightState+1) % highlightStates });
});

// js is a boolean indicating whehter script is javascript.
// if false, assumed to be css
var ContentScript = function(script, js, allFrames, runAt) {
    this.script = script;
    this.js = js;
    this.allFrames = allFrames;
    this.runAt = runAt;
};

// manually inject the content scripts
// never do this more than once (per eventPage.js execution)
//
// manualInject won't inject if we've already manually injected, or if
// there have been any signs of life (ping) from a content script, or if
// we've heard onStartup (since in that case tabs will get content auto
// injected)
var mInjected = false;
var manualInject = function(force) {
    force = (typeof force) === 'undefined' ? false : force;
    // don't check for whether some tab pinged, since it's possible that
    // a new tab was loaded (or some tab refreshed) during the delay until
    // manual injection
    // We'll check on an individual bases later
    if (!force && (onStartup || mInjected))
        return false;
    mInjected = true;
    
    var contentScripts = [];
    var manifest = chrome.runtime.getManifest();
    
    for (var h = 0; h < manifest.content_scripts.length; h++) {
        var _content_scripts = manifest.content_scripts[h];
        var all_frames = false;
        if ('all_frames' in _content_scripts) {
            all_frames = _content_scripts['all_frames'];
        }
        
        // it probably doesn't matter what we have this set to, since the
        // page has already loaded. This is the "soonest" the file can run,
        // but in this injection case, it's probably already past document_end.
        var run_at = 'document_idle';
        if ('run_at' in _content_scripts) {
            run_at = _content_scripts['run_at'];
        }
        
        if (_content_scripts && ('css' in _content_scripts)) {
            for (var i = 0; i < _content_scripts.css.length; i++) {
                var css = _content_scripts.css[i];
                var cs = new ContentScript(css, false, all_frames, run_at);
                contentScripts.push(cs);
            }
        }
        
        if (_content_scripts && ('js' in _content_scripts)) {
            for (var i = 0; i < _content_scripts.js.length; i++) {
                var js = _content_scripts.js[i];
                var cs = new ContentScript(js, true, all_frames, run_at);
                contentScripts.push(cs);
            }
        }
    }
    
    // for each tab, scripts are injected in order, using callbacks. This
    // allows injected = true to work, since you want that to be set before
    // the following scripts are injected (since they may rely on that value)
    chrome.tabs.query({}, function(tabs) {
        for (var i = 0; i < tabs.length; i++) {
            var tab = tabs[i];
            var tabId = tab.id;
            
            // no need to inject if page already had injection
            // note to self: there could be multiple entries in manifest
            //               content_scripts, so we might end up here
            //               multiple times. could alternative loop through
            //               tabs on the outer loop.
            if (ping.has(tabId)) {
                continue;
            }
            
            var url = tab.url;
            if (/^(?:http|https|ftp|file):\/\//.test(url)) {
                
                (function(id) {
                    var inject = function(remaining) {
                        if (remaining.length <= 0)
                            return;
                        
                        var first = remaining[0];
                        
                        if (!first.js) {
                            var options = {file: first.script,
                                           allFrames: first.allFrames};
                            chrome.tabs.insertCSS(id, options, function() {
                                if (chrome.runtime.lastError) {}
                                inject(remaining.slice(1));
                            });
                        } else {
                            var options = {file: first.script,
                                           allFrames: first.allFrames,
                                           runAt: first.runAt};
                            chrome.tabs.executeScript(
                                id, options, function() {
                                    // just checking with a call to
                                    // chrome.runtime.lastError
                                    // is sufficient to suppress chrome
                                    // warning.
                                    if (chrome.runtime.lastError) {}
                                    // check for error so chrome doesn't
                                    // throw error
                                    // this happens because some pages,
                                    // like the Chrome web store,
                                    // cannot have scripts injected
                                    //console.warn(
                                    //    chrome.runtime.lastError.message);
                                    
                                    if (first.script === 'src/prepare.js') {
                                        // let the extension know we were
                                        // injected (prepare.js is the first
                                        // script loaded, so later scripts
                                        // can use this information
                                        chrome.tabs.executeScript(id, {
                                                code: 'injected = true;',
                                                // use same all_frames that
                                                // was used for injecting
                                                // src/prepare.js,
                                                allFrames: first.allFrames
                                            },
                                            function() {
                                                if (chrome.runtime.lastError) {}
                                                inject(remaining.slice(1));
                                        });
                                    } else {
                                        inject(remaining.slice(1));
                                    }
                                    
                                    // you wrapped the function you're in,
                                    // to pass id. Otherwise it would take
                                    // on it's value from outside the closure
                                });
                        }
                    };
                    inject(contentScripts);
                    
                })(tabId);
            }
        }
    });
    
    
    return true;
};

// first, listen for events that you want to manually inject for
chrome.runtime.onInstalled.addListener(function(details){
    var reason = details.reason;
    var extensionLoaded = (reason === "install" || reason === "update");
    if (extensionLoaded) {
        manualInject();
    }
});

// also, here's a fallback for cases that need manual injection but don't
// have an event to listen for (like enabling when extension is currently
// disabled) The delay is to give time to hear from a content script or
// onStartup in case Chrome is currently starting up and will already inject.
// Injecting multiple times should not be a problem in case that happens.
// Some stuff may be redefined, and removeHighlight gets called.
setTimeout(function() {
    manualInject();
}, 2000);
