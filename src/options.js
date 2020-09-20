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

const autonomousHighlightsPermissions = backgroundPage.getPermissions('autonomous_highlights');
const globalHighlightingPermissions = backgroundPage.getPermissions('global_highlighting');

const highlightColorInput = document.getElementById('highlight-color');
const textColorInput = document.getElementById('text-color');
const linkColorInput = document.getElementById('link-color');
const tintedHighlightsInput = document.getElementById('tinted-highlights');
const autonomousHighlightsInput = document.getElementById('autonomous-highlights');
const autonomousSettings = document.getElementById('autonomous-settings');
const autonomousDelayInput = document.getElementById('autonomous-delay');
const autonomousDelayValue = document.getElementById('autonomous-delay-value');
const autonomousStateInputs = document.getElementById('autonomous-state');
const autonomousBlocklistInput = document.getElementById('blocklist');
const autonomousBlocklistItemsButton = document.getElementById('blocklist-items-button');
const autonomousBlocklistExceptionsButton = document.getElementById('blocklist-exceptions-button');

const exampleTextElement = document.getElementById('example-text');
const exampleLinkElement = document.getElementById('example-link');

const globalHighlightIcons = document.getElementById('global-highlight-icons');

const revokeButton = document.getElementById('revoke-permissions');

const versionElement = document.getElementById('version');

versionElement.innerText = backgroundPage.getVersion();

/***********************************
 * Permissions
 ***********************************/

const PERMISSIONS = {};
{
    const _permissions = new Set();
    globalHighlightingPermissions.permissions.forEach(x => _permissions.add(x));
    autonomousHighlightsPermissions.permissions.forEach(x => _permissions.add(x));
    const origins = new Set();
    globalHighlightingPermissions.origins.forEach(x => origins.add(x));
    autonomousHighlightsPermissions.origins.forEach(x => origins.add(x));
    PERMISSIONS.permissions = Array.from(PERMISSIONS);
    PERMISSIONS.origins = Array.from(origins);
}

revokeButton.addEventListener('click', function() {
    chrome.permissions.remove(
        PERMISSIONS,
        function(removed) {
            if (removed) {
                revokeButton.disabled = true;
                setAutonomousHighlights(false, true, function() {
                    saveOptions();
                    // Send message indicating that permissions have been updated.
                    // (i.e., so the revoke button is properly toggled on other
                    // options pages).
                    chrome.runtime.sendMessage(
                        chrome.runtime.id, {message: 'permissionsUpdated'});
                });
            }
        });
});

/***********************************
 * Options
 ***********************************/

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

const syncBlocklistButtons = function() {
    autonomousBlocklistItemsButton.disabled = !autonomousBlocklistInput.checked;
    autonomousBlocklistExceptionsButton.disabled = !autonomousBlocklistInput.checked;
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

// Saves options.
const saveOptions = function() {
    const highlightColor = highlightColorInput.value;
    const textColor = textColorInput.value;
    const linkColor = linkColorInput.value;
    const tintedHighlights = tintedHighlightsInput.checked;
    const autonomousHighlights = autonomousHighlightsInput.checked;
    const autonomousDelay = parseInt(autonomousDelayInput.value);
    const autonomousState = parseInt(
        autonomousStateInputs.querySelector('input:checked').value);
    const autonomousBlockList = autonomousBlocklistInput.checked;

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
    options['autonomous_blocklist'] = autonomousBlockList;
    // TODO: HAVE TO ACTUALLY SET THE FOLLOWING VALUES
    options['autonomous_blocklist_items'] = backgroundPage.getOptions().autonomous_blocklist_items;
    options['autonomous_blocklist_exceptions'] = backgroundPage.getOptions().autonomous_blocklist_exceptions;

    backgroundPage.saveOptions(options);
};

const loadOptions = function(opts, active=false, save=true) {
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
        autonomousBlocklistInput.checked = opts['autonomous_blocklist'];
        syncBlocklistButtons();
        chrome.permissions.contains(
            PERMISSIONS,
            function(result) {
                revokeButton.disabled = !result;
            });
        // WARN: calling saveOptions is not specific for autonomous
        // highlights, but rather for all the settings above. It's called
        // here though as part of the callback to setAutonomousHighlights(), not
        // at the scope of loadOptions(), as a consequence of the asynchronous
        // handling of setAutonomousHighlights.
        if (save)
            saveOptions();
    });
};

const initOpts = backgroundPage.getOptions();

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
    // For color inputs, 'input' events are triggered during selection, while 'change'
    // events are triggered after closing the dialog.
    for (const type of ['change', 'input']) {
        highlightColorInput.addEventListener(type, saveOptions);
        textColorInput.addEventListener(type, saveOptions);
        linkColorInput.addEventListener(type, saveOptions);
    }
    tintedHighlightsInput.addEventListener('change', saveOptions);
    autonomousHighlightsInput.addEventListener('change', function() {
        setAutonomousHighlights(autonomousHighlightsInput.checked, true, saveOptions);
    });
    autonomousDelayInput.addEventListener('change', saveOptions);
    // For range inputs, 'input' events are triggered while dragging, while 'change'
    // events are triggered after the end of a sliding action.
    autonomousDelayInput.addEventListener('input', function() {
        showAutonomousDelay();
        saveOptions();
    });
    for (const input of autonomousStateInputs.querySelectorAll('input')) {
        input.addEventListener('change', saveOptions);
    }
    autonomousBlocklistInput.addEventListener('change', function() {
        syncBlocklistButtons();
        saveOptions();
    });
})();

/***********************************
 * Global Highlighting
 ***********************************/

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
            globalHighlightingPermissions,
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
 * External Updates
 ***********************************/

chrome.runtime.onMessage.addListener(function(request, sender, response) {
    if (request.message === 'permissionsUpdated') {
        // Reload options when there are any external updates that change permissions.
        // Save, since changing permissions might trigger changes to settings.
        loadOptions(backgroundPage.getOptions());
    }
    // NOTE: if you're going to call response asynchronously,
    //       be sure to return true from this function.
    //       http://stackoverflow.com/questions/20077487/
    //              chrome-extension-message-passing-response-not-sent
});

window.addEventListener('storage', function(event) {
    // Reload options options when there are any external updates that modify settings
    // saved in local storage (e.g., additions to the blocklist, options changes
    // on other options pages). Don't save, to prevent continually back-and-forth
    // saving.
    loadOptions(backgroundPage.getOptions(), false, false);
});
