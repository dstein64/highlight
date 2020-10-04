// *****************************
// * Match Patterns
// *   - https://developer.chrome.com/extensions/match_patterns
// *   - https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns
// *****************************

// From Chrome documentation:
//   A match pattern is essentially a URL that begins with a permitted scheme
//   (http, https, file, or ftp, and that can contain '*' characters.
//   The special pattern <all_urls> matches any URL that starts with a permitted scheme.
//   Each match pattern has 3 parts:
//     * scheme — for example, http or file or *
//     * host — for example, www.google.com or *.google.com or *;
//       if the scheme is file, there is no host part
//     * path — for example, /*, /foo*, or /foo/bar. The path must
//       be present in a host permission, but is always treated as /*.
//   Here's the basic syntax:
//     <url-pattern> := <scheme>://<host><path>
//     <scheme> := '*' | 'http' | 'https' | 'file' | 'ftp'
//     <host> := '*' | '*.' <any char except '/' and '*'>+
//     <path> := '/' <any chars>
//   The meaning of '*' depends on whether it's in the scheme, host, or path part.
//   If the scheme is *, then it matches either http or https, and not file, or ftp.
//   If the host is just *, then it matches any host. If the host is *.hostname,
//   then it matches the specified host or any of its subdomains. In the path section,
//   each '*' matches 0 or more characters. The following table shows some valid patterns.

this.MatchPattern = function(pattern) {
    const pattern_error = new Error('Invalid MatchPattern');
    const all_urls = '<all_urls>';
    const valid_schemes = ['http', 'https', 'file', 'ftp'];

    let scheme_glob = null;
    let host_glob = null;
    let path_glob = null;

    if (pattern !== all_urls) {
        const scheme_sep = '://';
        const scheme_sep_idx = pattern.indexOf(scheme_sep);
        if (scheme_sep_idx === -1)
            throw pattern_error;
        scheme_glob = pattern.slice(0, scheme_sep_idx);
        if (scheme_glob !== '*' && !valid_schemes.includes(scheme_glob))
            throw pattern_error;
        const host_path = pattern.slice(scheme_sep_idx + scheme_sep.length);
        const path_sep = '/';
        const path_sep_idx = host_path.indexOf(path_sep);
        if (path_sep_idx === -1)
            throw pattern_error;
        host_glob = host_path.slice(0, path_sep_idx);
        // File URLs may have an empty host, but for other schemes, require a host.
        if (scheme_glob !== 'file' && host_glob.length === 0)
            throw pattern_error;
        // Make sure that there is at most one asterisk in the host, and that it occurs
        // as the first character.
        if (host_glob.indexOf('*') > -1) {
            if (host_glob.slice(1).indexOf('*') > -1)
                throw pattern_error;
        }
        // Make sure that hosts starting with '*', if followed, are followed only by '.'.
        if (host_glob.startsWith('*') && host_glob.length > 1 && !host_glob.startsWith('*.'))
            throw pattern_error;
        // Make sure that host starting with '*.' is followed by at least one character.
        if (host_glob.startsWith('*.') && host_glob.length <= 2)
            throw pattern_error;
        path_glob = host_path.slice(path_sep_idx);
    }

    const glob_matches = function(glob, text) {
        // The following function is from:
        //   https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Escaping
        // (formatting and naming modified)
        const escape = function(string) {
            // $& means the whole matched string
            return string.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&');
        };
        const parts = glob.split('*').map(escape);
        const re = new RegExp('^' + parts.join('.*') + '$');
        return text.match(re) !== null;
    };

    this.matches = (url) => {
        const url_error = new Error('Invalid URL');
        try {
            const parsed = new URL(url);
            // Remove the trailing ":"
            const scheme = parsed.protocol.slice(0, -1);
            if (!valid_schemes.includes(scheme))
                return false;
            if (pattern === all_urls)
                return true;
            // For scheme, * only matches http and https.
            // Specs:
            //   "If the scheme is *, then it matches either http or https, and
            //   not file, or ftp."
            if (scheme_glob === '*') {
                if (!['http', 'https'].includes(scheme))
                    return false;
            } else if (scheme !== scheme_glob) {
                return false;
            }
            // For file schems, host_glob is null.
            if (!glob_matches(host_glob, parsed.hostname)) {
                if (!host_glob.startsWith('*.'))
                    return false;
                // When a host glob starts with "*.", you also have to check the
                // hostname compared to the text that follows "*.".
                // Specs:
                //   "If the host is *.hostname, then it matches the specified
                //   host or any of its subdomains."
                if (host_glob.slice(2) !== parsed.hostname)
                    return false;
            }
            const path = parsed.pathname + parsed.search + parsed.hash;
            return glob_matches(path_glob, path);

        } catch (err) {
            throw url_error;
        }
    };
};
