var curTimer = null;
var statusMessage = function(message, time) {
    time = (typeof time === 'undefined') ? 1500 : time;
    var element = document.getElementById("status");
    if (curTimer)
        clearTimeout(curTimer);
    element.innerText = message;
    var timer = setTimeout(function() {
        element.innerText = "";
        curTimer = null;
    }, time);
    curTimer = timer;
};

var backgroundPage = chrome.extension.getBackgroundPage();

var highlightColorInput = document.getElementById("highlight-color");
var textColorInput = document.getElementById("text-color");
var linkColorInput = document.getElementById("link-color");

var exampleTextElement = document.getElementById("example-text");
var exampleLinkElement = document.getElementById("example-link");

// Propagates and saves options.
var propagateOptions = function() {
    highlightColor = highlightColorInput.value;
    textColor = textColorInput.value;
    linkColor = linkColorInput.value;
  
    // Update example text
    exampleTextElement.style.backgroundColor = highlightColor; 
    exampleTextElement.style.color = textColor;
    exampleLinkElement.style.backgroundColor = highlightColor; 
    exampleLinkElement.style.color = linkColor;
  
    // Save options
    var options = Object.create(null);
    options['highlight_color'] = highlightColor;
    options['text_color'] = textColor;
    options['link_color'] = linkColor;
    
    localStorage["options"] = JSON.stringify(options);
    
    // Notify tabs of the options
    chrome.tabs.query({}, function(tabs) {
        for (var i = 0; i < tabs.length; i++) {
            var tab = tabs[i];
            chrome.tabs.sendMessage(
                tab.id, {method: 'updateOptions', data: options});
        }
    });
};

var loadOptions = function(opts) {
    highlightColorInput.value = opts['highlight_color'];
    textColorInput.value = opts['text_color'];
    linkColorInput.value = opts['link_color'];
    // onchange/oninput won't fire when loading options with javascript,
    // so trigger handleChange manually.
    propagateOptions();
};

var initOpts = JSON.parse(localStorage["options"]);

// restore saved options
document.addEventListener('DOMContentLoaded', function() {
    loadOptions(initOpts);
});

// load default options
document.getElementById('defaults').addEventListener('click', function() {
    var defaults = backgroundPage.defaultOptions();
    loadOptions(defaults);
    statusMessage("Defaults Loaded", 1200);
});

document.getElementById('revert').addEventListener('click', function() {
    loadOptions(initOpts);
    statusMessage("Options Reverted", 1200);
});

// save options on any user input
(function() {
    highlightColorInput.addEventListener('change', propagateOptions);
    textColorInput.addEventListener('change', propagateOptions);
    linkColorInput.addEventListener('change', propagateOptions);
})();

// version
document.getElementById('version').innerText = backgroundPage.getVersion();
