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
    chrome.permissions.remove(PERMISSIONS);
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

// Sets revoke button to disabled or enabled (asynchronously).
const setRevokeButtonState = function() {
    // Disables the revoke button, and then enables it if any of the relevant
    // permissions are currently granted.
    const permission_items = [
        globalHighlightingPermissions,
        autonomousHighlightsPermissions
    ];
    revokeButton.disabled = true;
    let fn = function() {};
    for (const item of permission_items) {
        let _fn = fn;
        fn = function() {
            chrome.permissions.contains(
                item,
                function(result) {
                    if (result) {
                        revokeButton.disabled = false;
                    } else {
                        _fn();
                    }
                });
        };
    }
    fn();
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

// Saves options (asynchronously).
const saveOptions = function() {
    const options = Object.create(null);
    options['highlight_color'] = highlightColorInput.value;
    options['text_color'] = textColorInput.value;
    options['link_color'] = linkColorInput.value;
    options['tinted_highlights'] = tintedHighlightsInput.checked;
    options['autonomous_highlights'] = autonomousHighlightsInput.checked;
    options['autonomous_delay'] = parseInt(autonomousDelayInput.value);
    options['autonomous_state'] = parseInt(
        autonomousStateInputs.querySelector('input:checked').value);
    options['autonomous_blocklist'] = autonomousBlocklistInput.checked;
    // TODO: HAVE TO ACTUALLY SET THE FOLLOWING VALUES
    options['autonomous_blocklist_items'] = backgroundPage.getOptions().autonomous_blocklist_items;
    options['autonomous_blocklist_exceptions'] = backgroundPage.getOptions().autonomous_blocklist_exceptions;
    backgroundPage.saveOptions(options);
};

// Loads options (asynchronously).
const loadOptions = function(opts) {
    // onchange doesn't fire when setting 'checked' and other values with javascript,
    // so some form synchronization must be triggered manually.
    highlightColorInput.value = opts['highlight_color'];
    textColorInput.value = opts['text_color'];
    linkColorInput.value = opts['link_color'];
    tintedHighlightsInput.checked = opts['tinted_highlights'];

    exampleTextElement.style.backgroundColor = opts['highlight_color'];
    exampleTextElement.style.color = opts['text_color'];
    exampleLinkElement.style.backgroundColor = opts['highlight_color'];
    exampleLinkElement.style.color = opts['link_color'];

    setAutonomousHighlights(opts['autonomous_highlights'], false, function() {
        autonomousDelayInput.value = opts['autonomous_delay'];
        showAutonomousDelay();
        document.getElementById(
            `autonomous-state-${opts['autonomous_state']}`).checked = true;
        autonomousBlocklistInput.checked = opts['autonomous_blocklist'];
        syncBlocklistButtons();
        setRevokeButtonState();
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
    // this will trigger updates to the input settings
    backgroundPage.saveOptions(defaults, function() {
        statusMessage('Defaults Loaded', 1200);
    });
});

document.getElementById('revert').addEventListener('click', function() {
    let permissions = {};
    if (initOpts.autonomous_highlights)
        permissions = autonomousHighlightsPermissions;
    chrome.permissions.request(
        permissions,
        function(response) {
            // this will trigger updates to the input settings
            backgroundPage.saveOptions(initOpts, function() {
                statusMessage('Options Reverted', 1200);
            });
        });
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
                if (granted)
                    backgroundPage.highlightAll(i);
            });
    });
    globalHighlightIcons.appendChild(img);
}

/***********************************
 * External Updates and/or Permissions Changes
 ***********************************/

chrome.permissions.onAdded.addListener(function() {
    // Changes to corresponding settings are handled by the 'storage' listener below.
    setRevokeButtonState();
});

chrome.permissions.onRemoved.addListener(function() {
    // Changes to corresponding settings are handled by the 'storage' listener below.
    setRevokeButtonState();
    // eventPage.js has an event listener for saving options when permissions are
    // removed. This handles permissions changes triggered either within or outside
    // the options page.
});

window.addEventListener('storage', function(event) {
    // Reload options when there are any external updates that modify settings
    // saved in local storage (e.g., additions to the blocklist, options changes
    // on other options pages).
    loadOptions(backgroundPage.getOptions());
});
