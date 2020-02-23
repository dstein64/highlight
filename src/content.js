// TODO: Use consistent variable naming (camel case or underscores, not both)

/***********************************
 * Options and Shared Globals
 ***********************************/

// Debugging Options
var HIGHLIGHT_ALL = false;
var CYCLE_COLORS = false;
// only highlight readability-extracted text.
// this has higher precedence than HIGHLIGHT_ALL, which can still
// be used to highlight all readability-extracted text
var READABILITY_ONLY = false;

var OPTIONS = null;
chrome.runtime.sendMessage({message: "getOptions"}, function(response) {
    OPTIONS = response;
});

/***********************************
 * Node Highlighting Functionality
 ***********************************/

// TODO: make sure that class name not being used... (very unlikely)
//       and generate an alternative accordingly
// class prefix uses a UUID you generated, so that class names won't
// (won't with very high probability) clash with class name on some page
var class_prefix = '_highlight_b08d724a-5194-4bdd-9114-21136a9518ce';

// needed two highlight wrappers to prevent background color from
// overlapping on top of text when line height is low idea from:
// http://krasimirtsonev.com/blog/article/
//        CSS-The-background-color-and-overlapping-rows-inline-element
// inner wrapper for highlighting a text node. The inner wrapper applies
// font/text styling, and position:relative
var innerClassName = class_prefix + '_highlightInner';
// outer wrapper for highlighting a text node. The outer wrapper applies
// background-color, and position:static
var outerClassName = class_prefix + '_highlightOuter';

// wrapper class for tracking split text nodes
var splitClassName = class_prefix + '_split';

// generic class name for all text wrappers, which applies some generic
// styling
var wrapperClassName = class_prefix + '_wrapper';

var setPropertyImp = function(element, key, val) {
    // have to use setProperty for setting !important. This doesn't work
    // span.style.backgroundColor = 'yellow !important';
    element.style.setProperty(key, val, 'important');
};

var createTextNodeWrapper = function() {
    var span = document.createElement('span');
    span.classList.add(wrapperClassName);
    
    // don't all:inherit. causes some text color to not change, and links
    // not to take on their color
    
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
        } else if (cur.tagName === 'A' && cur.hasAttribute('href')) {
            // not only does it have to be an anchor tag, but also has
            // to have href
            return cur;
        } else {
            cur = cur.parentNode;
        }
        counter++;
    }
    return false;
};

var descendantOfTag = function(element, tagName, depth) {
    // -1 for infinite. not safe.
    depth = typeof depth !== 'undefined' ? depth : -1;
    tagName = tagName.toUpperCase();
    var cur = element;
    var counter = 0;
    while (cur) {
        if (cur === null) { // at root
            return false;
        } else if (depth > -1 && counter > depth) {
            return false;
        } else if (cur.tagName === tagName) {
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

var ColorSpec = function(highlightColor, textColor, linkColor) {
    this.highlightColor = highlightColor;
    this.textColor = textColor;
    this.linkColor = linkColor;
};

var highlightTextNode = function(textNode, colorSpec) {
    // style.css has generic style already applied. Here, we add specific
    // stuff that may vary
    
    //color = typeof color !== 'undefined' ? color : bgcolor;
    // some text nodes had no parent. ???. seems to be a problem on pages
    // with MathJax
    if (textNode.parentElement === null)
        return false;
    
    var _inlink = inlink(textNode, 4);
    
    // we need an outer wrapper with around the text node, with position
    // static, and wrap it around another wrapper with
    // position relative. This prevents background color of line l+1 from
    // covering line l.
    var _span = createTextNodeWrapper();
    _span.classList.add(outerClassName);
    // this is already set by createTextNodeWrapper
    setPropertyImp(_span, 'position', 'static');
    setPropertyImp(_span, 'background-color', colorSpec.highlightColor);
    wrapNode(_span, textNode);
    
    var span = createTextNodeWrapper();
    span.classList.add(innerClassName);
    
    setPropertyImp(span, 'text-shadow', 'none');
    setPropertyImp(span, 'color', colorSpec.textColor);
    
    if (_inlink) {
        setPropertyImp(span, 'color', colorSpec.linkColor);
        // you tried removing underline if it existed, but you can't
        // modify text-decoration for parent. So rather, add an underline,
        // so that it gets the right color (as opposed to pre-highlighted
        // underline color)
        setPropertyImp(span, 'text-decoration', 'underline');
    }
    
    // override position static from createTextNodeWrapper()
    setPropertyImp(span, 'position', 'relative');
    
    wrapNode(span, textNode);
    
    return true;
};

var removeHighlight = function() {
    // first remove className, then outerClassName, wrappers
    var wrappers = [innerClassName, outerClassName];
    for (var h = 0; h < wrappers.length; h++) {
        var _class = wrappers[h];
        var highlighted = document.getElementsByClassName(_class);
        // iterate in reverse. It seems like removing child nodes modifies
        // the variables 'elements'
        // maybe not if we convert from nodelist to array... but still
        // keeping iteration order
        var highlightedA = Array.prototype.slice.call(highlighted);
        
        for (var i = highlightedA.length-1; i >= 0 ; i--) {
            var e = highlightedA[i];
            // each span has exactly one child
            var child = e.removeChild(e.firstChild);
            e.parentElement.replaceChild(child, e);
        }
    }
    
    // have to join together text nodes that were split earlier. Otherwise
    // sentences starting with a space then a link will lose the space,
    // and cause problems on the next highlight
    
    var split = document.getElementsByClassName(splitClassName);
    var splitA = Array.prototype.slice.call(split);
    for (var i = splitA.length-2; i >= 0 ; i--) {
        var e1 = splitA[i];
        var e2 = splitA[i+1];
        if (e2 === e1.nextElementSibling 
            && e1.firstChild
            && e2.firstChild) {
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

/***********************************
 * Content Extraction
 ***********************************/

// skip level goes from 0 to 3. Higher skip level returns more content.
var readable = new Readability(document, null, 3);

var countWords = function(text){
    // trim
    text = text.trim();
    // consolidate contiguous whitespace
    text = text.replace(/\s+/g, ' ');
    // remove space in beginning of line
    text = text.replace(/\n\s+/,'\n');
    return text.split(' ').length; 
};

// s is the start index of the sentence, within the textContent of the
// first node.
// e is the end index of the sentence within the textContent of the last
// node.
// hasEnd indicates whether the sentence has a sentence end (some sentences
// are constructed just from being at the end of a TextBlock, even without
// a sentence end.
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
    // TODO: could implement following as method instead of instance
    // variable so results are calculated lazily (with possible caching)
    this.wordCount = countWords(this.text);
    
    this.avgWordLength = this.textLength / this.wordCount;
    
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
        // this method would not work as intended if the entire first
        // text node and some of the second is whitespace.
        var node = this.nodes[0];
        var text = node.textContent;
        // let's just loop up to the second to last letter, to make sure
        // we leave at least one char
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

// split text, and indicate with a <span> wrapper that the text had been
// split.
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

Sentence.prototype.highlight = function(colorSpec) {
    if (this.nodeCount === 1) {
        var t = this.nodes[0];
        if (t.textContent.length > this.e+1)
            splitAndWrapText(t, this.e+1);
        if (this.s > 0 && t.textContent.length > this.s)
            t = splitAndWrapText(t, this.s);
        highlightTextNode(t, colorSpec);
    } else if (this.nodeCount >= 2) {
        // last node
        var t = this.nodes[this.nodeCount-1];
        if (t.textContent.length > this.e+1)
            splitAndWrapText(t, this.e+1);
        highlightTextNode(t, colorSpec);
        
        // middle nodes
        var middle = this.nodes.slice(1,this.nodeCount-1);
        for (var i = 0; i < middle.length; i++) {
            highlightTextNode(middle[i], colorSpec);
        }
        
        //first node
        t = this.nodes[0];
        if (this.s > 0 && t.textContent.length > this.s)
            t = splitAndWrapText(t, this.s);
        highlightTextNode(t, colorSpec);
    }
};

// a TextBlock is a list of text nodes that are in the same block/segment
var TextBlock = function(nodes, parseSentences, readability) {
    // if text node, only keep if there is some text
    this.nodes = nodes.filter(function(n){
        var type = n.nodeType;
        return type === Node.ELEMENT_NODE
               || (type === Node.TEXT_NODE && n.textContent.length > 0);
    });
    this.nodeCount = this.nodes.length;
    this.textNodes = this.nodes.filter(function(n){
      return n.nodeType === Node.TEXT_NODE;
    });
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
    this.blank = this.textLength === 0 || /^\s+$/.test(this.text);
    this.sentences = [];
    if (parseSentences)
        this.sentences = getSentences(nodes);
    // is this a text block with content from readability article?
    this.readability = readability;
    
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

TextBlock.prototype.highlight = function(colorSpec) {
    for (var i = 0; i < this.nodes.length; i++) {
        var n = this.nodes[i];
        // we may possibly have non-text nodes, like <br>. Only apply
        // highlighting to text nodes.
        var nodeType = n.nodeType;
        if (nodeType !== Node.TEXT_NODE)
            continue;
        
        highlightTextNode(n, colorSpec);
    }
};

// works on elements and non-elements
var isElementTag = function(node, tag) {
    return node.nodeType === Node.ELEMENT_NODE
           && node.tagName === tag.toUpperCase();
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
    var inMetaTag = elt
                 && elt.nodeType === Node.ELEMENT_NODE
                 && isElementTags(elt, metaTags);
    return inMetaTag;
};

var inputTagsl = ["TEXTAREA", "INPUT"];
var inputTags = new Set(inputTagsl);
//only check one node up
var isUserInput = function(node) {
    var elt = node;
    if (elt.nodeType !== Node.ELEMENT_NODE)
        elt = elt.parentElement;
    var userInput = elt
                 && elt.nodeType === Node.ELEMENT_NODE
                 && isElementTags(elt, inputTags);
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
        // display check probably not necessary since we already filtered
        // text nodes with a display:none parent
        if (display
            && !display.startsWith('inline')
            && (display !== 'none')) {
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
        // we have to have a parent (you saw some cases where there was
        // no parent (MathJax)
        visible = false;
    }
    
    // check that element is on the page with positive height and width
    // TextNodes don't have a getBoundingClientRect method, so create a
    // range
    if (visible) {
        var range = document.createRange();
        range.selectNode(textNode);
        var rect = range.getBoundingClientRect();
        
        // "The amount of scrolling that has been done of the viewport
        // area (or any other scrollable element) is taken into account
        // when computing the bounding rectangle."
        // https://developer.mozilla.org/en-US/docs/Web/API/Element/
        //         getBoundingClientRect
        
        var sx = window.scrollX;
        var sy = window.scrollY;
        
        var top = rect.top + sy;
        var bottom = rect.bottom + sy;
        var left = rect.left + sx;
        var right = rect.right + sx;
        var height = rect.height;
        var width = rect.width;
        
        // don't count stuff that's below the page as being invisible.
        // (top > docHeight)
        // in your experience, such content is not intended to be invisible.
        var offPage = bottom < 0
                      || right < 0
                      || left > docWidth;
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
    
    // TODO Should getBoundingClientRect().[height|width] also be added
    // below? (they underreported in some examples, but that shouldn't
    // matter in the Max)
    var docHeight = Math.max(html.clientHeight,
                             html.scrollHeight,
                             html.offsetHeight,
                             body.scrollHeight,
                             body.offsetHeight);
    var docWidth = Math.max(html.clientWidth,
                            html.scrollWidth,
                            html.offsetWidth,
                            body.scrollWidth,
                            body.offsetWidth);
    
    // parseSentences defaults to true
    if (typeof parseSentences === 'undefined') {
      parseSentences = true;
    }
    var leaves = []; // textnodes and <br>s
    // FILTER_SKIP will continue searching descendants. FILTER_REJECT will
    // not the following walker will traverse all non-empty text nodes and
    // <br>s you're getting leaves by keeping text nodes and <br> nodes.
    // Could possibly alternatively check for nodes with no children, but
    // what you did is fine since you're particularly interested in text
    // nodes and <br>s.
    var walker = document.createTreeWalker(
        document.body,
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
    // text nodes and possibly some <br>s if they are within a text block
    var curTextNodes = [];
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
            var brAfter = i < nlbns.length-1
                       && isElementTagBR(nlbns[i+1]);
            var sameNlbns = i > 0
                         && i < nlbns.length-1
                         && nlbns[i-1] === nlbns[i+1];
            if (!brBefore && !brAfter && sameNlbns) {
                brToAdd = true;
                // THE FOLLOWING LINE IS MODIFYING EXISTING STRUCTURE
                nlbns[i] = nlbns[i-1];
            }
        }
        
        var nlbn = nlbns[i];
        var lastNlbn = nlbns[i-1];
        
        if (nlbn !== lastNlbn && curTextNodes.length > 0) {
            // consider a TextBlock corresponding to readability if its
            // first node was extracted by readability
            var readability = curTextNodes.length > 0
                           && articleNodes.has(curTextNodes[0]);
            
            var tb = new TextBlock(curTextNodes,
                                   parseSentences,
                                   readability);
            if (!tb.blank)
                blocks.push(tb);
            curTextNodes = [];
        }
        
        if (!isElementTagBR(nlbn) || brToAdd) {
            curTextNodes.push(leaf);
        } 
    }
    if (curTextNodes.length > 0) {
        // same test as above (but we already checked curTextNodes.length)
        var readability = articleNodes.has(curTextNodes[0]);
        var tb = new TextBlock(curTextNodes, parseSentences, readability);
        if (!tb.blank)
            blocks.push(tb);
    }
    
    return blocks;
};

// this is probably built-in somewhere, but I'm not sure where
// return a-b would also work (assuming just sign matters, not magnitude)
var numberCompareFn = function(a, b) {
    if (a === b)
        return 0;
    if (a < b)
        return -1;
    else
        return 1;
};

// insertion position in sorted arr, using binary search
var insertPos = function(n, arr, imin, compareFn) {
    imin = typeof imin !== 'undefined' ? imin : 0;
    var imax = arr.length - 1;
    var counter = 0;
    while (imax >= imin) {
        var imid = Math.floor((imax+imin) / 2);
        // shouldn't happen. protection.
        if (imid < 0 || imid >= arr.length)
            return -1;
        var positionCompare = compareFn(arr[imid], n);
        if (positionCompare === 0)
            return imid;
        if (positionCompare < 0) {
            if (imid >= arr.length - 1 || compareFn(arr[imid+1], n) > 0)
                return imid + 1;
            imin = imid + 1;
        } else {
            if (imid <= 0 || compareFn(arr[imid-1], n) < 0)
                return imid;
            imax = imid - 1;
        }
        counter++;
        // the following should never happen, but it's protection against
        // an infinite loop, which would freeze the tab
        if (counter > arr.length)
            return -1;
    }
    // shouldn't happen. protection.
    return -1;
};

// allow sentences across newlines (single <br>, per earlier in the
// pipeline those could be maintained in a TextBlock)?
var CROSS_BR = false;

var getSentences = function(nodes) {
    var sentences = [];
    var subblocks = [];
    
    if (CROSS_BR) {
        subblocks = [nodes.filter(function(n){
          return n.nodeType === Node.TEXT_NODE;})];
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
    
    // ends are the actual ends, not one position after
    // (like substring would use)
    for (var i = 0; i < subblocks.length; i++) {
        var block = subblocks[i];
        
        var nodeTextLens = block.map(function(e){
          return e.textContent.length;});
        
        // no need to worry about 0 length text. Those are filtered out
        // earlier in the pipeline
        var nodeTextEnds = []; // cumulative sum of nodeTextLens
        if (nodeTextLens.length > 0) {
            nodeTextEnds.push(nodeTextLens[0]-1);
            for (var j = 0; j < nodeTextLens.length-1; j++) {
                nodeTextEnds.push(nodeTextEnds[j] + nodeTextLens[j+1]);
            }
        }
        var nodeTextStarts = [];
        if (nodeTextEnds.length > 0) {
            nodeTextStarts = [0].concat(
                nodeTextEnds.slice(
                    0,nodeTextEnds.length-1).map(function(e){
                      return e+1;}));
        }
        
        // TODO: make sentences not start on white space
        // (but the next non-whitespace char)
        
        var text = block.map(function(n){return n.textContent;}).join('');
        
        var segs = NLP.sentenceSegments(text);
        var ends = segs.ends; // sentence end indices
        // flag for whether there was an actual end
        // (block ends may not have sentence ends)
        var hasEnd = segs.hasEnd;
        
        // handling for <pre> until you figure out a better place
        // TODO: this should be handled at a highher level. that is,
        // <pre>'s are composed of their own special types of TextBlocks
        // this doesn't handle syntax highlighted code well. that will
        // need more complex handling.
        var inPre = block.length > 0
                 && descendantOfTag(block[0], 'pre', 5);
        var endsAlready = new Set(ends);
        if (inPre) {
            var re = /[\n\r]{2,}/g;
            var lastNewPos = 0;
            while ((match = re.exec(text)) !== null) {
                var idx = match.index;                
                if (!endsAlready.has(idx)) {
                    var newPos = insertPos(idx,
                                           ends,
                                           lastNewPos,
                                           numberCompareFn);
                    lastNewPos = newPos;
                    if (newPos >= 0) {
                        ends.splice(newPos, 0, idx);
                        hasEnd.splice(newPos, 0, false); 
                    }
                }
            }
        }
        
        var starts = [];
        if (ends.length > 0) {
            starts = [0].concat(
                ends.slice(0,ends.length-1).map(function(e){
                  return e+1;}));
        }
        
        for (var j = 0; j < starts.length; j++) {
            var start = starts[j]; // sentence start
            var end = ends[j]; // sentence ends
            var _hasEnd = hasEnd[j];
            var sentenceNodes = [];
            var maxL = -1;
            for (var k = 0; k < nodeTextStarts.length; k++) {
                // we can skip some k if l went higher below
                k = Math.max(maxL, k);
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
                            var sentenceToAdd = new Sentence(
                                sentenceNodes,
                                withinstart,
                                withinend,
                                _hasEnd);
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

/***********************************
 * Highlighting
 ***********************************/

var isCode = function(textblock) {
    return textblock.nodes.length > 0
        && descendantOfTag(textblock.nodes[0], 'code', 8);
};

var getCandidates = function() {
    var candidates = [];
    var textblocks = getTextBlocks();
    
    // min number of words to be a candidate
    var WORD_COUNT_THRESHOLD = 3;
    var CHAR_COUNT_MIN_THRESHOLD = 15; // min number of characters
    var LINK_DENSITY_THRESHOLD = .75;
    // max number of words to be consdered a candidate
    var CHAR_COUNT_MAX_THRESHOLD = 1000;
    var AVG_WORD_LEN_THRESHOLD = 15;
    
    for (var h = 0; h < textblocks.length; h++) {
        var tb = textblocks[h];
        var sentences = tb.sentences;
        var readability = tb.readability;
        
        for (var i = 0; i < sentences.length; i++) {
            var sentence = sentences[i];
            // we never want to operate on user input
            var userInput = sentence.nodes.length > 0
                         && isUserInput(sentence.nodes[0]);
            if (userInput)
                continue;
            
            // candidates are sentences extracted from readability or other
            // sentences that have a sentence end along with some other
            // constraints.
            var isCandidate = sentence.wordCount > WORD_COUNT_THRESHOLD
                           && sentence.textLength > CHAR_COUNT_MIN_THRESHOLD
                           && sentence.textLength < CHAR_COUNT_MAX_THRESHOLD
                           && sentence.avgWordLength < AVG_WORD_LEN_THRESHOLD
                           && sentence.linkDensity < LINK_DENSITY_THRESHOLD
                           && !isCode(tb)
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
    
    // Only return a unique set of candidates. Don't want to give extra
    // weight to duplicates, and highlight the same content twice.
    // duplicates can be part of boilerplate, or also e.g., extracted
    // sentences that are featured in larger font size. Keep the first
    // occurence.
    var uniques = new Set();
    var _candidates = [];
    for (var i = 0; i < candidates.length; i++) {
        var candidate = candidates[i];
        var text = candidate.text;
        if (!uniques.has(text))
            _candidates.push(candidate);
        uniques.add(text);
    }
    candidates = _candidates;
    
    return candidates;
};

var ScoredCandidate = function(candidate, score, index) {
    this.candidate = candidate;
    this.score = score;
    // index, relative to all original candidates
    // (for sorting since highlighting depends on having candidates being
    // in certain order to work properly)
    this.index = index;
};

// return the candidates to highlight
// cth = candidates to highlight
var cth = function(highlightState) {
    // a candidate may be a TextBlock or a Sentence.
    var candidates = getCandidates();
    var scores = [];
    var _tohighlight = [];
    
    var cstems = candidates.map(function(c){
      return NLP.tokenormalize(c.text);});
    // term sentence frequency
    // (how many times a term appears in a sentence)
    var tsf = new Map();
    
    for (var i = 0; i < cstems.length; i++) {
        var stems = cstems[i];
        var _set = new Set(stems.keys());
        _set.forEach(function(stem) {
            if (tsf.has(stem)) {
                tsf.set(stem, tsf.get(stem) + 1);
            } else {
                tsf.set(stem, 1);
            }
        });            
    }
    
    for (var i = 0; i < candidates.length; i++) {
        var candidate = candidates[i];
        var stems = cstems[i];
        
        var score = 0;
        
        stems.forEach(function(count, stem) {
            var tsfScore = Math.log2(tsf.get(stem)) + 1;
            score += (count * tsfScore);
        });
        
        // reduce score of long sentences
        // (being long will give them more weight above)
        var size = 0;
        for (c of stems.values()) {
            size += c;
        }
        var factor = 1.0 / (Math.log2(size) + 1);
        score *= factor;
        
        scores.push(new ScoredCandidate(candidate, score, i));
    }
    
    // calculating percentile based on ratio, and filtering could be more
    // elegant than sorting... and also wouldn't require sorting by index
    // at the end
    
    scores.sort(function(a, b) {
        return b.score - a.score;
    });
    
    var ratio = .10; // default (highlightState === 1)
    if (highlightState === 2)
        ratio = .20;
    if (highlightState === 3)
        ratio = .40;
    
    if (HIGHLIGHT_ALL)
        ratio = 1; // debugging
    
    var totalChars = 0;
    for (var i = 0; i < scores.length; i++) {
        var scored = scores[i];
        var candidate = scored.candidate;
        totalChars += candidate.textLength;
    }
    
    var limit = ratio * totalChars;
    var highlightCharCounter = 0;
    
    for (var i = 0; i < scores.length; i++) {
        var scored = scores[i];
        _tohighlight.push(scored);
        highlightCharCounter += scored.candidate.textLength;
        if (highlightCharCounter > limit)
            break;
    }
    
    // highlighting breaks if not in pre-order traversal order
    _tohighlight.sort(function(a, b) {
        return a.index - b.index;
    });
    
    // if we're highlighting sentences, make sure we got at least one
    // sentence. Otherwise, we're probably on a navigational page. You
    // were looping over _tohighlight, but changed to looping over
    // everything. since you may only have one _tohighlight candidate,
    // which may not have a period.
    var haveOne = false;
    for (var i = 0; i < scores.length; i++) {
        var scored = scores[i];
        var cand = scored.candidate;
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
    chrome.runtime.sendMessage({'message': "updateHighlightState",
                                'highlight': highlightState,
                                'success': success});
};

var isEmbed = window !== window.parent; // am I in an iframe?

// unlike isEmbed, hasEmbed can change, so make it a function
// even checking for iframe doesn't fix the problem since that can change
// too.
var hasEmbed = function() {
    return window.frames && window.frames.length > 0;
};

// This works even on cross domain iframes. In general, a page wouldn't be
// able to call frames[0].document, if the frame was cross domain, but from
// the extension it works. This even worked from the extension when you
// tried with "all_frames" set to false
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

// callback takes two args: a number indicating highlight state, and
// boolean for success
var getHighlightState = function(callback) {
    var message = {'message': "getHighlightState"};
    chrome.runtime.sendMessage(message, function(response) {
        var curHighlight = response['curHighlight'];
        var curSuccess = response['curSuccess'];
        callback(curHighlight, curSuccess);
    });
};

// useful for debugging sentence boundary detection
var cycleCurColor = 0;
var getNextColor = function() {
    var yellow = "#FFFF00";
    var pale_green = "#98FB98";
    var black = "#000000";
    var red = "#FF0000";
    var highlightColor = cycleCurColor === 0 ? yellow : pale_green;
    var colorSpec = new ColorSpec(highlightColor, black, red);
    cycleCurColor = (cycleCurColor+1) % 2;
    return colorSpec;
};

// hacky way to trim spaces if we're not highlighting the preceding
// sentence destructively modifies its input
var trimSpaces = function(scoredCandsToHighlight) {
    for (var j = scoredCandsToHighlight.length-1; j >= 0; j--) {
        var scoredCand = scoredCandsToHighlight[j];
        // could just check the first element earlier, but this is safer
        // (in case multiple types to highlight)
        if (scoredCand.candidate instanceof Sentence) {
            // we definitely want to trim first sentence
            var toTrim = j === 0;
            if (j >= 1) {
                var curIndex = scoredCand.index;
                var prev = scoredCandsToHighlight[j-1];
                var prevIndex = prev.index;
                
                // we want to trim if the preceding candidate is not going
                // to be highlighted
                toTrim = curIndex > prevIndex+1;
                
                // however, if we're at the start of a text block, even
                // if the preceding candidate will be highlighted, we still
                // want to trim (althugh this may not be necessary as the
                // browser may ignore spaces in the beginning a text block,
                // even if you wrap them in a span).
                if (curIndex === prevIndex+1) {
                    // could store whether sentence starts TextBlock,
                    // but let's just check with nearestLineBreakNode()
                    var candNodes = scoredCand.candidate.nodes;
                    var prevNodes = prev.candidate.nodes;
                    if (candNodes.length > 0
                            && prevNodes.length > 0
                            && (nearestLineBreakNode(candNodes[0])
                                !== nearestLineBreakNode(
                                    prevNodes[prevNodes.length-1]))) {
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

// keep track of last highlight time, so our timers only operate if we
// haven't received new highlight requests
var lastHighlight = (new Date()).getTime();
// you were originally managing highlightState in here. But then when you
// added iframe support, highlightState management was moved to eventPage.js,
// so it now gets passed along as an arg. This prevents different iframes
// from being in different states, in case they were loaded at different
// times (e.g., one before a highlight and one loaded after)
var highlight = function(highlightState) {
    var time = (new Date()).getTime();
    lastHighlight = time;
    // Where the background page is Inactive
    // (when using "persistent": false),
    // there is a slight delay for the following call
    // we're in a new state, but we don't know whether there is success yet
    
    if (highlightState === 0) {
        // no loading icon here
        updateHighlightState(0, true);
        UTILS.setTimeoutIgnore(function() {
            removeHighlight();
        }, 0);
    } else if (highlightState > 0) {
        updateHighlightState(highlightState, null); // loading
        // use a callback so icon updates right away
        var fn = function() {
            removeHighlight();
            var scoredCandsToHighlight = cth(highlightState);
            trimSpaces(scoredCandsToHighlight);
            var colorSpec = new ColorSpec(
                OPTIONS["highlight_color"], OPTIONS["text_color"], OPTIONS["link_color"]);
            // have to loop backwards since splitting text nodes
            for (var j = scoredCandsToHighlight.length-1; j >= 0; j--) {
                var candidate = scoredCandsToHighlight[j].candidate;
                var c = CYCLE_COLORS ? getNextColor() : colorSpec;
                candidate.highlight(c);
            }
            
            // the following is hacky, but to handle the case where we
            // don't have success use a slight delay in telling the
            // eventPage, in case some other iframe has success so that
            // icon doesn't flash from no success to success.
            // also, you probably don't *need* to set this up to avoid
            // closure issues, but just in case...
            var success = scoredCandsToHighlight.length > 0;
            var notify = (function(state, _success) {
                return function() {
                    // if we have no highlighting, success is false.
                    // also let background page know if we do have success
                    // on page (as opposed to null for, I don't know,
                    // which we told it earlier)
                    if (lastHighlight === time)
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
                        if (curHighlight === 0
                            && !curSuccess
                            && lastHighlight === time) {
                            updateHighlightState(0, true);
                        }
                    });
                }, turnoffdelay);
            }
        };
        UTILS.setTimeoutIgnore(function() {
            fn();
        }, 0);
    }
};

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    var method = request.method;
    if (method === 'highlight') {
        // it's possible we're in an iframe with non-compatible content,
        // so check...
        if (compatible) {
            var highlightState = request.highlightState;
            highlight(highlightState);
        }
    } else if (method === "updateOptions") {
        OPTIONS = request.data;
    } else if (method === 'ping') {
        // response is sent below
    }
    sendResponse(true);
});

if (!isEmbed && compatible) {
    // if top frame and html page, tell eventPage our initial status, so
    // it shows the icon
    updateHighlightState(0, true);
    
    // if we're the top frame, continuously check if we (or our child
    // frames) have highlighting it's possible that changing URLs in a
    // child frame caused the highlighting to turn off. If so, let's turn
    // off the icon and update highlight state. This is somewhat hacky,
    // but the alternatives are as well. For example, an alternative would
    // require monitoring all events that can trigger highlighting to
    // disappear (iframe changes, DOM modications, etc.).
    // Alternatively, it would possibly be more elegant to handle this in
    // eventPage, but that would require additional message passing which
    // becomes a mess IMO.
    // Also, somethingHighlighted() is fast
    // (it uses getElementsByClassName: 1.97ms on "a considerably large
    // file with lots of elements to consider" in 2007,
    // http://ejohn.org/blog/getelementsbyclassname-speed-comparison/)
    
    var interval = 1200;
    
    UTILS.safeSetInterval(function() {
        getHighlightState(function(curHighlight, curSuccess) {
            // don't have to worry about a page change in the case where
            // curHighlight > 0 and !curSuccess,
            // since we don't keep that icon active for more than X seconds
            
            var diff = (new Date().getTime()) - lastHighlight;
            
            if (diff >= interval
                && curHighlight > 0
                && curSuccess
                && !somethingHighlighted(window)) {
                updateHighlightState(0, true);
            }
        });
    }, interval);
}

// we may have existing highlighting. clear so we're in sync with icon.
// after injecting content.js, remove highlighting. (will ensure icon
// and page in sync)
// NOTE: you noticed the code executing multiple times on some tabs.
// that's because it executes for each frame
removeHighlight();
