var persighligter = function(_options) {
    // Debugging Options
    var HIGHLIGHT_ALL = false;
    var CYCLE_COLORS = false;
    var READABILITY_ONLY = false; // only highlight readability-extracted text.
                                  // this has higher precedence than HIGHLIGHT_ALL, which can still
                                  // be used to highlight all readability-extracted text
    
    var options = _options;
    
    /*
     * Node Highlighting Functionality
     */

    // TODO: make sure that class name not being used... (very unlikely)
    //       and generate an alternative accordingly
    // class prefix uses a UUID you generated, so that class names won't (won't with very high probability)
    // clash with class name on some page
    var class_prefix = '_highlight_b08d724a-5194-4bdd-9114-21136a9518ce';

    // needed two highlight wrappers to prevent background color from overlapping on top of text when line height is low
    // idea from: http://krasimirtsonev.com/blog/article/CSS-The-background-color-and-overlapping-rows-inline-element
    // inner wrapper for highlighting a text node. The inner wrapper applies font/text styling, and position:relative
    var innerClassName = class_prefix + '_highlightInner';
    //outer wrapper for highlighting a text node. The outer wrapper applies background-color, and position:static
    var outerClassName = class_prefix + '_highlightOuter';

    // wrapper class for tracking split text nodes
    var splitClassName = class_prefix + '_split';

    // generic class name for all text wrappers, which applies some generic styling
    var wrapperClassName = class_prefix + '_wrapper';

    var setPropertyImp = function(element, key, val) {
        // have to use setProperty for setting !important. This doesn't work: span.style.backgroundColor = 'yellow !important';
        element.style.setProperty(key, val, 'important');
    };

    var createTextNodeWrapper = function() {
        var span = document.createElement('span');
        span.classList.add(wrapperClassName);
        
        // don't all:inherit. causes some text color to not change, and links not to take on their color
        
        setPropertyImp(span, 'padding', 0);
        setPropertyImp(span, 'margin', 0);
        setPropertyImp(span, 'top', 0);
        setPropertyImp(span, 'bottom', 0);
        setPropertyImp(span, 'left', 0);
        setPropertyImp(span, 'right', 0);
        
        setPropertyImp(span, 'display', 'inline');
        
        setPropertyImp(span, 'position', 'static');
        
        setPropertyImp(span, 'font-size', 'inherit');
        setPropertyImp(span, 'font-family', 'inherit');
        setPropertyImp(span, 'font-style', 'inherit');
        setPropertyImp(span, 'font-weight', 'inherit');
        setPropertyImp(span, 'text-transform', 'inherit');
        
        return span;
    };

    // returns the link element we're in, or false if we're not in a link
    var inlink = function(element, depth) {
        depth = typeof depth !== 'undefined' ? depth : 10;
        var cur = element;
        var counter = 0;
        while (cur) {
            if (cur === null) {
                // if you get to the root element, parentElement returns null
                return false;
            } else if (counter > depth) {
                return false;
            } else if (cur.tagName == 'A' && cur.hasAttribute('href')) {
                // not only does it have to be an anchor tag, but also has to have href
                return cur;
            } else {
                cur = cur.parentNode;
            }
            counter++;
        }
        return false;
    };

    var wrapNode = function(outer, inner) {
        inner.parentElement.replaceChild(outer, inner);
        outer.appendChild(inner);
    };

    var HighlightColor = function(color, textcolor, linkcolor) {
        this.color = color;
        this.textcolor = textcolor;
        this.linkcolor = linkcolor;
    };

    var highlightTextNode = function(textNode, highlightColor) {
        // style.css has generic style already applied. Here, we add specific
        // stuff that may vary
        
        //color = typeof color !== 'undefined' ? color : bgcolor;
        // some text nodes had no parent. ???. seems to be a problem on pages with MathJax
        if (textNode.parentElement === null)
            return false;
        
        var _inlink = inlink(textNode, 4);
        
        // we need an outer wrapper with around the text node, with position:static, and wrap it around another wrapper with
        // position relative. This prevents background color of line l+1 from covering line l.
        var _span = createTextNodeWrapper();
        _span.classList.add(outerClassName);
        setPropertyImp(_span, 'position', 'static'); // this is already set by createTextNodeWrapper
        setPropertyImp(_span, 'background-color', highlightColor.color);
        wrapNode(_span, textNode);
        
        var span = createTextNodeWrapper();
        span.classList.add(innerClassName);
        
        setPropertyImp(span, 'text-shadow', 'none');
        setPropertyImp(span, 'color', highlightColor.textcolor);
        
        if (_inlink) {
            setPropertyImp(span, 'color', highlightColor.linkcolor);
            // you tried removing underline if it existed, but you can't modify text-decoration
            // for parent. So rather, add an underline, so that it gets the right color (as opposed to pre-highlighted underline color)
            setPropertyImp(span, 'text-decoration', 'underline');
        }
        
        setPropertyImp(span, 'position', 'relative'); // override position static from createTextNodeWrapper()
        
        wrapNode(span, textNode);
        
        return true;
    };

    var removeHighlight = function() {
        // first remove className, then outerClassName, wrappers
        var wrappers = [innerClassName, outerClassName];
        for (var h = 0; h < wrappers.length; h++) {
            var _class = wrappers[h];
            var highlighted = document.getElementsByClassName(_class);
            // iterate in reverse. It seems like removing child nodes modifies the variables 'elements'
            // maybe not if we convert from nodelist to array... but still keeping iteration order
            var highlightedA = Array.prototype.slice.call(highlighted);
            
            for (var i = highlightedA.length-1; i >= 0 ; i--) {
                var e = highlightedA[i];
                // each span has exactly one child
                var child = e.removeChild(e.firstChild);
                e.parentElement.replaceChild(child, e);
            }
        }
        
        // have to join together text nodes that were split earlier. Otherwise sentences starting with a space then a link will lose the space,
        // and cause problems on the next highlight
        
        var split = document.getElementsByClassName(splitClassName);
        var splitA = Array.prototype.slice.call(split);
        for (var i = splitA.length-2; i >= 0 ; i--) {
            var e1 = splitA[i];
            var e2 = splitA[i+1];
            if (e2 === e1.nextElementSibling && e1.firstChild && e2.firstChild) {
                e1.firstChild.nodeValue += e2.firstChild.nodeValue;
                e2.parentElement.removeChild(e2);
            }
        }
        
        // split is a live Collection, so don't have to recreate...
        splitA = Array.prototype.slice.call(split);
        for (var i = splitA.length-1; i >= 0 ; i--) {
            var e = splitA[i];
            var child = e.removeChild(e.firstChild);
            e.parentElement.replaceChild(child, e);
        }
    };

    /*
     * Content Extraction
     */

    var readable = new Readability(document, null, 3); // skip level goes from 0 to 3. Higher skip level returns more content.

    var countWords = function(text){
        // trim
        text = text.trim();
        // consolidate contiguous whitespace
        text = text.replace(/\s+/g, ' ');
        // remove space in beginning of line
        text = text.replace(/\n\s+/,'\n');
        return text.split(' ').length; 
    };

    // s is the start index of the sentence, within the textContent of the first node
    // e is the end index of the sentence within the textContent of the last node
    // hasEnd indicates whether the sentence has a sentence end (some sentences are constructed
    // just from being at the end of a TextBlock, even without a sentence end.
    // readability indicates whether the sentence is extracted by readability
    var Sentence = function(nodes, s, e, hasEnd) {
        this.nodes = nodes;
        this.s = s;
        this.e = e;
        this.hasEnd = hasEnd;
        this.nodeCount = this.nodes.length;
        
        var text = '';
        if (this.nodeCount === 1) {
            text = this.nodes[0].textContent.substring(this.s, this.e+1);
        } else if (this.nodeCount >= 2) {
            var middle = this.nodes.slice(1,this.nodeCount-1);
            text = this.nodes[0].textContent.substring(this.s)
                 + middle.map(function(t){return t.textContent;}).join('')
                 + this.nodes[this.nodeCount-1].textContent.substring(0, this.e+1);
        }
        this.text = text.trim();
        
        this.textLength = this.text.length;
        // TODO: could implement following as method instead of instance variable so results are calculated lazily (with possible caching)
        this.wordCount = countWords(this.text);
        
        var linkDensityNum = 0;
        var linkDensityDen = this.textLength;
        
        for (var i = 0; i < this.nodes.length; i++) {
            var node = this.nodes[i];
            var _inlink = inlink(node, 8);
            if (_inlink) {
                var chars = node.textContent.length;
                if (i === 0)
                    chars -= this.s;
                else if (i === this.nodes.length - 1)
                    chars = this.e + 1;
                linkDensityNum += chars;
            }
        }
        
        this.linkDensity = linkDensityNum / linkDensityDen;
    };

    Sentence.prototype.trimLeft = function() {
        if (this.nodeCount > 0) {
            // this method would not work as intended if the entire first text node and some of the second is whitespace.
            var node = this.nodes[0];
            var text = node.textContent;
            // let's just loop up to the second to last letter, to make sure we leave at least one char
            var end = text.length - 2;
            if (this.nodeCount === 1) {
                end = this.e - 1;  // same in this case. second to last char.
            }
            for (var i = this.s; i <= end; i++) {
                var c = text.charAt(i);
                if (/\s/.test(c)) {
                    this.s++;
                } else {
                    break;
                }
            }    
        }
    };

    Sentence.prototype.toString = function() {
        return this.text;
    };

    // split text, and indicate with a <span> wrapper that the text had been split
    var splitAndWrapText = function(textNode, offset) {
        var _t = textNode.splitText(offset);
        // we may have a textNode that has already been split
        alreadySplit = textNode.parentElement.classList.contains(splitClassName);
        
        if (alreadySplit) {
            var span = createTextNodeWrapper();
            span.classList.add(splitClassName);
            wrapNode(span, textNode);
            
            var parent = span.parentElement;
            var _span = parent.removeChild(span);
            parent.parentElement.insertBefore(_span, parent);
        } else {
            var span = createTextNodeWrapper();
            span.classList.add(splitClassName);
            wrapNode(span, textNode);
            
            // and again
            var span = createTextNodeWrapper();
            span.classList.add(splitClassName);
            wrapNode(span, _t);
        }
        
        return _t;
    };

    Sentence.prototype.highlight = function(highlightColor) {
        if (this.nodeCount === 1) {
            var t = this.nodes[0];
            if (t.textContent.length > this.e+1)
                splitAndWrapText(t, this.e+1);
            if (this.s > 0 && t.textContent.length > this.s)
                t = splitAndWrapText(t, this.s);
            highlightTextNode(t, highlightColor);
        } else if (this.nodeCount >= 2) {
            // last node
            var t = this.nodes[this.nodeCount-1];
            if (t.textContent.length > this.e+1)
                splitAndWrapText(t, this.e+1);
            highlightTextNode(t, highlightColor);
            
            // middle nodes
            var middle = this.nodes.slice(1,this.nodeCount-1);
            for (var i = 0; i < middle.length; i++) {
                highlightTextNode(middle[i], highlightColor);
            }
            
            //first node
            t = this.nodes[0];
            if (this.s > 0 && t.textContent.length > this.s)
                t = splitAndWrapText(t, this.s);
            highlightTextNode(t, highlightColor);
        }
    };

    // a TextBlock is a list of text nodes that are in the same block/segment
    var TextBlock = function(nodes, parseSentences, readability) {
        // if text node, only keep if there is some text
        this.nodes = nodes.filter(function(n){
            var type = n.nodeType;
            return type === Node.ELEMENT_NODE || (type === Node.TEXT_NODE && n.textContent.length > 0);
        });
        this.nodeCount = this.nodes.length;
        this.textNodes = this.nodes.filter(function(n){return n.nodeType === Node.TEXT_NODE;});
        this.text = this.nodes.map(function(n) {
            var nodeType = n.nodeType;
            if (nodeType === Node.TEXT_NODE)
                return n.textContent.replace(/\s+/g, " ");
            else if (nodeType === Node.ELEMENT_NODE && isElementTagBR(n))
                return '\n';
            else
                return '';
        }).join('').trim();
        this.textLength = this.text.length;
        this.blank = this.textLength == 0 || /^\s+$/.test(this.text);
        this.sentences = [];
        if (parseSentences)
            this.sentences = getSentences(nodes);
        this.readability = readability; // is this a text block with content from readability article?
        
        var linkDensityNum = 0;
        var linkDensityDen = this.textLength;
        
        for (var i = 0; i < this.nodes.length; i++) {
            var node = this.nodes[i];
            var _inlink = inlink(node, 8);
            if (_inlink) {
                var chars = node.textContent.length;
                linkDensityNum += chars;
            }
        }
        
        this.linkDensity = linkDensityNum / linkDensityDen;
    };

    TextBlock.prototype.toString = function() {
        return this.text;
    };

    TextBlock.prototype.highlight = function(highlightColor) {
        for (var i = 0; i < this.nodes.length; i++) {
            var n = this.nodes[i];
            // we may possibly have non-text nodes, like <br>. Only apply highlighting to
            // text nodes
            var nodeType = n.nodeType;
            if (nodeType !== Node.TEXT_NODE)
                continue;
            
            highlightTextNode(n, highlightColor);
        }
    };

    // works on elements and non-elements
    var isElementTag = function(node, tag) {
        return node.nodeType === Node.ELEMENT_NODE && node.tagName === tag.toUpperCase();
    };

    var isElementTagBR = function(node) {
        return isElementTag(node, "BR");
    };

    var metaTagsl = ["HEAD", "TITLE", "BASE", "LINK", "META", "SCRIPT", "STYLE"];
    var metaTags = new Set(metaTagsl);

    // tags is a Set
    var isElementTags = function(node, tags) {
        return node.nodeType === Node.ELEMENT_NODE && tags.has(node.tagName);
    };

    // includes all element types containing meta info, not just <meta>
    // only check one node up
    var isInMetaTag = function(node) {
        var elt = node;
        if (elt.nodeType !== Node.ELEMENT_NODE)
            elt = elt.parentElement;
        var inMetaTag = elt && elt.nodeType === Node.ELEMENT_NODE && isElementTags(elt, metaTags);
        return inMetaTag;
    };

    var inputTagsl = ["TEXTAREA", "INPUT"];
    var inputTags = new Set(inputTagsl);
    //only check one node up
    var isUserInput = function(node) {
        var elt = node;
        if (elt.nodeType !== Node.ELEMENT_NODE)
            elt = elt.parentElement;
        var userInput = elt && elt.nodeType === Node.ELEMENT_NODE && isElementTags(elt, inputTags);
        return userInput;
    };

    var nearestLineBreakNode = function(node) {
        var cur = node;
        // <br> has style inline, so handle as a special case
        while (cur) {
            var isElement = cur.nodeType === Node.ELEMENT_NODE;
            var display = null;
            if (isElement) {
                var computedStyle = window.getComputedStyle(cur);
                if (computedStyle)
                    display = computedStyle.display;
            }
            var isLineBreakNode = false;
            if (display && !display.startsWith('inline') && (display !== 'none')) {
                // display check probably not necessary since we already filtered text nodes with a display:none parent
                isLineBreakNode = true;
            }
            if (isElementTagBR(cur))
                isLineBreakNode = true;
            if (cur === null) {
                return document.body;
            } else if (isLineBreakNode) {
                return cur;
            } else {
                cur = cur.parentElement;
            }
        }
    };

    // whether single <br> should be considered as not separating a block
    var ALLOW_SINGLE_BR_WITHIN_BLOCK = true;

    // TODO: more checks for visibility
    var isVisible = function(textNode, docWidth, docHeight) {
        var visible = true;
        if (textNode.parentElement !== null) {
            var parent = textNode.parentElement;
            var style = window.getComputedStyle(parent);
            if (style) {
                var nonVisibleStyle = style.color === 'rgba(0, 0, 0, 0)'
                                   || style.display === 'none'
                                   || style.visibility === 'hidden';
                if (nonVisibleStyle)
                    visible = false;
            } else {
                // we have to have computed style
                visible = false;
            }
        } else {
            // we have to have a parent (you saw some cases where there was no parent (MathJax)
            visible = false;
        }
        
        // check that element is on the page with positive height and width
        // TextNodes don't have a getBoundingClientRect method, so create a range
        if (visible) {
            var range = document.createRange();
            range.selectNode(textNode);
            var rect = range.getBoundingClientRect();
            
            // "The amount of scrolling that has been done of the viewport area (or any other scrollable element) is taken into account when computing the bounding rectangle."
            // https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
            
            var sx = window.scrollX;
            var sy = window.scrollY;
            
            var top = rect.top + sy;
            //var bottom = rect.bottom + sy;
            var left = rect.left + sx;
            var right = rect.right + sx;
            var height = rect.height;
            var width = rect.width;
            
            // don't count stuff that's below the page as being invisible. (bottom > docHeight)
            // in your experience, such content is not intended to be invisible.
            var offPage = top < 0 || left < 0 || right > docWidth;
            var zeroDim = width <= 0 || height <= 0;
            if (offPage || zeroDim)
                visible = false;
        }
        
        // TODO: check A11Y project
        return visible;
    };

    var getTextBlocks = function(parseSentences) {
        var html = document.documentElement;
        var body = document.body;
        
        // TODO Should getBoundingClientRect().[height|width] also be added below? (they underreported in some examples, but that shouldn't matter in the Max)
        var docHeight = Math.max(html.clientHeight, html.scrollHeight, html.offsetHeight, body.scrollHeight, body.offsetHeight);
        var docWidth = Math.max(html.clientWidth, html.scrollWidth, html.offsetWidth, body.scrollWidth, body.offsetWidth);
        
        // parseSentences defaults to true
        parseSentences = typeof parseSentences === 'undefined' ? true : parseSentences;
        var leaves = []; // textnodes and <br>s
        // FILTER_SKIP will continue searching descendants. FILTER_REJECT will not
        // the following walker will traverse all non-empty text nodes and <br>s
        // you're getting leaves by keeping text nodes and <br> nodes. Could possibly alternatively
        // check for nodes with no children, but what you did is fine since you're particularly interested
        // in text nodes and <br>s.
        var walker = document.createTreeWalker(document.body,
                                               NodeFilter.SHOW_ALL,
                                               function(node) {
                                                   var filter = NodeFilter.FILTER_SKIP;
                                                   var type = node.nodeType;
                                                   if (type === Node.TEXT_NODE
                                                         && !isInMetaTag(node)
                                                         && !/^\s+$/.test(node.textContent)
                                                         && isVisible(node, docWidth, docHeight))
                                                       filter = NodeFilter.FILTER_ACCEPT;
                                                   else if (isElementTagBR(node))
                                                       filter = NodeFilter.FILTER_ACCEPT;
                                                   return filter;
                                               },
                                               false);
        
        while (walker.nextNode()) {
            var leaf = walker.currentNode;
            leaves.push(leaf);
        }
        
        var nlbns = [];  // nearest line break nodes
        for (var i = 0; i < leaves.length; i++) {
            var leaf = leaves[i];
            var nlbn = nearestLineBreakNode(leaf);
            nlbns.push(nlbn);
        }
        
        var blocks = []; // A list of TextBlocks
        var curTextNodes = []; // text nodes and possibly some <br>s if they are within a text block
        if (nlbns.length > 0 && !isElementTagBR(nlbns[0]))
            curTextNodes.push(leaves[0]);
        
        var articleNodesl = readable.getArticle(false).getNodes();
        var articleNodes = new Set(articleNodesl);
        
        for (var i = 1; i < leaves.length; i++) {
            var leaf = leaves[i];
            
            // if we only have a single <br>, add it
            var brToAdd = false;
            if (ALLOW_SINGLE_BR_WITHIN_BLOCK && isElementTagBR(leaf)) {
                var brBefore = i > 0 && isElementTagBR(nlbns[i-1]);
                var brAfter = i < nlbns.length-1 && isElementTagBR(nlbns[i+1]);
                var sameNlbns = i > 0 && i < nlbns.length-1 && nlbns[i-1] === nlbns[i+1];
                if (!brBefore && !brAfter && sameNlbns) {
                    brToAdd = true;
                    // THE FOLLOWING LINE IS MODIFYING EXISTING STRUCTURE
                    nlbns[i] = nlbns[i-1];
                }
            }
            
            var nlbn = nlbns[i];
            var lastNlbn = nlbns[i-1];
            
            if (nlbn !== lastNlbn && curTextNodes.length > 0) {
                // consider a TextBlock corresponding to readability if its first node was extracted by readability
                var readability = curTextNodes.length > 0 && articleNodes.has(curTextNodes[0]);
                
                var tb = new TextBlock(curTextNodes, parseSentences, readability);
                if (!tb.blank)
                    blocks.push(tb);
                curTextNodes = [];
            }
            
            if (!isElementTagBR(nlbn) || brToAdd) {
                curTextNodes.push(leaf);
            } 
        }
        if (curTextNodes.length > 0) {
            var readability = articleNodes.has(curTextNodes[0]); // same test as above (but we already checked curTextNodes.length)
            var tb = new TextBlock(curTextNodes, parseSentences, readability);
            if (!tb.blank)
                blocks.push(tb);
        }
        
        return blocks;
    };

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
    var sentenceSegments = function(text) {
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

    // allow sentences across newlines (single <br>, per earlier in the pipeline those could be maintained in a TextBlock)?
    var CROSS_BR = false;

    var getSentences = function(nodes) {
        var sentences = [];
        var subblocks = [];
        
        if (CROSS_BR) {
            subblocks = [nodes.filter(function(n){return n.nodeType === Node.TEXT_NODE;})];
        } else {
            var curblock = [];
            for (var i = 0; i < nodes.length; i++) {
                var n = nodes[i];
                var nodeType = n.nodeType;
                if (nodeType === Node.ELEMENT_NODE && isElementTagBR(n)) {
                    if (curblock.length > 0) {
                        subblocks.push(curblock);
                        curblock = [];
                    }
                } else if (nodeType === Node.TEXT_NODE) {
                    curblock.push(n);
                }
            }
            if (curblock.length > 0)
                subblocks.push(curblock);
        }
        
        // ends are the actual ends, not one position after (like substring would use)
        for (var i = 0; i < subblocks.length; i++) {
            var block = subblocks[i];
            
            var nodeTextLens = block.map(function(e){return e.textContent.length;});
            
            // no need to worry about 0 length text. Those are filtered out earlier in the pipeline
            var nodeTextEnds = []; // cumulative sum of nodeTextLens
            if (nodeTextLens.length > 0) {
                nodeTextEnds.push(nodeTextLens[0]-1);
                for (var j = 0; j < nodeTextLens.length-1; j++) {
                    nodeTextEnds.push(nodeTextEnds[j] + nodeTextLens[j+1]);
                }
            }
            var nodeTextStarts = [];
            if (nodeTextEnds.length > 0) {
                nodeTextStarts = [0].concat(nodeTextEnds.slice(0,nodeTextEnds.length-1).map(function(e){return e+1;}));
            }
            
            // TODO: make sentences not start on white space (but the next non-whitespace char)
            
            var text = block.map(function(n){return n.textContent;}).join('');
            
            var segs = sentenceSegments(text);
            var ends = segs.ends; // sentence end indices
            var hasEnd = segs.hasEnd; // flag for whether there was an actual end (block ends may not have sentence ends)
            
            var starts = [];
            if (ends.length > 0) {
                starts = [0].concat(ends.slice(0,ends.length-1).map(function(e){return e+1;}));
            }
            
            for (var j = 0; j < starts.length; j++) {
                var start = starts[j]; // sentence start
                var end = ends[j]; // sentence ends
                var _hasEnd = hasEnd[j];
                var sentenceNodes = [];
                var maxL = -1;
                for (var k = 0; k < nodeTextStarts.length; k++) {
                    k = Math.max(maxL, k); // we can skip some k if l went higher below
                    var nodeTextStartL = nodeTextStarts[k];
                    var nodeTextEndL = nodeTextEnds[k];
                    if (start > nodeTextEndL)
                        continue;
                    else {
                        var withinstart = start - nodeTextStartL;
                        sentenceNodes.push(block[k]);
                        for (var l = k; l < nodeTextStarts.length; l++) {
                            maxL = Math.max(maxL, l);
                            var nodeTextStartR = nodeTextStarts[l];
                            var nodeTextEndR = nodeTextEnds[l];
                            if (end > nodeTextEndR) {
                                if (l > k)
                                    sentenceNodes.push(block[l]);
                                continue;
                            } else {
                                var withinend = end - nodeTextStartR;
                                if (l !== k)
                                    sentenceNodes.push(block[l]);
                                var sentenceToAdd = new Sentence(sentenceNodes, withinstart, withinend, _hasEnd);
                                sentences.push(sentenceToAdd);
                                break;
                            }
                        }
                    }
                    break;
                }
            }
        }
        
        return sentences;
    };

    /*
     * Highlighting
     */

    var getCandidates = function() {
        var candidates = [];
        var textblocks = getTextBlocks();
        
        var WORD_COUNT_THRESHOLD = 3; // min number of words to be a candidate
        var CHAR_COUNT_THRESHOLD = 15; // min number of characters
        var LINK_DENSITY_THRESHOLD = .75;
        
        for (var h = 0; h < textblocks.length; h++) {
            var tb = textblocks[h];
            var sentences = tb.sentences;
            var readability = tb.readability;
            
            for (var i = 0; i < sentences.length; i++) {
                var sentence = sentences[i];
                // we never want to operate on user input
                var userInput = sentence.nodes.length > 0 && isUserInput(sentence.nodes[0]);
                if (userInput)
                    continue;
                
                // candidates are sentences extracted from readability or other sentences that have a sentence end
                // along with some other constraints
                var isCandidate = sentence.wordCount > WORD_COUNT_THRESHOLD
                                  && sentence.textLength > CHAR_COUNT_THRESHOLD
                                  && sentence.linkDensity < LINK_DENSITY_THRESHOLD
                                  && (readability || sentence.hasEnd);
                
                if (HIGHLIGHT_ALL)
                    isCandidate = true; // for debugging
                
                if (READABILITY_ONLY) {
                    isCandidate = isCandidate && readability;
                }
                
                if (isCandidate)
                    candidates.push(sentence);
            }   
        }
        return candidates;
    };

    var ScoredCandidate = function(candidate, score, index) {
        this.candidate = candidate;
        this.score = score;
        this.index = index; // index, relative to all original candidates (for sorting
                            // since highlighting depends on having candidates being in
                            // certain order to work properly
    };

    // return the candidates to highlight
    // cth = candidates to highlight
    var cth = function() {
        // a candidate may be a TextBlock or a Sentence.
        var candidates = getCandidates();
        var scores = [];
        var _tohighlight = [];
        for (var i = 0; i < candidates.length; i++) {
            var candidate = candidates[i];
            var stems = NLP.tokenormalize(candidate.text);
            
            var score = Math.random();
            
            scores.push(new ScoredCandidate(candidate, score, i));
        }
        
        // calculating percentile based on ratio, and filtering could be more
        // elegant than sorting... and also wouldn't require sorting by index
        // at the end
        
        scores.sort(function(a, b) {
            return b.score - a.score;
        });
        
        // coverage goes from 0 to 10.
        // max ratio is .5
        var ratio = options.coverage / 100.0;
        
        if (HIGHLIGHT_ALL)
            ratio = 1; // debugging
        
        for (var i = 0; i < Math.min(scores.length, Math.floor(ratio * scores.length)); i++) {
            var scored = scores[i];
            _tohighlight.push(scored);
        }
        
        // highlighting breaks if not in pre-order traversal order
        _tohighlight.sort(function(a, b) {
            return a.index - b.index;
        });
        
        // if we're highlighting sentences, make sure we got at least one sentence. Otherwise, we're probably on
        // a navigational page
        var haveOne = false;
        for (var i = 0; i < _tohighlight.length; i++) {
            var scoredCand = _tohighlight[i];
            var cand = scoredCand.candidate;
            if (cand instanceof Sentence && cand.hasEnd) {
                haveOne = true;
                break;
            }
        }
        
        if (!haveOne)
            _tohighlight = [];
        
        return _tohighlight;
    };

    var updateHighlightState = function(highlightState, success) {
        chrome.runtime.sendMessage({'message': "updateHighlightState", 'highlight': highlightState, 'success': success});
    };

    var isEmbed = window != window.parent; // am I in an iframe?

    // unlike isEmbed, hasEmbed can change, so make it a function
    // even checking for iframe doesn't fix the problem since that can change too
    var hasEmbed = function() {
        return window.frames && window.frames.length > 0;
    };

    // This works even on cross domain iframes. In general, a page wouldn't be
    // able to call frames[0].document, if the frame was cross domain, but from
    // the extension it works. This even worked from the extension when you tried
    // with "all_frames" set to false
    var somethingHighlighted = function(win) {
        var sh = win.document.getElementsByClassName(innerClassName).length > 0;
        if (!sh) {
            var nframes = win.frames.length;
            for (var i = 0; i < nframes; i++) {
                var _frame = win.frames[i];
                sh = sh || somethingHighlighted(_frame);
                if (sh)
                    break;
            }
        }
        return sh;
    };

    var contentType = document.contentType;
    // maybe all text/* ???
    var compatible = document.doctype !== null
        || contentType.indexOf('text/html') > -1
        || contentType.indexOf('text/plain') > -1;

    // callback takes two args: a number indicating highlight state, and boolean for success
    var getHighlightState = function(callback) {
        var message = {'message': "getHighlightState"};
        chrome.runtime.sendMessage(message, function(response) {
            var curHighlight = response['curHighlight'];
            var curSuccess = response['curSuccess'];
            callback(curHighlight, curSuccess);
        });
    };

    if (!isEmbed && compatible) {
        // if top frame and html page, tell eventPage our initial status, so it shows the icon
        updateHighlightState(0, null);
        
        // if we're the top frame, continuously check if we (or our child frames) have highlighting
        // it's possible that changing URLs in a child frame caused the highlighting to
        // turn off. If so, let's turn off the icon and update highlight state.
        // This is somewhat hacky, but the alternatives are as well. For example, an alternative would
        // require monitoring all events that can trigger highlighting to disappear (iframe changes, DOM modications, etc.).
        // Alternatively, it would possibly be more elegant to handle this in eventPage, but that would
        // require additional message passing which becomes a mess IMO.
        // Also, somethingHighlighted() is fast (it uses getElementsByClassName: 1.97ms on "a considerably large file with lots of elements to consider" in 2007, http://ejohn.org/blog/getelementsbyclassname-speed-comparison/)
        
        var interval = 1200;
        UTILS.safeSetInterval(function() {
            getHighlightState(function(curHighlight, curSuccess) {
                // don't have to worry about a page change in the case where
                // curHighlight > 0 and !curSuccess,
                // since we don't keep that icon active for more than X seconds
                if (curHighlight > 0 && curSuccess && !somethingHighlighted(window)) {
                    updateHighlightState(0, null);
                }
            });
        }, interval);
    }

    //useful for debugging sentence boundary detection
    var _cycleColors = ["yellow", "skyblue", "sandybrown", "palegreen", "lightpink"];
    var cycles = [];
    for (var i = 0; i < _cycleColors.length; i++) {
        cycles.push(new HighlightColor(_cycleColors[i], 'black', 'red'));
    }
    var cycleCurColor = 0;
    var getNextColor = function() {
        color = cycles[cycleCurColor];
        cycleCurColor = (cycleCurColor+1) % cycles.length;
        return color;
    };

    // hacky way to trim spaces if we're not highlighting the preceding sentence
    // destructively modifies its input
    var trimSpaces = function(scoredCandsToHighlight) {
        for (var j = scoredCandsToHighlight.length-1; j >= 0; j--) {
            var scoredCand = scoredCandsToHighlight[j];
            // could just check the first element earlier, but this is safer (in case multiple types to highlight)
            if (scoredCand.candidate instanceof Sentence) {
                var toTrim = j == 0; // we definitely want to trim first sentence
                if (j >= 1) {
                    var curIndex = scoredCand.index;
                    var prev = scoredCandsToHighlight[j-1];
                    var prevIndex = prev.index;
                    
                    // we want to trim if the preceding candidate is not going to be highlighted
                    toTrim = curIndex > prevIndex+1;
                    
                    // however, if we're at the start of a text block, even if the preceding candidate will be highlighted,
                    // we still want to trim (althugh this may not be necessary as the browser may ignore spaces in the beginning
                    // a text block, even if you wrap them in a span.
                    if (curIndex == prevIndex+1) {
                        // could store whether sentence starts TextBlock, but let's just check with nearestLineBreakNode()
                        var candNodes = scoredCand.candidate.nodes;
                        var prevNodes = prev.candidate.nodes;
                        if (candNodes.length > 0
                                && prevNodes.length > 0
                                && nearestLineBreakNode(candNodes[0]) !== nearestLineBreakNode(prevNodes[prevNodes.length-1])) {
                            toTrim = true;
                        }
                    }
                }
                
                if (toTrim) {
                    scoredCand.candidate.trimLeft();
                }
            }
        }
    };

    // you were originally managing highlightState in here. But then when you added
    // iframe support, highlightState management was moved to eventPage.js, so it now
    // gets passed along as an arg. This prevents different iframes from being in different
    // states, in case they were loaded at different times (e.g., one before a highlight and one loaded
    // after) 
    var highlight = function(highlightState) {
        // Where the background page is Inactive (when using "persistent": false),
        // there is a slight delay for the following call
        // we're in a new state, but we don't know whether there is success yet
        updateHighlightState(highlightState, null);
        
        removeHighlight();
        if (highlightState > 0) {
            var scoredCandsToHighlight = cth();
            trimSpaces(scoredCandsToHighlight);
            
            var highlightColor = new HighlightColor('yellow', 'black', 'red');
            // have to loop backwards since splitting text nodes
            for (var j = scoredCandsToHighlight.length-1; j >= 0; j--) {
                var candidate = scoredCandsToHighlight[j].candidate;
                candidate.highlight(CYCLE_COLORS ? getNextColor() : highlightColor);
            }
            
            // the following is hacky, but to handle the case where we don't have success
            // use a slight delay in telling the eventPage, in case some other iframe has success
            // so that icon doesn't flash from no success to success
            // also, you probably don't *need* to set this up to avoid closure issues, but just in case...
            var success = scoredCandsToHighlight.length > 0;
            var notify = (function(state, _success) {
                return function() {
                    // if we have no highlighting, success is false.
                    // also let background page know if we do have success on page
                    // (as opposed to null for, I don't know, which we told it earlier)
                    updateHighlightState(highlightState, _success);
                };
            })(highlightState, success);
            
            var delayMs = 200; // milliseconds
            var shouldDelay = !success && (isEmbed || hasEmbed());
            if (shouldDelay) {
                UTILS.setTimeoutIgnore(notify, delayMs);
            } else {
                notify();
            }
            
            // if we don't have success, turn off icon in 2 seconds
            var turnoffdelay = 2000;
            if (!success) {
                UTILS.setTimeoutIgnore(function() {
                    getHighlightState(function(curHighlight, curSuccess) {
                        if (curHighlight > 0 && !curSuccess) {
                            updateHighlightState(0, null);
                        }
                    });
                }, turnoffdelay);
            }
        }
    };

    chrome.runtime.onMessage.addListener(function(request) {
        var method = request.method;
        if (method === 'highlight') {
            // it's possible we're in an iframe with non-compatible content, so check...
            if (compatible) {
                var highlightState = request.highlightState;
                highlight(highlightState);
            }
        } else if (method === 'updateOptions') {
            options = request.data;
        }
    });
    
    // public interface
    var me = Object.create(null);
    me.removeHighlight = removeHighlight;
    me.readable = readable;
    return me;
};

var PERSIGHLIGHTER = null;

// don't do anything until we get the options
chrome.runtime.sendMessage({'message': 'getOptions'}, function(response) {
    PERSIGHLIGHTER = persighligter(response);
    // we may have existing highlighting. clear so we're in sync with icon.
    // after injecting content.js, remove highlighting. (will ensure icon and page in sync)
    // there would be no consequence to doing this on all pages, so you don't really need to use that inject flag
    if ((typeof injected) !== 'undefined' && injected)
        PERSIGHLIGHTER.removeHighlight();
});

