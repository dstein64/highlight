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
    
    /* Sentence Boundary Detection */
    
    //abbreviations from https://github.com/Tessmore/sbd/blob/master/lib/Match.js
    var abbreviationsl = [
                         "ie", "eg", "ext", // + number?
                         "Fig", "fig", "Figs", "figs", "et al", "Co", "Corp",
                         "Ave", "Inc", "Ex", "Viz", "vs", "Vs", "repr", "Rep",
                         "Dem", "trans", "Vol", "pp", "rev", "est", "Ref", "Refs",
                         "Eq", "Eqs", "Ch", "Sec", "Secs", "mi", "Dept",

                         "Univ", "Nos", "No", "Mol", "Cell",

                         "Miss", "Mrs", "Mr", "Ms",
                         "Prof", "Dr",
                         "Sgt", "Col", "Gen", "Rep", "Sen",'Gov', "Lt", "Maj", "Capt","St",

                         "Sr", "Jr", "jr", "Rev",
                         "PhD", "MD", "BA", "MA", "MM",
                         "BSc", "MSc",

                         "Jan","Feb","Mar","Apr","Jun","Jul","Aug","Sep","Sept","Oct","Nov","Dec",
                         "Sun","Mon","Tu","Tue","Tues","Wed","Th","Thu","Thur","Thurs","Fri","Sat"
                     ];

    // add more
    abbreviationsl = abbreviationsl.concat([
                   // start AP state abbreviations
                   "Ala", "Ariz", "Ark",
                   "Calif", "Colo", "Conn",
                   "Del",
                   "Fla",
                   "Ga",
                   "Ill", "Ind",
                   "Kan", "Ky",
                   "La",
                   "Md", "Mass", "Mich", "Minn", "Miss", "Mo", "Mont",
                   "Neb", "Nev",
                   "Okla", "Ore",
                   "Pa",
                   "Tenn",
                   "Vt", "Va",
                   "Wash", "Wis", "Wyo"
    ]);

    abbreviationsl.push('etc');

    // sometimes states are all caps (TODO: better generic handling for caps)
    abbreviationsl = abbreviationsl.concat(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "SEPT", "OCT", "NOV", "DEC"]);

    var abbreviations = new Set(abbreviationsl);
    var maxabbrlen = -1;
    for (var i = 0; i < abbreviationsl.length; i++) {
        var abbr = abbreviationsl[i];
        maxabbrlen = Math.max(maxabbrlen, abbr.length);
    }

    var sentenceEnds = ['.', '?', '!'];
    var quoteEnds = ['\u0022', '\u201D', ')']; // u+0022: neutral double quote, u+201D: closing curly quote

    // sentenceSegments returns an object with two arrays
    // the first array has the indices of sentence ends
    // the second array has flags for whether there was an actual end (end of text always considered an end, but it may not have sentence ends)
    me.sentenceSegments = function(text) {
        var ends = []; // sentence end indices
        var hasEnd = []; // flag for whether there was an actual end (block ends may not have sentence ends)
        for (var j = 0; j < text.length; j++) {
            var c = text.charAt(j);
            var isEnd = false; // is end of sentence
            var isBlockEnd = j >= text.length-1; // is end of block
            if (sentenceEnds.indexOf(c) > -1) {
                isEnd = true;
                if (j >= text.length-1) {
                    // end character at the end of string always considered an end
                    isEnd = true;
                } else if (j > 0) {
                    // some of these special cases are more relevant for '.', not others like '?'
                    
                    // check to see if end char is used to end an abbreviation
                    for (var k = 1; k <= Math.min(j, maxabbrlen); k++) {
                        var sub = text.substring(j-k, j);
                        if (abbreviations.has(sub) && (j-k-1 < 0 || /\s/.test(text.charAt(j-k-1)))) {
                            isEnd = false;
                            break;
                        }
                    }
                    
                    // if end char preceded by another end prior to non-alphanumeric,
                    // we have an acronym. (you were originally using \s instead of \W, but then '.).'
                    // was considered an acronym
                    for (var k = 1; k <= j; k++) {
                        var _c = text.charAt(j-k);
                        if (sentenceEnds.indexOf(_c) > -1) {
                            isEnd = false;
                            break;
                        } else if (/\W/.test(_c)) {
                            break;
                        }
                    }
                    
                    // if end char preceded by a single capital letter, we have an initial (e.g., middle initial)
                    // only check mid sentence (that is, don't worry about this at the beginning of a sentence)
                    if (j > 1 && /[A-Z]/.test(text.charAt(j-1)) && /\s/.test(text.charAt(j-2)))
                        isEnd = false;
                    
                    // if we haven't had any white space yet, let's not consider this the end of a sentence
                    // TODO: a more efficient implementation would keep track of white space chars elsewhere, rather than traversing back.
                    var hadWhitespace = false;
                    for (var k = 1; k <= j; k++) {
                        var _c = text.charAt(j-k);
                        if (/\s/.test(_c)) {
                            hadWhitespace = true;
                            break;
                        }
                    }
                    if (!hadWhitespace)
                        isEnd = false;
                    
                    // if end char followed by non-whitespace, not an end
                    if (j+1 < text.length && /\S/.test(text.charAt(j+1)))
                        isEnd = false;
                    // TODO: if letter before end is capital, might not be considered
                    //       end (since these are usually acronyms (if so, should also check for
                    //       the presence of a lower-case letter to make sure that not everything
                    //       is upper case.
                    // TODO: So some tests above may set isEnd to false. Like T.I.A.A in the example above. But it's
                    //       possible for T.I.A.A. to be at sentence end. So a final test is to check for the end
                    //       char is followed by a space, and then if there is a capital letter (with non capitals elsewhere),
                    //       it is likely a sentence end.
                }
            } else if (quoteEnds.indexOf(c) > -1) {
                // if we're at an end quote, and the preceding char is a '.' (not ! or ?), we have an end
                // also make sure that if we have a char after, it's whitespace
                if (j > 0 && text.charAt(j-1) === '.'
                          && (j+1 >= text.length || /\s/.test(text.charAt(j+1))))
                    isEnd = true;
            }
            
            if (isEnd) {
                ends.push(j);
                hasEnd.push(true);
            } else if (isBlockEnd) {
                ends.push(j);
                hasEnd.push(false);
            }
        }
        var ret = {};
        ret['ends'] = ends;
        ret['hasEnd'] = hasEnd;
        return ret;
    };

    return me;
}());

if (typeof module !== 'undefined' && 'exports' in module){
    module.exports = NLP;
}
