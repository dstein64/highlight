// for options use localStorage. don't need any chrome.storage functionality.

// default option values are set in eventPage.js

var curTimer = null;
var statusMessage = function(message, time) {
    time = (typeof time === 'undefined') ? 1500 : time;
    var element = document.getElementById("status");
    if (curTimer)
        clearTimeout(curTimer);
    element.innerHTML = message;
    var timer = setTimeout(function() {
        element.innerHTML = "";
        curTimer = null;
    }, time);
    curTimer = timer;
};

var save_options = function() {
    var options = Object.create(null);
    options['coverage'] = document.getElementById('coverageRange').value;
    
    localStorage['options'] = JSON.stringify(options);
    chrome.tabs.query({}, function(tabs) {
        for (var i = 0; i < tabs.length; i++) {
            var tab = tabs[i];
            chrome.tabs.sendMessage(tab.id, {method: 'updateOptions', data: options});
        }
    });

    // Update status to let user know options were saved.
    statusMessage("Options Saved");
};

var restore_options = function(options) {
    var coverage = options['coverage'];
    document.getElementById('coverageRange').value = coverage;
    showCoverageValue();
};

var load_defaults = function() {
    // message passing didn't work from options page to background page, so call directly
    var defaults = chrome.extension.getBackgroundPage().defaultOptions();
    restore_options(defaults);
    statusMessage("Defaults Loaded");
};

var showCoverageValue = function() {
    var rangeVal = document.getElementById('coverageRange').value;
    document.getElementById("coverageVal").innerHTML = rangeVal;
};

document.addEventListener('DOMContentLoaded', function() {
    // we must have something in localStorage, as eventPage.js sets defaults if options don't exist yet
    restore_options(JSON.parse(localStorage['options']));
    
    document.getElementById('save-button').addEventListener('click', save_options);
    document.getElementById('defaults-button').addEventListener('click', load_defaults);
    // if you just listen to change event, it will require a mouse release to change
    document.getElementById('coverageRange').addEventListener('input', showCoverageValue);
});

