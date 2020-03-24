var curTimer = null;
var statusMessage = function(message, time) {
    time = (typeof time === 'undefined') ? 1500 : time;
    var element = document.getElementById('status');
    if (curTimer)
        clearTimeout(curTimer);
    element.innerText = message;
    var timer = setTimeout(function() {
        element.innerText = '';
        curTimer = null;
    }, time);
    curTimer = timer;
};

var backgroundPage = chrome.extension.getBackgroundPage();

var highlightColorInput = document.getElementById('highlight-color');
var textColorInput = document.getElementById('text-color');
var linkColorInput = document.getElementById('link-color');
var tintedHighlightsInput = document.getElementById('tinted-highlights');

var exampleTextElement = document.getElementById('example-text');
var exampleLinkElement = document.getElementById('example-link');

var globalHighlightIcons = document.getElementById('global-highlight-icons');
var globalHighlightRevokeButton = document.getElementById('revoke_permissions');

var versionElement = document.getElementById('version');

versionElement.innerText = backgroundPage.getVersion();

/***********************************
 * Options
 ***********************************/

// Propagates and saves options.
var propagateOptions = function() {
    highlightColor = highlightColorInput.value;
    textColor = textColorInput.value;
    linkColor = linkColorInput.value;
    tintedHighlights = tintedHighlightsInput.checked;

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
    options['tinted_highlights'] = tintedHighlights;

    localStorage['options'] = JSON.stringify(options);

    // Notify tabs of the options
    chrome.tabs.query({}, function(tabs) {
        for (var i = 0; i < tabs.length; i++) {
            var tab = tabs[i];
            chrome.tabs.sendMessage(
                tab.id,
                {method: 'updateOptions', data: options},
                function(resp) {
                    // Check for lastError, to avoid:
                    //   'Unchecked lastError value: Error: Could not establish connection.
                    //   Receiving end does not exist.'
                    // Which would occur for tabs without the content script injected.
                    if (chrome.runtime.lastError) {}
                });
        }
    });
};

var loadOptions = function(opts) {
    highlightColorInput.value = opts['highlight_color'];
    textColorInput.value = opts['text_color'];
    linkColorInput.value = opts['link_color'];
    tintedHighlightsInput.checked = opts['tinted_highlights'];
    // onchange/oninput won't fire when loading options with javascript,
    // so trigger handleChange manually.
    propagateOptions();
};

var initOpts = JSON.parse(localStorage['options']);

// restore saved options
document.addEventListener('DOMContentLoaded', function() {
    loadOptions(initOpts);
});

// load default options
document.getElementById('defaults').addEventListener('click', function() {
    var defaults = backgroundPage.defaultOptions();
    loadOptions(defaults);
    statusMessage('Defaults Loaded', 1200);
});

document.getElementById('revert').addEventListener('click', function() {
    loadOptions(initOpts);
    statusMessage('Options Reverted', 1200);
});

// hide elements that are not relevant with less than three highlight states,
// like tinted highlighting settings and documentation.
if (backgroundPage.NUM_HIGHLIGHT_STATES < 3) {
    let items = document.getElementsByClassName('at-least-ternary');
    for (let i = 0; i < items.length; ++i) {
        items[i].style.display = 'none';
    }
}

// save options on any user input
(function() {
    highlightColorInput.addEventListener('change', propagateOptions);
    textColorInput.addEventListener('change', propagateOptions);
    linkColorInput.addEventListener('change', propagateOptions);
    tintedHighlightsInput.addEventListener('change', propagateOptions);
})();

/***********************************
 * Global Highlighting
 ***********************************/

// permissions required for global highlighting
var globalHighlightPermissions = {
    permissions: ['tabs'],
    origins: ['<all_urls>']
};

// create global highlighting links
for (let i = 0; i < backgroundPage.NUM_HIGHLIGHT_STATES; ++i) {
    let img = document.createElement('img');
    img.style.cursor = 'pointer';
    let iconName = backgroundPage.highlightStateToIconId(i) + 'highlight';
    img.src = '../icons/' + iconName + '38x38.png';
    img.height = 19;
    img.width = 19;
    // Have to put call to chrome.permissions.request in here, not backgroundPage.highlightAll,
    // to avoid "This function must be called during a user gesture" error.
    img.addEventListener('click', function() {
        chrome.permissions.request(
            globalHighlightPermissions,
            function(granted) {
                if (granted) {
                    globalHighlightRevokeButton.disabled = false;
                    backgroundPage.highlightAll(i);
                }
            });
    });
    globalHighlightIcons.appendChild(img);
}

var revokePermissions = function () {
    chrome.permissions.remove(
        globalHighlightPermissions,
        function(removed) {
            if (removed) {
                globalHighlightRevokeButton.disabled = true;
            }
        });
};

globalHighlightRevokeButton.addEventListener('click', function() {
    revokePermissions();
});

chrome.permissions.contains(
    globalHighlightPermissions,
    function(result) {
        globalHighlightRevokeButton.disabled = !result;
    });
