// Run tests with:
//  $ node tests.js

const assert = require('assert');

const {MatchPattern} = require(__dirname + '/src/matchPattern.js');

// *****************************
// * Test Match Patterns
// *****************************

let pattern;

// Patterns, their descriptions, and matching URLs are primarily from:
//   https://developer.chrome.com/extensions/match_patterns

// Matches any URL that uses the http scheme.
pattern = new MatchPattern('http://*/*');
assert(pattern.matches('http://www.google.com/'));
assert(pattern.matches('http://example.org/foo/bar.html'));
assert(!pattern.matches('https://example.org/foo/bar.html'));
assert(!pattern.matches('ftp://www.google.com/'));

// Matches any URL that uses the http scheme, on any host, as long as
// the path starts with /foo.
pattern = new MatchPattern('http://*/foo*');
assert(pattern.matches('http://example.com/foo/bar.html'));
assert(pattern.matches('http://www.google.com/foo'));
assert(!pattern.matches('https://example.org/foo/bar.html'));
assert(!pattern.matches('ftp://www.google.com/'));
assert(!pattern.matches('http://www.google.com/bar/foo.html'));

// Matches any URL that uses the https scheme, is on a google.com host
// (such as www.google.com, docs.google.com, or google.com), as long as
// the path starts with /foo and ends with bar.
pattern = new MatchPattern('https://*.google.com/foo*bar');
assert(pattern.matches('https://www.google.com/foo/baz/bar'));
assert(pattern.matches('https://docs.google.com/foobar'));
assert(!pattern.matches('http://www.google.com/foo/baz/bar'));
assert(!pattern.matches('https://www.google.com/foo/baz/bar/'));

// Matches the specified URL.
pattern = new MatchPattern('http://example.org/foo/bar.html');
assert(pattern.matches('http://example.org/foo/bar.html'));
assert(!pattern.matches('http://example.org/bar/foo.html'));
assert(!pattern.matches('https://example.org/foo/bar.html'));
assert(!pattern.matches('ftp://example.org/foo/bar.html'));

// Matches any local file whose path starts with /foo.
pattern = new MatchPattern('file:///foo*');
assert(pattern.matches('file:///foo/bar.html'));
assert(pattern.matches('file:///foo'));
assert(!pattern.matches('file://example.org/foo'));
assert(!pattern.matches('https://example.org/foo'));

// Matches any URL that uses the http scheme and is on the host 127.0.0.1.
pattern = new MatchPattern('http://127.0.0.1/*');
assert(pattern.matches('http://127.0.0.1/'));
assert(pattern.matches('http://127.0.0.1/foo/bar.html'));
assert(!pattern.matches('https://127.0.0.1/'));
assert(!pattern.matches('http://127.0.0.2/'));

// Matches any URL that starts with http://mail.google.com or
// https://mail.google.com.
pattern = new MatchPattern('*://mail.google.com/*');
assert(pattern.matches('http://mail.google.com/foo/baz/bar'));
assert(pattern.matches('https://mail.google.com/foobar'));
assert(!pattern.matches('file://mail.google.com/foobar'));
assert(!pattern.matches('ftp://mail.google.com/foobar'));

// Matches any URL that uses a permitted scheme. (See the beginning of this
// section for the list of permitted schemes).
pattern = new MatchPattern('<all_urls>');
assert(pattern.matches('http://example.org/foo/bar.html'));
assert(pattern.matches('https://example.org/foo/bar.html'));
assert(pattern.matches('ftp://example.org/foo/bar.html'));
assert(pattern.matches('file:///bar/baz.html'));
assert(!pattern.matches('gopher:///example.org/foo/bar.html'));
assert(!pattern.matches('about:blank'));
assert(!pattern.matches('javascript:console.log("hello")'));
assert(!pattern.matches('data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'/%3E'));

// No path.
assert.throws(() => {new MatchPattern('http://www.google.com')});

// '*' in the host can be followed only by a '.' or '/'.
assert.throws(function() {new MatchPattern('http://*foo/bar')});

// If '*' is in the host, it must be the first character.
assert.throws(() => {new MatchPattern('http://foo.*.bar/baz')});

// Missing scheme separator ("/" should be "//").
assert.throws(() => {new MatchPattern('http:/bar')});

// Invalid scheme.
assert.throws(() => {new MatchPattern('foo://*')});

// Invalid URLs
assert.throws(() => {new MatchPattern('<all_urls>').matches('')});
assert.throws(() => {new MatchPattern('*://*/').matches('')});
