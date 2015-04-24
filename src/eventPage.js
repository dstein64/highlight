// Default Options (don't need chrome.storage for options)
var defaultOptions = function() {
    var options = Object.create(null);
    options['coverage'] = 20;
    return options;
};
if (!localStorage['options']) {
    var options = defaultOptions();
    localStorage['options'] = JSON.stringify(options);
}
// TODO: if we have missing options, they should be set using the default values...

var ping = new Set(); // list of content scripts we've heard from
                      // this gets sent earlier than tabIdToHighlightState
                      // reflects. (removal code is below)

var onStartup = false; // have we heard from onStartup?
chrome.runtime.onStartup.addListener(function() {
    onStartup = true;
});

// a highlightState is a list with highlight state and success state
// this is used to manage highlight state, particularly for keeping icon in sync,
// and telling content.js what state to change to
var tabIdToHighlightState = new Map();

chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
    // don't have to check if tabId in map. delete will still work, but will return false
    // a hacky way to call tabIdToHighlightState.delete, which doesn't give IDE errors
    tabIdToHighlightState['delete'](tabId);
    ping['delete'](tabId);
});

var highlightStates = 2; // total number of states

// updates highlight state in tabIdToHighlightState, and also used to
// show the correct highlight icon
var updateHighlightState = function(tabId, highlight, success) {
    // default to null, which is used to represent 'unknown'
    success = (typeof success) === 'undefined' ? null : success;
    // never change state indicating successful highlighting
    // to unsuccessful highlighting. This is to accommodate that different
    // iframes can send conflicting status. If one succeeded, keep that state
    if (tabIdToHighlightState.has(tabId)) {
        var curState = tabIdToHighlightState.get(tabId);
        var curHighlight = curState[0];
        var curSuccess = curState[1];
        if ((curHighlight === highlight) && (curSuccess === true)) { // could just check curSuccess, but since null has meaning too, this is clearer IMO
            // if state has not changed, and we already have a successful icon,
            // keep it (to prevent iframe overriding)
            return;
        }
    }
    tabIdToHighlightState.set(tabId, [highlight, success]);
    
    // now that we've updated state, show the corresponding icon
    var iconName = 'whiteHighlight';
    if (highlight === 1)
        iconName = 'yellowHighlight';
    if (highlight > 0 && (success === false)) // can't just check !success, since null has meaning here
        iconName += 'X';
    path19 = 'icons/' + iconName + '19x19.png';
    path38 = 'icons/' + iconName + '38x38.png';
    chrome.pageAction.setIcon({path: {'19': path19, '38': path38}, tabId: tabId});
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
        response({'curHighlight': highlightState[0], 'curSuccess': highlightState[1]});
    } else if (message === 'ping') {
        ping.add(tabId);
    } else if (message === 'defaultOptions') {
        var options = defaultOptions();
        response(options);
    } else if (message === 'getOptions') {
        var options = JSON.parse(localStorage['options']);
        response(options);
    }
    // NOTE: if you're going to call response asynchronously, be sure to return true
    // from this function. http://stackoverflow.com/questions/20077487/chrome-extension-message-passing-response-not-sent
});

chrome.pageAction.onClicked.addListener(function(tab) {
    var tabId = tab.id;
    var highlightState = tabIdToHighlightState.get(tabId)[0];
    chrome.tabs.sendMessage(tabId, { method: 'highlight',
                             highlightState: (highlightState+1) % highlightStates });
});

// manually inject the content scripts
// never do this more than once (per eventPage.js execution)
//
// manualInject won't inject if we've already manually injected, or if there
// have been any signs of life (ping) from a content script,
// or if we've heard onStartup (since in that case tabs will get content auto injected)
var mInjected = false;
var manualInject = function(force) {
    force = (typeof force) === 'undefined' ? false : force;
    // don't check for whether some tab pinged, since it's possible that a new tab was loaded
    // (or some tab refreshed) during the delay until manual injection
    // We'll check on an individual bases later
    if (!force && (onStartup || mInjected))
        return false;
    mInjected = true;
    chrome.tabs.query({}, function(tabs) {
        var manifest = chrome.runtime.getManifest();
        for (var h = 0; h < manifest.content_scripts.length; h++) {
            var _content_scripts = manifest.content_scripts[h];
            var all_frames = false;
            if ('all_frames' in _content_scripts) {
                all_frames = _content_scripts['all_frames'];
            }
            
            // it probably doesn't matter what we have this set to, since the page
            // has already loaded. This is the "soonest" the file can run, but in this
            // injection case, it's probably already past document_end.
            var run_at = 'document_idle';
            if ('run_at' in _content_scripts) {
                run_at = _content_scripts['run_at'];
            }
            
            var js = [];
            if (_content_scripts && ('js' in _content_scripts)) {
                js = js.concat(_content_scripts.js);
            }
            
            var css = [];
            if (_content_scripts && ('css' in _content_scripts)) {
                css = css.concat(_content_scripts.css);
            }
            
            for (var i = 0; i < tabs.length; i++) {
                var tab = tabs[i];
                var tabId = tab.id;
                
                // no need to inject if page already had injection
                // note to self: there could be multiple entries in manifest.content_scripts, so we might end
                // up here multiple times. could alternative loop through tabs on the outer loop.
                if (ping.has(tabId)) {
                    continue;
                }
                
                var url = tab.url;
                if (/^(?:http|https|ftp|file):\/\//.test(url)) {
                    for (var j = 0; j < js.length; j++) {
                        var script = js[j];
                        var options = {file: script, allFrames: all_frames, runAt: run_at};
                        chrome.tabs.executeScript(tabId, options, function(id, _script, _all_frames) {
                            return function() {
                                // just checking with a call to chrome.runtime.lastError
                                // is sufficient to suppress chrome warning.
                                if (chrome.runtime.lastError) {
                                    // check for error so chrome doesn't throw error
                                    // this happens because some pages, like the Chrome web store,
                                    // cannot have scripts injected
                                    //console.warn(chrome.runtime.lastError.message);
                                }
                                
                                // you wrapped the function you're in, to pass id. Otherwise it would
                                // take on it's value from outside the closure
                                                                
                                if (_script === 'src/prepare.js') {
                                    // let the extension know we were injected (prepare.js is the first script loaded, so later
                                    // scripts can use this information
                                    chrome.tabs.executeScript(id, {
                                            code: 'injected = true;',
                                            allFrames: _all_frames // use same all_frames that was used for injecting src/prepare.js,
                                        },
                                        function() {
                                            if (chrome.runtime.lastError) {}
                                    });
                                }
                            };
                        }(tabId, script, all_frames));
                    }
                    
                    for (var j = 0; j < css.length; j++) {
                        var sheet = css[j];
                        var options = {file: sheet, allFrames: all_frames};
                        chrome.tabs.insertCSS(tabId, options, function() {
                            if (chrome.runtime.lastError) {}
                        });
                    }
                }
            }
        }
    });
    return true;
};

// first, listen for events that you want to manually inject for
chrome.runtime.onInstalled.addListener(function(details){
    var reason = details.reason;
    var extensionLoaded = (reason === "install" || reason == "update");
    if (extensionLoaded) {
        manualInject();
    }
});

// also, here's a fallback for cases that need manual injection but don't have
// an event to listen for (like enabling when extension is currently disabled)
// The delay is to give time to hear from a content script or onStartup in case
// Chrome is currently starting up and will already inject.
// Injecting multiple times should not be a problem in case that happens.
// Some stuff may be redefined, and removeHighlight gets called.
setTimeout(function() {
    manualInject();
}, 2000);
