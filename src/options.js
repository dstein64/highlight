let curTimer = null;
const statusMessage = function(message, time) {
    time = (typeof time === 'undefined') ? 1500 : time;
    const element = document.getElementById('status');
    if (curTimer)
        clearTimeout(curTimer);
    element.innerText = message;
    const timer = setTimeout(function() {
        element.innerText = '';
        curTimer = null;
    }, time);
    curTimer = timer;
};

const backgroundPage = chrome.extension.getBackgroundPage();

const highlightColorInput = document.getElementById('highlight-color');
const textColorInput = document.getElementById('text-color');
const linkColorInput = document.getElementById('link-color');
const tintedHighlightsInput = document.getElementById('tinted-highlights');

const exampleTextElement = document.getElementById('example-text');
const exampleLinkElement = document.getElementById('example-link');

const globalHighlightIcons = document.getElementById('global-highlight-icons');
const globalHighlightRevokeButton = document.getElementById('revoke_permissions');

const versionElement = document.getElementById('version');

versionElement.innerText = backgroundPage.getVersion();

/***********************************
 * Options
 ***********************************/

// Propagates and saves options.
const propagateOptions = function() {
    const highlightColor = highlightColorInput.value;
    const textColor = textColorInput.value;
    const linkColor = linkColorInput.value;
    const tintedHighlights = tintedHighlightsInput.checked;

    // Update example text
    exampleTextElement.style.backgroundColor = highlightColor;
    exampleTextElement.style.color = textColor;
    exampleLinkElement.style.backgroundColor = highlightColor;
    exampleLinkElement.style.color = linkColor;

    // Save options
    const options = Object.create(null);
    options['highlight_color'] = highlightColor;
    options['text_color'] = textColor;
    options['link_color'] = linkColor;
    options['tinted_highlights'] = tintedHighlights;

    localStorage['options'] = JSON.stringify(options);

    // Notify tabs of the options
    chrome.tabs.query({}, function(tabs) {
        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
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

const loadOptions = function(opts) {
    highlightColorInput.value = opts['highlight_color'];
    textColorInput.value = opts['text_color'];
    linkColorInput.value = opts['link_color'];
    tintedHighlightsInput.checked = opts['tinted_highlights'];
    // onchange/oninput won't fire when loading options with javascript,
    // so trigger handleChange manually.
    propagateOptions();
};

const initOpts = JSON.parse(localStorage['options']);

// restore saved options
document.addEventListener('DOMContentLoaded', function() {
    loadOptions(initOpts);
});

// load default options
document.getElementById('defaults').addEventListener('click', function() {
    const defaults = backgroundPage.defaultOptions();
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
const globalHighlightPermissions = {
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

const revokePermissions = function () {
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
