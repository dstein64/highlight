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

const numHighlightStates = backgroundPage.getNumHighlightStates();

const highlightColorInput = document.getElementById('highlight-color');
const textColorInput = document.getElementById('text-color');
const linkColorInput = document.getElementById('link-color');
const tintedHighlightsInput = document.getElementById('tinted-highlights');
const autonomousHighlightsInput = document.getElementById('autonomous-highlights');
const autonomousSettings = document.getElementById('autonomous-settings');
const autonomousDelayInput = document.getElementById('autonomous-delay');
const autonomousDelayValue = document.getElementById('autonomous-delay-value');
const autonomousStateInputs = document.getElementById('autonomous-state');
const autonomousBlockListInput = document.getElementById('block-list');
const autonomousBlockListButton = document.getElementById('block-list-button');
const autonomousAllowListInput = document.getElementById('allow-list');
const autonomousAllowListButton = document.getElementById('allow-list-button');

const exampleTextElement = document.getElementById('example-text');
const exampleLinkElement = document.getElementById('example-link');

const globalHighlightIcons = document.getElementById('global-highlight-icons');

const revokeButton = document.getElementById('revoke-permissions');

const versionElement = document.getElementById('version');

versionElement.innerText = backgroundPage.getVersion();

/***********************************
 * Options
 ***********************************/

const autonomousHighlightsPermissions = {
    permissions: ['tabs'],
    origins: ['<all_urls>']
};

// 'active' indicates whether the function is initiated through a user gesture. This
// is required to avoid "This function must be called during a user gesture".
const setAutonomousHighlights = function(value, active=false, callback=null) {
    if (value) {
        const fn = active ? chrome.permissions.request : chrome.permissions.contains;
        fn(
            autonomousHighlightsPermissions,
            function(result) {
                autonomousHighlightsInput.checked = result;
                autonomousSettings.disabled = !result;
                if (result)
                    revokeButton.disabled = false;
                if (callback !== null)
                    callback();
            });
    } else {
        autonomousHighlightsInput.checked = false;
        autonomousSettings.disabled = true;
        if (callback !== null)
            callback();
    }
};

const syncBlockListButtonState = function() {
    autonomousBlockListButton.disabled = !autonomousBlockListInput.checked;
};

const syncAllowListButtonState = function() {
    autonomousAllowListButton.disabled = !autonomousAllowListInput.checked;
};

const showAutonomousDelay = function() {
    const milliseconds = parseInt(autonomousDelayInput.value);
    const seconds = milliseconds / 1000;
    autonomousDelayValue.innerText = seconds.toFixed(1);
};

// create autonomous state radio inputs
for (let i = 1; i < numHighlightStates; ++i) {
    const input = document.createElement('input');
    autonomousStateInputs.appendChild(input);
    input.type = 'radio';
    input.name = 'autonomous-state';
    input.value = i;
    const id = `autonomous-state-${i}`;
    input.id = id;

    const label = document.createElement('label');
    autonomousStateInputs.appendChild(label);
    label.htmlFor = id;

    const img = document.createElement('img');
    label.appendChild(img);
    const iconName = backgroundPage.highlightStateToIconId(i) + 'highlight';
    img.src = '../icons/' + iconName + '38x38.png';
    img.height = 19;
    img.width = 19;
}

// Propagates and saves options.
const propagateOptions = function() {
    const highlightColor = highlightColorInput.value;
    const textColor = textColorInput.value;
    const linkColor = linkColorInput.value;
    const tintedHighlights = tintedHighlightsInput.checked;
    const autonomousHighlights = autonomousHighlightsInput.checked;
    const autonomousDelay = parseInt(autonomousDelayInput.value);
    const autonomousState = parseInt(
        autonomousStateInputs.querySelector('input:checked').value);
    const autonomousBlockList = autonomousBlockListInput.checked;
    const autonomousAllowList = autonomousAllowListInput.checked;

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
    options['autonomous_highlights'] = autonomousHighlights;
    options['autonomous_delay'] = autonomousDelay;
    options['autonomous_state'] = autonomousState;
    options['autonomous_block_list'] = autonomousBlockList;
    options['autonomous_allow_list'] = autonomousAllowList;

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

const loadOptions = function(opts, active=false) {
    // onchange doesn't fire when setting 'checked' and other values with javascript,
    // so some form synchronization must be triggered manually.
    highlightColorInput.value = opts['highlight_color'];
    textColorInput.value = opts['text_color'];
    linkColorInput.value = opts['link_color'];
    tintedHighlightsInput.checked = opts['tinted_highlights'];
    setAutonomousHighlights(opts['autonomous_highlights'], active, function() {
        autonomousDelayInput.value = opts['autonomous_delay'];
        showAutonomousDelay();
        document.getElementById(
            `autonomous-state-${opts['autonomous_state']}`).checked = true;
        autonomousBlockListInput.checked = opts['autonomous_block_list'];
        syncBlockListButtonState();
        autonomousAllowListInput.checked = opts['autonomous_allow_list'];
        syncAllowListButtonState();
        // WARN: calling propagateOptions is not specific for autonomous
        // highlights, but rather for all the settings above. It's called
        // here though as part of the callback to setAutonomousHighlights(), not
        // at the scope of loadOptions(), as a consequence of the asynchronous
        // handling of setAutonomousHighlights.
        propagateOptions();
    });
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
    loadOptions(initOpts, true);
    statusMessage('Options Reverted', 1200);
});

// hide elements that are not relevant with less than three highlight states,
// like tinted highlighting settings and documentation.
if (numHighlightStates < 3) {
    let items = document.getElementsByClassName('at-least-ternary');
    for (let i = 0; i < items.length; ++i) {
        items[i].style.display = 'none';
    }
}

// decouple label for touch devices, since clicking shows the tooltip.
if (window.matchMedia('(pointer: coarse)').matches) {
    let labels = document.getElementsByClassName('mobile-remove-for');
    for (let i = 0; i < labels.length; ++i) {
        labels[i].removeAttribute('for');
    }
}

// save options and synchronize form on any user input
(function() {
    highlightColorInput.addEventListener('change', propagateOptions);
    textColorInput.addEventListener('change', propagateOptions);
    linkColorInput.addEventListener('change', propagateOptions);
    tintedHighlightsInput.addEventListener('change', propagateOptions);
    autonomousHighlightsInput.addEventListener('change', function() {
        setAutonomousHighlights(autonomousHighlightsInput.checked, true, propagateOptions);
    });
    autonomousDelayInput.addEventListener('change', propagateOptions);
    // For range inputs, 'input' events are triggered while dragging, while 'change'
    // events are triggered after the end of a sliding action.
    autonomousDelayInput.addEventListener('input', showAutonomousDelay);
    for (const input of autonomousStateInputs.querySelectorAll('input')) {
        input.addEventListener('change', propagateOptions);
    }
    autonomousBlockListInput.addEventListener('change', function() {
        syncBlockListButtonState();
        propagateOptions();
    });
    autonomousAllowListInput.addEventListener('change', function() {
        syncAllowListButtonState();
        propagateOptions();
    });
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
for (let i = 0; i < numHighlightStates; ++i) {
    const img = document.createElement('img');
    img.style.cursor = 'pointer';
    const iconName = backgroundPage.highlightStateToIconId(i) + 'highlight';
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
                    revokeButton.disabled = false;
                    backgroundPage.highlightAll(i);
                }
            });
    });
    globalHighlightIcons.appendChild(img);
}

/***********************************
 * Permissions
 ***********************************/

const permissions = {};
{
    const _permissions = new Set();
    globalHighlightPermissions.permissions.forEach(x => _permissions.add(x));
    autonomousHighlightsPermissions.permissions.forEach(x => _permissions.add(x));
    const origins = new Set();
    globalHighlightPermissions.origins.forEach(x => origins.add(x));
    autonomousHighlightsPermissions.origins.forEach(x => origins.add(x));
    permissions.permissions = Array.from(permissions);
    permissions.origins = Array.from(origins);
}

revokeButton.addEventListener('click', function() {
    chrome.permissions.remove(
        permissions,
        function(removed) {
            if (removed) {
                revokeButton.disabled = true;
                setAutonomousHighlights(false, true, propagateOptions);
            }
        });
});

chrome.permissions.contains(
    permissions,
    function(result) {
        if (result)
            revokeButton.disabled = !result;
    });
