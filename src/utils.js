// module pattern to keep things organized
var UTILS = (function() {
    var me = Object.create(null);

    me.hasOwnProperty = function(obj, key) {
        return Object.prototype.hasOwnProperty.call(obj, key);
    };

    me.isNumericType = function(x) {
        return (typeof x === 'number');
    };

    // safeSetInterval kill an interval timer if there is an error.
    // this is useful for intervals that communicate with the background
    // page, since we can lose communication if the extension reloads.
    // Syntax: safeSetInterval(function,milliseconds,param1,param2,...)
    me.safeSetInterval = function() {
        // arguments is not an Array. It's array-like. Let's create one
        var args = [];
        for (var i = 0; i < arguments.length; i++) {
            args.push(arguments[i]);
        }

        var fn = args[0];
        var rest = args.slice(1);
        var timerId = setInterval.apply(null, [function() {
            try {
                fn();
            } catch(err) {
                clearInterval(timerId); // stop executing timer
            }
        }].concat(rest));
        return timerId;
    };

    // sets a timeout and ignores exceptions
    me.setTimeoutIgnore = function() {
        var args = [];
        for (var i = 0; i < arguments.length; i++) {
            args.push(arguments[i]);
        }
        var fn = args[0];
        var rest = args.slice(1);
        setTimeout.apply(null, [function() {
            try {
                fn();
            } catch(err) {}  // ignore errors
        }].concat(rest));
    };

    return me;
}());
