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

var colorDropdown = document.getElementById("color-dropdown");
(function() {
    var color_map = backgroundPage.COLOR_MAP;
    var color_ids = Object.keys(color_map);
    // sort by name
    color_ids.sort(function(a, b) {
        _a = color_map[a][0]; // name
        _b = color_map[b][0]; // name
        return _a.localeCompare(_b);
    });
    for (var i = 0; i < color_ids.length; ++i) {
        var color_id = color_ids[i];
        var color_properties = color_map[color_id];
        var name = color_properties[0];
        var color = color_properties[1];
        var textcolor = color_properties[2];
        var option_element = document.createElement('option');
        option_element.value = color_id;
        option_element.style = 'background: ' + color;
        option_element.innerText = name;
        colorDropdown.appendChild(option_element);
    }
})();

var saveOptions = function() {
    var options = Object.create(null);
    options['color'] = colorDropdown.value;
    
    localStorage["options"] = JSON.stringify(options);
    
    // also let all tabs know of the new options
    chrome.tabs.query({}, function(tabs) {
        for (var i = 0; i < tabs.length; i++) {
            var tab = tabs[i];
            chrome.tabs.sendMessage(
                tab.id, {method: 'updateOptions', data: options});
        }
    });
};

var loadOptions = function(opts) {
    colorDropdown.value = opts['color'];
    // onchange/oninput won't fire when loading options with javascript,
    // so trigger saveOptions manually
    saveOptions();
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

// save options on any user input
(function() {
  colorDropdown.addEventListener('change', saveOptions);
})();

document.getElementById('revert').addEventListener('click', function() {
    loadOptions(initOpts);
    statusMessage("Options Reverted", 1200);
});

// version
document.getElementById('version').innerText = backgroundPage.getVersion();
