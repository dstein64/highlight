var NLP = (function() {
    var me = Object.create(null);

    // stopwords are from nltk
    var stopwordsl = ['a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
                      'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
                      'can',
                      'did', 'do', 'does', 'doing', 'don', 'down', 'during',
                      'each',
                      'few', 'for', 'from', 'further',
                      'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
                      'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
                      'just',
                      'me', 'more', 'most', 'my', 'myself',
                      'no', 'nor', 'not', 'now',
                      'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
                      's', 'same', 'she', 'should', 'so', 'some', 'such',
                      't', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
                      'under', 'until', 'up',
                      'very',
                      'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with',
                      'you', 'your', 'yours', 'yourself', 'yourselves'];
    // sets added in Chrome 38: http://blog.chromium.org/2014/08/chrome-38-beta-new-primitives-for-next.html
    var stopwords = new Set(stopwordsl);

    // a hacky tokenizer
    me.tokenize = function(text) {
        // remove "." so that for example, acronyms using "." aren't split
        // shouldn't be problematic at the end of sentences, since new sentences start with at least one space
        text = text.replace(/\./g, '');
        // remove non alphanumeric TODO: don't remove chars with accents/diacritics. one way would replace with ascii char without the accent
        text = text.replace(/\W+/g, ' ');
        // consolidate contiguous whitespace
        text = text.replace(/\s+/g, ' ');        
        return text.split(' ');
    };

    var MAX_TOKEN_LEN = 20;

    // given a list of tokens, convert to a standard form, where certain tokens are removed,
    // and retained tokens are stemmed
    me.normalize = function(tokens) {
        tokens = tokens.map(function(w){return w.toLowerCase();});
        // require at least one alphabetic char (e.g., 10,000 will be removed)
        tokens = tokens.filter(function(w){return w.search(/[a-zA-Z]/) > -1;});
        // remove stop words
        tokens = tokens.filter(function(w){return !stopwords.has(w);});
        // remove single character tokens
        // most have already been removed (commas, stop words, ...)
        tokens = tokens.filter(function(w){return w.length > 1;});
        // stem (PorterStemmer1980.js)
        tokens = tokens.map(function(w){return stemmer(w, false);});
        // filter again for at least one alphabetic char (since after stemming we may now have no alphabetic char)
        tokens = tokens.filter(function(w){return w.search(/[a-zA-Z]/) > -1;});
        // truncate stems longer than MAX_TOKEN_LEN chars
        tokens = tokens.map(function(w){return w.substring(0,Math.min(w.length, MAX_TOKEN_LEN));});
        return tokens;
    };

    // tokenormalize returns a map of normalized tokens as keys, and counts as values
    me.tokenormalize = function(text) {
        var tokens = me.tokenize(text);
        var stems = me.normalize(tokens);
        // TODO: this might not be node.js compatible
        var counts = new Map();
        for (var i = 0; i < stems.length; i++) {
            var stem = stems[i];
            if (counts.has(stem)) {
                counts.set(stem, counts.get(stem) + 1);
            } else {
                counts.set(stem, 1);
            }
        }
        return counts;
    };    

    return me;
}());

if (typeof module !== 'undefined' && 'exports' in module){
    module.exports = NLP;
}
