let curTimer = null;
const statusMessage = function(message, time) {
    time = (typeof time === 'undefined') ? 1500 : time;
    const element = document.getElementById('status');
    if (curTimer)
        clearTimeout(curTimer);
    element.innerText = message;
    curTimer = setTimeout(function() {
        element.innerText = '';
        curTimer = null;
    }, time);
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
const autonomousBlocklistItemsCount = document.getElementById('blocklist-items-count');
const autonomousBlocklistExceptionsCount = document.getElementById('blocklist-exceptions-count');

const exampleTextElement = document.getElementById('example-text');
const exampleLinkElement = document.getElementById('example-link');

const autonomousBlocklistView = document.getElementById('blocklist-view');
const autonomousBlocklistBack = document.getElementById('blocklist-back');
const autonomousBlocklistNew = document.getElementById('blocklist-new');
const autonomousBlocklistNewSelect = document.getElementById('blocklist-new-select');
const autonomousBlocklistNewInput = document.getElementById('blocklist-new-input');
const autonomousBlocklistItemsAndExceptions = document.getElementById('blocklist-items-and-exceptions');

const globalHighlightIcons = document.getElementById('global-highlight-icons');

const revokeButton = document.getElementById('revoke-permissions');

const versionElement = document.getElementById('version');

versionElement.innerText = backgroundPage.getVersion();

/***********************************
 * Views
 ***********************************/

const showView = function(view) {
    for (const element of document.getElementsByClassName('view')) {
        if (element.id === view) {
            element.style.display = 'initial';
        } else {
            element.style.display = 'none';
        }
    }
    document.body.scrollTop = 0;
};

showView('main-view');

/***********************************
 * Permissions
 ***********************************/

revokeButton.addEventListener('click', function() {
    chrome.permissions.remove(backgroundPage.getPermissions(null));
});

/***********************************
 * Autonomous Blocklist (and exceptions)
 ***********************************/

const populateBlocklistTable = function(opts) {
    // Deep copy so that the input opts is not modified.
    opts = JSON.parse(JSON.stringify(opts));
    while (autonomousBlocklistItemsAndExceptions.lastChild) {
        autonomousBlocklistItemsAndExceptions.removeChild(
            autonomousBlocklistItemsAndExceptions.lastChild);
    }
    const list_sources = ['items', 'exceptions'];
    for (const list_source of list_sources) {
        const key = 'autonomous_blocklist_' + list_source;
        // Iterate in reverse order, so that the new item is shown at the top.
        // This way, a user can see that the item was added to the list.
        for (let i = opts[key].length - 1; i >= 0; --i) {
            const item = opts[key][i];
            const tr = document.createElement('tr');
            tr.setAttribute('data-list-source', list_source);
            autonomousBlocklistItemsAndExceptions.appendChild(tr);
            const type_td = document.createElement('td');
            type_td.classList.add('blocklist-type-col');
            // Applying .label directly to the <td> causes top vertical alignment
            // instead of middle. Wrap with a span.
            const type = document.createElement('span');
            type.innerText = item.type;
            type.classList.add('label');
            type_td.append(type);
            tr.appendChild(type_td);
            const data_td = document.createElement('td');
            data_td.classList.add('blocklist-data-col');
            data_td.innerText = item.data;
            tr.appendChild(data_td);
            const remove_td = document.createElement('td');
            remove_td.classList.add('blocklist-remove-col');
            const remove_span = document.createElement('span');
            remove_span.classList.add('blocklist-remove');
            remove_span.innerHTML = '&#128465;';
            remove_span.title = 'remove';
            remove_td.appendChild(remove_span);
            remove_td.addEventListener('click', function() {
                opts[key].splice(i, 1);
                backgroundPage.saveOptions(opts);
            });
            tr.appendChild(remove_td);
        }
    }
};

{
    const handleSelectionChange = function() {
        // Change the placeholder text for different selections of blocklist item type.
        const value = autonomousBlocklistNewSelect.value;
        let placeholder = null;
        let type = 'text';
        if (value === 'address') {
            placeholder = 'e.g., https://www.dannyadam.com/blog/2015/04/article-highlighter/';
            type = 'url';
        } else if (value === 'hostname') {
            placeholder = 'e.g., www.dannyadam.com';
        } else if (value === 'pattern') {
            placeholder = 'e.g., *://*.dannyadam.com/blog/*';
        }
        if (placeholder !== null) {
            autonomousBlocklistNewInput.placeholder = placeholder;
        } else {
            autonomousBlocklistNewInput.removeAttribute('placeholder');
        }
        autonomousBlocklistNewInput.type = type;
    };

    const validateInput = function() {
        // By default, assume input validates or will be checked by the
        // browser.
        autonomousBlocklistNewInput.setCustomValidity('');
        const type = autonomousBlocklistNewSelect.value;
        const data = autonomousBlocklistNewInput.value;
        // Empty input handled by 'required' attribute
        if (data === '')
            return;
        if (type === 'hostname') {
            // Message for invalid hostnames.
            const message = 'Please enter a hostname.';
            try {
                if (new URL('http://' + data).hostname !== data)
                    autonomousBlocklistNewInput.setCustomValidity(message);
            } catch (err) {
                autonomousBlocklistNewInput.setCustomValidity(message);
            }
        } else if (type === 'pattern') {
            // Message for invalid patterns.
            const message = 'Please enter a match pattern.';
            try {
                // Make sure we can create the match pattern and run matches().
                new backgroundPage.MatchPattern(data).matches('http://www.dannyadam.com');
            } catch (err) {
                autonomousBlocklistNewInput.setCustomValidity(message);
            }
        } else {
            // type === 'address' validation is handled by the browser's
            // built-in input[type="url"] validation.
        }
    };

    autonomousBlocklistNewSelect.addEventListener('change', function() {
        handleSelectionChange();
        validateInput();
    });

    autonomousBlocklistNewInput.addEventListener('change', function() {
        validateInput();
    });

    const showBlocklist = function(source) {
        autonomousBlocklistView.setAttribute('data-list-source', source);
        autonomousBlocklistNewSelect.value = 'hostname';
        autonomousBlocklistNewInput.value = '';
        handleSelectionChange();
        showView('blocklist-view');
    };

    autonomousBlocklistItemsButton.addEventListener('click', function() {
        showBlocklist('items');
    });

    autonomousBlocklistExceptionsButton.addEventListener('click', function() {
        showBlocklist('exceptions');
    });

    autonomousBlocklistBack.addEventListener('click', function() {
        showView('main-view');
    });

    // Handler for blocklist addition.
    const add = function() {
        autonomousBlocklistNewInput.setCustomValidity('');
        const type = autonomousBlocklistNewSelect.value;
        const data = autonomousBlocklistNewInput.value;
        const item = {
            type: type,
            data: data
        };
        autonomousBlocklistNewInput.value = '';
        const list_source = autonomousBlocklistView.getAttribute('data-list-source');
        chrome.storage.local.get(['options'], (storage) => {
            const opts = storage.options;
            const key = 'autonomous_blocklist_' + list_source;
            opts[key].push(item);
            backgroundPage.saveOptions(opts);
        });
    };

    autonomousBlocklistNew.addEventListener('submit', function (e) {
        e.preventDefault();
        e.stopPropagation();
        add();
    });
}

/***********************************
 * Options Form
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
    const permission_items = Object.keys(backgroundPage.getPermissions()).map(
        key => backgroundPage.getPermissions(key));
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
    img.src = '../../icons/' + iconName + '38x38.png';
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
    // The values on the blocklist (and exceptions) do not get pulled from the
    // DOM prior to saving (which is what's done above for the other options.
    // This is because blocklist items are handled differently than the
    // other form inputs, getting saved directly when they're added.
    chrome.storage.local.get(['options'], (storage) => {
        const existing_opts = storage.options;
        options['autonomous_blocklist_items'] = existing_opts.autonomous_blocklist_items;
        options['autonomous_blocklist_exceptions'] = existing_opts.autonomous_blocklist_exceptions;
        backgroundPage.saveOptions(options);
    });
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
        const itemCount = opts['autonomous_blocklist_items'].length;
        autonomousBlocklistItemsButton.setAttribute('data-count', itemCount);
        autonomousBlocklistItemsCount.innerText = itemCount;
        const exceptionCount = opts['autonomous_blocklist_exceptions'].length;
        autonomousBlocklistExceptionsButton.setAttribute('data-count', exceptionCount);
        autonomousBlocklistExceptionsCount.innerText = exceptionCount;
        populateBlocklistTable(opts);
        syncBlocklistButtons();
        setRevokeButtonState();
    });
};

document.addEventListener('DOMContentLoaded', function() {
    chrome.storage.local.get(['options'], (result) => {
        const initOpts = result.options;

        // Restore saved options.
        loadOptions(initOpts);

        // Load default options.
        document.getElementById('defaults').addEventListener('click', () => {
            const defaults = backgroundPage.defaultOptions();
            // this will trigger updates to the input settings
            backgroundPage.saveOptions(defaults, function() {
                statusMessage('Defaults Loaded', 1200);
            });
        });

        document.getElementById('revert').addEventListener('click', () => {
            let permissions = {};
            if (initOpts.autonomous_highlights)
                permissions = autonomousHighlightsPermissions;
            chrome.permissions.request(
                permissions,
                function() {
                    // this will trigger updates to the input settings
                    backgroundPage.saveOptions(initOpts, () => {
                        statusMessage('Options Reverted', 1200);
                    });
                });
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

{
    const iconSrc = function(i) {
        const iconName = backgroundPage.highlightStateToIconId(i) + 'highlight';
        return '../../icons/' + iconName + '38x38.png';
    };

    let count = 0;  // click counter
    const icons = [];
    for (let i = 0; i < numHighlightStates; ++i) {
        const img = document.createElement('img');
        icons.push(img);
        img.className = 'global-highlight-icon';
        img.src = iconSrc(i);
        img.addEventListener('click', function() {
            // Have to put call to chrome.permissions.request in here, not backgroundPage.highlightAll,
            // to avoid "This function must be called during a user gesture" error.
            chrome.permissions.request(
                globalHighlightingPermissions,
                function(granted) {
                    if (!granted) return;
                    count += 1;
                    const id = count;
                    // Restore icons (in case the loading icon is currently showing).
                    for (let j = 0; j < numHighlightStates; ++j) {
                        icons[j].src = iconSrc(j);
                    }
                    backgroundPage.highlightAll(i);
                    img.src = '../../icons/_highlight38x38.png';
                    setTimeout(function() {
                        // Only restore icon if there weren't subsequent clicks (in case the same icon
                        // is clicked multiple times).
                        if (id !== count) return;
                        img.src = iconSrc(i);
                    }, 1000);
                });
        });
        globalHighlightIcons.appendChild(img);
    }

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

chrome.storage.onChanged.addListener(function (changes, namespace) {
    // Reload options when there are any external updates that modify settings
    // saved in local storage (e.g., additions to the blocklist, options changes
    // on other options pages).
    chrome.storage.local.get(['options'], (storage) => {
        loadOptions(storage.options);
    });
});
