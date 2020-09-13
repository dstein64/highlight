// TODO: Use consistent variable naming (camel case or underscores, not both)

/***********************************
 * Options and Shared Globals
 ***********************************/

// Debugging Options
const HIGHLIGHT_ALL = false;
const CYCLE_COLORS = false;
// only highlight readability-extracted text.
// this has higher precedence than HIGHLIGHT_ALL, which can still
// be used to highlight all readability-extracted text
const READABILITY_ONLY = false;

let OPTIONS = null;
chrome.runtime.sendMessage({message: 'getOptions'}, function(response) {
    OPTIONS = response;
});

let NUM_HIGHLIGHT_STATES = null;
chrome.runtime.sendMessage({message: 'getParams'}, function(response) {
    NUM_HIGHLIGHT_STATES = response['numHighlightStates'];
});

/***********************************
 * DOM Checking and Querying Functionality
 ***********************************/

const compatibleDocument = function(doc) {
    const contentType = doc.contentType;
    // maybe all text/* ???
    const compatible = doc.doctype !== null
        || contentType.indexOf('text/html') > -1
        || contentType.indexOf('text/plain') > -1;
    return compatible;
};

// Returns the documents that are eligible for highlighting.
const getDocuments = function() {
    const documents = [document];
    for (let i = 0; i < window.frames.length; ++i) {
        try {
            const frame = window.frames[i];
            // Cross-origin frames are blocked by default. Try creating a text node,
            // and appending it to the DOM, to see if the frame is eligible for
            // highlighting.
            if (!compatibleDocument(frame.document))
                continue;
            const node = frame.document.createTextNode('');
            frame.document.body.appendChild(node);
            frame.document.body.removeChild(node);
            documents.push(frame.document);
        } catch(err) {}
    }
    return documents;
};

/***********************************
 * Node Highlighting Functionality
 ***********************************/

// TODO: make sure that class name not being used... (very unlikely)
//       and generate an alternative accordingly
// class prefix uses a UUID you generated, so that class names won't
// (won't with very high probability) clash with class name on some page
const class_prefix = '_highlight_b08d724a-5194-4bdd-9114-21136a9518ce';

// needed two highlight wrappers to prevent background color from
// overlapping on top of text when line height is low idea from:
// http://krasimirtsonev.com/blog/article/
//        CSS-The-background-color-and-overlapping-rows-inline-element
// inner wrapper for highlighting a text node. The inner wrapper applies
// font/text styling, and position:relative
const innerClassName = class_prefix + '_highlightInner';
// outer wrapper for highlighting a text node. The outer wrapper applies
// background-color, and position:static
const outerClassName = class_prefix + '_highlightOuter';

// wrapper class for tracking split text nodes
const splitClassName = class_prefix + '_split';

// generic class name for all text wrappers, which applies some generic
// styling
const wrapperClassName = class_prefix + '_wrapper';

const setPropertyImp = function(element, key, val) {
    // have to use setProperty for setting !important. This doesn't work
    // span.style.backgroundColor = 'yellow !important';
    element.style.setProperty(key, val, 'important');
};

const createTextNodeWrapper = function(doc) {
    const span = doc.createElement('span');
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
const inlink = function(element, depth) {
    depth = typeof depth !== 'undefined' ? depth : 10;
    let cur = element;
    let counter = 0;
    while (cur) {
        if (counter > depth) {
            return false;
        } else if (cur.tagName === 'A' && cur.hasAttribute('href')) {
            // not only does it have to be an anchor tag, but also has
            // to have href
            return cur;
        } else {
            // if you get to the root element, parentNode returns null
            cur = cur.parentNode;
        }
        counter++;
    }
    return false;
};

const descendantOfTag = function(element, tagName, depth) {
    // -1 for infinite. not safe.
    depth = typeof depth !== 'undefined' ? depth : -1;
    tagName = tagName.toUpperCase();
    let cur = element;
    let counter = 0;

    while (cur) {
        if (depth > -1 && counter > depth) {
            return false;
        } else if (cur.tagName === tagName) {
            return cur;
        } else {
            // if you get to the root element, parentNode returns null
            cur = cur.parentNode;
        }
        counter++;
    }
    return false;
};

const wrapNode = function(outer, inner) {
    inner.parentElement.replaceChild(outer, inner);
    outer.appendChild(inner);
};

const ColorSpec = function(highlightColor, textColor, linkColor) {
    this.highlightColor = highlightColor;
    this.textColor = textColor;
    this.linkColor = linkColor;
};

const highlightTextNode = function(textNode, colorSpec) {
    // style.css has generic style already applied. Here, we add specific
    // stuff that may vary

    //color = typeof color !== 'undefined' ? color : bgcolor;
    // some text nodes had no parent. ???. seems to be a problem on pages
    // with MathJax
    if (textNode.parentElement === null)
        return false;

    const _inlink = inlink(textNode, 4);

    // we need an outer wrapper with around the text node, with position
    // static, and wrap it around another wrapper with
    // position relative. This prevents background color of line l+1 from
    // covering line l.
    const _span = createTextNodeWrapper(textNode.ownerDocument);
    _span.classList.add(outerClassName);
    // this is already set by createTextNodeWrapper
    setPropertyImp(_span, 'position', 'static');
    setPropertyImp(_span, 'background-color', colorSpec.highlightColor);
    wrapNode(_span, textNode);

    const span = createTextNodeWrapper(textNode.ownerDocument);
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

const removeHighlight = function(doc) {
    // first remove className, then outerClassName, wrappers
    const wrappers = [innerClassName, outerClassName];
    for (let h = 0; h < wrappers.length; h++) {
        const _class = wrappers[h];
        const highlighted = doc.getElementsByClassName(_class);
        // iterate in reverse. It seems like removing child nodes modifies
        // the variables 'elements'
        // maybe not if we convert from nodelist to array... but still
        // keeping iteration order
        const highlightedA = Array.prototype.slice.call(highlighted);

        for (let i = highlightedA.length-1; i >= 0 ; i--) {
            const e = highlightedA[i];
            // each span has exactly one child
            const child = e.removeChild(e.firstChild);
            e.parentElement.replaceChild(child, e);
        }
    }

    // have to join together text nodes that were split earlier. Otherwise
    // sentences starting with a space then a link will lose the space,
    // and cause problems on the next highlight

    const split = doc.getElementsByClassName(splitClassName);
    let splitA = Array.prototype.slice.call(split);
    for (let i = splitA.length-2; i >= 0 ; i--) {
        const e1 = splitA[i];
        const e2 = splitA[i+1];
        if (e2 === e1.nextElementSibling
            && e1.firstChild
            && e2.firstChild) {
            e1.firstChild.nodeValue += e2.firstChild.nodeValue;
            e2.parentElement.removeChild(e2);
        }
    }

    // split is a live Collection, so don't have to recreate...
    splitA = Array.prototype.slice.call(split);
    for (let i = splitA.length-1; i >= 0 ; i--) {
        const e = splitA[i];
        const child = e.removeChild(e.firstChild);
        e.parentElement.replaceChild(child, e);
    }
};

const removeHighlightAllDocs = function() {
    const documents = getDocuments();
    for (const doc of documents)
        removeHighlight(doc);
};

/***********************************
 * Content Extraction
 ***********************************/

const countWords = function(text) {
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
const Sentence = function(nodes, s, e, hasEnd) {
    this.nodes = nodes;
    this.s = s;
    this.e = e;
    this.hasEnd = hasEnd;
    this.nodeCount = this.nodes.length;

    let text = '';
    if (this.nodeCount === 1) {
        text = this.nodes[0].textContent.substring(this.s, this.e+1);
    } else if (this.nodeCount >= 2) {
        const middle = this.nodes.slice(1,this.nodeCount-1);
        text = this.nodes[0].textContent.substring(this.s)
             + middle.map(function(t){return t.textContent;}).join('')
             + this.nodes[this.nodeCount-1].textContent.substring(0, this.e+1);
    }
    this.text = text.trim();

    this.textLength = this.text.length;
    this.wordCount = countWords(this.text);

    this.avgWordLength = this.textLength / this.wordCount;

    let linkDensityNum = 0;
    const linkDensityDen = this.textLength;

    for (let i = 0; i < this.nodes.length; i++) {
        const node = this.nodes[i];
        const _inlink = inlink(node, 8);
        if (_inlink) {
            let chars = node.textContent.length;
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
        const node = this.nodes[0];
        const text = node.textContent;
        // let's just loop up to the second to last letter, to make sure
        // we leave at least one char
        let end = text.length - 2;
        if (this.nodeCount === 1) {
            end = this.e - 1;  // same in this case. second to last char.
        }
        for (let i = this.s; i <= end; i++) {
            const c = text.charAt(i);
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
const splitAndWrapText = function(textNode, offset) {
    const _t = textNode.splitText(offset);
    // we may have a textNode that has already been split
    alreadySplit = textNode.parentElement.classList.contains(splitClassName);

    if (alreadySplit) {
        const span = createTextNodeWrapper(textNode.ownerDocument);
        span.classList.add(splitClassName);
        wrapNode(span, textNode);

        const parent = span.parentElement;
        const _span = parent.removeChild(span);
        parent.parentElement.insertBefore(_span, parent);
    } else {
        let span = createTextNodeWrapper(textNode.ownerDocument);
        span.classList.add(splitClassName);
        wrapNode(span, textNode);

        // and again
        span = createTextNodeWrapper(textNode.ownerDocument);
        span.classList.add(splitClassName);
        wrapNode(span, _t);
    }

    return _t;
};

Sentence.prototype.highlight = function(colorSpec) {
    if (this.nodeCount === 1) {
        let t = this.nodes[0];
        if (t.textContent.length > this.e+1)
            splitAndWrapText(t, this.e+1);
        if (this.s > 0 && t.textContent.length > this.s)
            t = splitAndWrapText(t, this.s);
        highlightTextNode(t, colorSpec);
    } else if (this.nodeCount >= 2) {
        // last node
        let t = this.nodes[this.nodeCount-1];
        if (t.textContent.length > this.e+1)
            splitAndWrapText(t, this.e+1);
        highlightTextNode(t, colorSpec);

        // middle nodes
        const middle = this.nodes.slice(1,this.nodeCount-1);
        for (let i = 0; i < middle.length; i++) {
            highlightTextNode(middle[i], colorSpec);
        }

        // first node
        t = this.nodes[0];
        if (this.s > 0 && t.textContent.length > this.s)
            t = splitAndWrapText(t, this.s);
        highlightTextNode(t, colorSpec);
    }
};

// a TextBlock is a list of text nodes that are in the same block/segment
const TextBlock = function(nodes, parseSentences, readability) {
    // if text node, only keep if there is some text
    this.nodes = nodes.filter(function(n) {
        const type = n.nodeType;
        return type === Node.ELEMENT_NODE
               || (type === Node.TEXT_NODE && n.textContent.length > 0);
    });
    this.nodeCount = this.nodes.length;
    this.textNodes = this.nodes.filter(function(n){
        return n.nodeType === Node.TEXT_NODE;
    });
    this.text = this.nodes.map(function(n) {
        const nodeType = n.nodeType;
        if (nodeType === Node.TEXT_NODE)
            return n.textContent.replace(/\s+/g, ' ');
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

    let linkDensityNum = 0;
    const linkDensityDen = this.textLength;

    for (let i = 0; i < this.nodes.length; i++) {
        const node = this.nodes[i];
        const _inlink = inlink(node, 8);
        if (_inlink) {
            const chars = node.textContent.length;
            linkDensityNum += chars;
        }
    }

    this.linkDensity = linkDensityNum / linkDensityDen;
};

TextBlock.prototype.toString = function() {
    return this.text;
};

TextBlock.prototype.highlight = function(colorSpec) {
    for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        // we may possibly have non-text nodes, like <br>. Only apply
        // highlighting to text nodes.
        const nodeType = n.nodeType;
        if (nodeType !== Node.TEXT_NODE)
            continue;

        highlightTextNode(n, colorSpec);
    }
};

// works on elements and non-elements
const isElementTag = function(node, tag) {
    return node.nodeType === Node.ELEMENT_NODE
           && node.tagName === tag.toUpperCase();
};

const isElementTagBR = function(node) {
    return isElementTag(node, 'BR');
};

const metaTagsl = ['HEAD', 'TITLE', 'BASE', 'LINK', 'META', 'SCRIPT', 'STYLE'];
const metaTags = new Set(metaTagsl);

// tags is a Set
const isElementTags = function(node, tags) {
    return node.nodeType === Node.ELEMENT_NODE && tags.has(node.tagName);
};

// includes all element types containing meta info, not just <meta>
// only check one node up
const isInMetaTag = function(node) {
    let elt = node;
    if (elt.nodeType !== Node.ELEMENT_NODE)
        elt = elt.parentElement;
    const inMetaTag = elt
        && elt.nodeType === Node.ELEMENT_NODE
        && isElementTags(elt, metaTags);
    return inMetaTag;
};

const inputTagsl = ['TEXTAREA', 'INPUT'];
const inputTags = new Set(inputTagsl);
//only check one node up
const isUserInput = function(node) {
    let elt = node;
    if (elt.nodeType !== Node.ELEMENT_NODE)
        elt = elt.parentElement;
    const userInput = elt
        && elt.nodeType === Node.ELEMENT_NODE
        && isElementTags(elt, inputTags);
    return userInput;
};

const nearestLineBreakNode = function(node) {
    let cur = node;
    // <br> has style inline, so handle as a special case
    while (cur) {
        const isElement = cur.nodeType === Node.ELEMENT_NODE;
        let display = null;
        if (isElement) {
            const computedStyle = window.getComputedStyle(cur);
            if (computedStyle)
                display = computedStyle.display;
        }
        let isLineBreakNode = false;
        // display check probably not necessary since we already filtered
        // text nodes with a display:none parent
        if (display
            && !display.startsWith('inline')
            && (display !== 'none')) {
            isLineBreakNode = true;
        }
        if (isElementTagBR(cur))
            isLineBreakNode = true;
        if (isLineBreakNode) {
            return cur;
        } else {
            // if you get to the root element, parentElement returns null
            cur = cur.parentElement;
        }
    }
    return node.ownerDocument.body;
};

// whether single <br> should be considered as not separating a block
const ALLOW_SINGLE_BR_WITHIN_BLOCK = true;

const isVisible = function(textNode, docWidth, docHeight) {
    let visible = true;
    if (textNode.parentElement !== null) {
        const parent = textNode.parentElement;
        const style = window.getComputedStyle(parent);
        if (style) {
            const nonVisibleStyle = style.color === 'rgba(0, 0, 0, 0)'
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
        const range = textNode.ownerDocument.createRange();
        range.selectNode(textNode);
        const rect = range.getBoundingClientRect();

        // 'The amount of scrolling that has been done of the viewport
        // area (or any other scrollable element) is taken into account
        // when computing the bounding rectangle.'
        // https://developer.mozilla.org/en-US/docs/Web/API/Element/
        //         getBoundingClientRect

        const sx = window.scrollX;
        const sy = window.scrollY;

        const top = rect.top + sy;
        const bottom = rect.bottom + sy;
        const left = rect.left + sx;
        const right = rect.right + sx;
        const height = rect.height;
        const width = rect.width;

        // don't count stuff that's below the page as being invisible.
        // (top > docHeight)
        // in your experience, such content is not intended to be invisible.
        const offPage = bottom < 0
            || right < 0
            || left > docWidth;
        const zeroDim = width <= 0 || height <= 0;
        if (offPage || zeroDim)
            visible = false;
    }

    return visible;
};

const getTextBlocks = function(doc, parseSentences=true) {
    const html = doc.documentElement;
    const body = doc.body;

    const docHeight = Math.max(html.clientHeight,
        html.scrollHeight,
        html.offsetHeight,
        body.scrollHeight,
        body.offsetHeight);
    const docWidth = Math.max(html.clientWidth,
        html.scrollWidth,
        html.offsetWidth,
        body.scrollWidth,
        body.offsetWidth);

    const leaves = []; // textnodes and <br>s
    // FILTER_SKIP will continue searching descendants. FILTER_REJECT will
    // not the following walker will traverse all non-empty text nodes and
    // <br>s you're getting leaves by keeping text nodes and <br> nodes.
    // Could possibly alternatively check for nodes with no children, but
    // what you did is fine since you're particularly interested in text
    // nodes and <br>s.
    const walker = doc.createTreeWalker(
        doc.body,
        NodeFilter.SHOW_ALL,
        function(node) {
            let filter = NodeFilter.FILTER_SKIP;
            const type = node.nodeType;
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
        const leaf = walker.currentNode;
        leaves.push(leaf);
    }

    const nlbns = [];  // nearest line break nodes
    for (let i = 0; i < leaves.length; i++) {
        const leaf = leaves[i];
        const nlbn = nearestLineBreakNode(leaf);
        nlbns.push(nlbn);
    }

    const blocks = [];  // A list of TextBlocks
    // text nodes and possibly some <br>s if they are within a text block
    let curTextNodes = [];
    if (nlbns.length > 0 && !isElementTagBR(nlbns[0]))
        curTextNodes.push(leaves[0]);

    // skip level goes from 0 to 3. Higher skip level returns more content.
    const readable = new Readability(doc, null, 3);

    const articleNodesl = readable.getArticle(false).getNodes();
    const articleNodes = new Set(articleNodesl);

    for (let i = 1; i < leaves.length; i++) {
        const leaf = leaves[i];

        // if we only have a single <br>, add it
        let brToAdd = false;
        if (ALLOW_SINGLE_BR_WITHIN_BLOCK && isElementTagBR(leaf)) {
            const brBefore = i > 0 && isElementTagBR(nlbns[i-1]);
            const brAfter = i < nlbns.length - 1
                && isElementTagBR(nlbns[i+1]);
            const sameNlbns = i > 0
                && i < nlbns.length - 1
                && nlbns[i-1] === nlbns[i+1];
            if (!brBefore && !brAfter && sameNlbns) {
                brToAdd = true;
                // THE FOLLOWING LINE IS MODIFYING EXISTING STRUCTURE
                nlbns[i] = nlbns[i-1];
            }
        }

        const nlbn = nlbns[i];
        const lastNlbn = nlbns[i-1];

        if (nlbn !== lastNlbn && curTextNodes.length > 0) {
            // consider a TextBlock corresponding to readability if its
            // first node was extracted by readability
            const readability = curTextNodes.length > 0
                           && articleNodes.has(curTextNodes[0]);

            const tb = new TextBlock(curTextNodes,
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
        const readability = articleNodes.has(curTextNodes[0]);
        const tb = new TextBlock(curTextNodes, parseSentences, readability);
        if (!tb.blank)
            blocks.push(tb);
    }

    return blocks;
};

// this is probably built-in somewhere, but I'm not sure where
// return a-b would also work (assuming just sign matters, not magnitude)
const numberCompareFn = function(a, b) {
    if (a === b)
        return 0;
    if (a < b)
        return -1;
    else
        return 1;
};

// insertion position in sorted arr, using binary search
const insertPos = function(n, arr, imin, compareFn) {
    imin = typeof imin !== 'undefined' ? imin : 0;
    let imax = arr.length - 1;
    let counter = 0;
    while (imax >= imin) {
        const imid = Math.floor((imax+imin) / 2);
        // shouldn't happen. protection.
        if (imid < 0 || imid >= arr.length)
            return -1;
        const positionCompare = compareFn(arr[imid], n);
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
const CROSS_BR = false;

const getSentences = function(nodes) {
    const sentences = [];
    let subblocks = [];

    if (CROSS_BR) {
        subblocks = [nodes.filter(function(n) {
            return n.nodeType === Node.TEXT_NODE;})];
    } else {
        let curblock = [];
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const nodeType = n.nodeType;
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
    for (let i = 0; i < subblocks.length; i++) {
        const block = subblocks[i];

        const nodeTextLens = block.map(function(e) {
            return e.textContent.length;
        });

        // no need to worry about 0 length text. Those are filtered out
        // earlier in the pipeline
        const nodeTextEnds = []; // cumulative sum of nodeTextLens
        if (nodeTextLens.length > 0) {
            nodeTextEnds.push(nodeTextLens[0]-1);
            for (let j = 0; j < nodeTextLens.length-1; j++) {
                nodeTextEnds.push(nodeTextEnds[j] + nodeTextLens[j+1]);
            }
        }
        let nodeTextStarts = [];
        if (nodeTextEnds.length > 0) {
            nodeTextStarts = [0].concat(
                nodeTextEnds.slice(
                    0,nodeTextEnds.length-1).map(function(e){
                      return e+1;}));
        }

        // TODO: make sentences not start on white space
        // (but the next non-whitespace char)

        const text = block.map(function(n){return n.textContent;}).join('');

        const segs = NLP.sentenceSegments(text);
        const ends = segs.ends; // sentence end indices
        // flag for whether there was an actual end
        // (block ends may not have sentence ends)
        const hasEnd = segs.hasEnd;

        // WARN: handling for <pre> until you figure out a better place
        // <pre>'s are composed of their own special types of TextBlocks
        // this doesn't handle syntax highlighted code well. that will
        // need more complex handling.
        const inPre = block.length > 0
            && descendantOfTag(block[0], 'pre', 5);
        const endsAlready = new Set(ends);
        if (inPre) {
            const re = /[\n\r]{2,}/g;
            let lastNewPos = 0;
            while ((match = re.exec(text)) !== null) {
                const idx = match.index;
                if (endsAlready.has(idx)) continue;
                const newPos = insertPos(idx,
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

        let starts = [];
        if (ends.length > 0) {
            starts = [0].concat(
                ends.slice(0, ends.length - 1).map(function(e) {
                    return e + 1;
                }));
        }

        for (let j = 0; j < starts.length; j++) {
            const start = starts[j]; // sentence start
            const end = ends[j]; // sentence ends
            const _hasEnd = hasEnd[j];
            const sentenceNodes = [];
            let maxL = -1;
            for (let k = 0; k < nodeTextStarts.length; k++) {
                // we can skip some k if l went higher below
                k = Math.max(maxL, k);
                const nodeTextStartL = nodeTextStarts[k];
                const nodeTextEndL = nodeTextEnds[k];
                if (start > nodeTextEndL) continue;
                const withinstart = start - nodeTextStartL;
                sentenceNodes.push(block[k]);
                for (let l = k; l < nodeTextStarts.length; l++) {
                    maxL = Math.max(maxL, l);
                    const nodeTextStartR = nodeTextStarts[l];
                    const nodeTextEndR = nodeTextEnds[l];
                    if (end > nodeTextEndR) {
                        if (l > k)
                            sentenceNodes.push(block[l]);
                    } else {
                        const withinend = end - nodeTextStartR;
                        if (l !== k)
                            sentenceNodes.push(block[l]);
                        const sentenceToAdd = new Sentence(
                            sentenceNodes,
                            withinstart,
                            withinend,
                            _hasEnd);
                        sentences.push(sentenceToAdd);
                        break;
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

const isCode = function(textblock) {
    return textblock.nodes.length > 0
        && descendantOfTag(textblock.nodes[0], 'code', 8);
};

const getCandidates = function() {
    let candidates = [];
    const textblocks = [];
    for (const doc of getDocuments()) {
        textblocks.push(...getTextBlocks(doc))
    }

    // min number of words to be a candidate
    const WORD_COUNT_THRESHOLD = 3;
    const CHAR_COUNT_MIN_THRESHOLD = 15; // min number of characters
    const LINK_DENSITY_THRESHOLD = .75;
    // max number of words to be consdered a candidate
    const CHAR_COUNT_MAX_THRESHOLD = 1000;
    const AVG_WORD_LEN_THRESHOLD = 15;

    for (let h = 0; h < textblocks.length; h++) {
        const tb = textblocks[h];
        const sentences = tb.sentences;
        const readability = tb.readability;

        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i];
            // we never want to operate on user input
            const userInput = sentence.nodes.length > 0
                && isUserInput(sentence.nodes[0]);
            if (userInput)
                continue;

            // candidates are sentences extracted from readability or other
            // sentences that have a sentence end along with some other
            // constraints.
            let isCandidate = sentence.wordCount > WORD_COUNT_THRESHOLD
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
    const uniques = new Set();
    const _candidates = [];
    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        const text = candidate.text;
        if (!uniques.has(text))
            _candidates.push(candidate);
        uniques.add(text);
    }
    candidates = _candidates;

    return candidates;
};

const ScoredCandidate = function(candidate, score, index, importance) {
    this.candidate = candidate;
    this.score = score;
    // index, relative to all original candidates
    // (for sorting since highlighting depends on having candidates being
    // in certain order to work properly)
    this.index = index;
    // This gets set to a value between 1 and (NUM_HIGHLIGHT_STATES - 1), representing
    // the importance of the sentence. (lower numbers have higher importance)
    this.importance = importance;
};

// return the candidates to highlight
// cth = candidates to highlight
const cth = function(highlightState) {
    // a candidate may be a TextBlock or a Sentence.
    const candidates = getCandidates();
    const scores = [];
    let _tohighlight = [];

    const cstems = candidates.map(function(c){
        return NLP.tokenormalize(c.text);});
    // term sentence frequency
    // (how many times a term appears in a sentence)
    const tsf = new Map();

    for (let i = 0; i < cstems.length; i++) {
        const stems = cstems[i];
        const _set = new Set(stems.keys());
        _set.forEach(function(stem) {
            if (tsf.has(stem)) {
                tsf.set(stem, tsf.get(stem) + 1);
            } else {
                tsf.set(stem, 1);
            }
        });
    }

    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        const stems = cstems[i];

        let score = 0;

        stems.forEach(function(count, stem) {
            const tsfScore = Math.log2(tsf.get(stem)) + 1;
            score += (count * tsfScore);
        });

        // reduce score of long sentences
        // (being long will give them more weight above)
        let size = 0;
        for (c of stems.values()) {
            size += c;
        }
        const factor = 1.0 / (Math.log2(size) + 1);
        score *= factor;

        scores.push(new ScoredCandidate(candidate, score, i, null));
    }

    // calculating percentile based on ratio, and filtering could be more
    // elegant than sorting... and also wouldn't require sorting by index
    // at the end

    scores.sort(function(a, b) {
        return b.score - a.score;
    });

    // Maps number of highlight states to a map of highlight states to coverage ratios
    const ratio_lookup = {
        2: {1: 0.25},
        3: {1: 0.15, 2: 0.30},
        4: {1: 0.10, 2: 0.20, 3: 0.40}
    };
    ratio = ratio_lookup[NUM_HIGHLIGHT_STATES][highlightState];

    if (HIGHLIGHT_ALL)
        ratio = 1; // debugging

    let totalChars = 0;
    for (let i = 0; i < scores.length; i++) {
        const scored = scores[i];
        const candidate = scored.candidate;
        totalChars += candidate.textLength;
    }

    let highlightCharCounter = 0;

    for (let i = 0; i < scores.length; i++) {
        const scored = scores[i];
        if (HIGHLIGHT_ALL) {
            scored.importance = 1;
        } else {
            for (let j = 1; j < NUM_HIGHLIGHT_STATES; ++j) {
                if (highlightCharCounter <= ratio_lookup[NUM_HIGHLIGHT_STATES][j] * totalChars) {
                    scored.importance = j;
                    break;
                }
            }
        }
        _tohighlight.push(scored);
        highlightCharCounter += scored.candidate.textLength;
        if (!HIGHLIGHT_ALL && highlightCharCounter > ratio * totalChars)
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
    let haveOne = false;
    for (let i = 0; i < scores.length; i++) {
        const scored = scores[i];
        const cand = scored.candidate;
        if (cand instanceof Sentence && cand.hasEnd) {
            haveOne = true;
            break;
        }
    }

    if (!haveOne)
        _tohighlight = [];

    return _tohighlight;
};

const updateHighlightState = function(highlightState, success) {
    chrome.runtime.sendMessage(
        {
            'message': 'updateHighlightState',
            'highlight': highlightState,
            'success': success
        });
};

// callback takes two args: a number indicating highlight state, and
// boolean for success
const getHighlightState = function(callback) {
    const message = {'message': 'getHighlightState'};
    chrome.runtime.sendMessage(message, function(response) {
        const curHighlight = response['curHighlight'];
        const curSuccess = response['curSuccess'];
        callback(curHighlight, curSuccess);
    });
};

// useful for debugging sentence boundary detection
let cycleCurColor = 0;
const getNextColor = function() {
    const yellow = '#FFFF00';
    const pale_green = '#98FB98';
    const black = '#000000';
    const red = '#FF0000';
    const highlightColor = cycleCurColor === 0 ? yellow : pale_green;
    const colorSpec = new ColorSpec(highlightColor, black, red);
    cycleCurColor = (cycleCurColor+1) % 2;
    return colorSpec;
};

// hacky way to trim spaces if we're not highlighting the preceding
// sentence destructively modifies its input
const trimSpaces = function(scoredCandsToHighlight) {
    for (let j = scoredCandsToHighlight.length-1; j >= 0; j--) {
        const scoredCand = scoredCandsToHighlight[j];
        // could just check the first element earlier, but this is safer
        // (in case multiple types to highlight)
        if (!(scoredCand.candidate instanceof Sentence)) continue;
        // we definitely want to trim first sentence
        let toTrim = j === 0;
        if (j >= 1) {
            const curIndex = scoredCand.index;
            const prev = scoredCandsToHighlight[j-1];
            const prevIndex = prev.index;

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
                const candNodes = scoredCand.candidate.nodes;
                const prevNodes = prev.candidate.nodes;
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
};

// Tint colors by blending them with white.
// Color is a hex string starting with '#'.
// Level is between 0.0 and 1.0, where 0.0 corresponds to no tinting and
// 1.0 corresponds to full tinting.
const tintColor = function(color, level) {
    const r_white = 255;
    const g_white = 255;
    const b_white = 255;
    const r_in = parseInt(color.substring(1, 3), 16);
    const g_in = parseInt(color.substring(3, 5), 16);
    const b_in = parseInt(color.substring(5, 7), 16);
    const r_out = Math.round(level * r_white + (1 - level) * r_in);
    const g_out = Math.round(level * g_white + (1 - level) * g_in);
    const b_out = Math.round(level * b_white + (1 - level) * b_in);
    const out = '#' + r_out.toString(16).padStart(2, '0')
        + g_out.toString(16).padStart(2, '0')
        + b_out.toString(16).padStart(2, '0');
    return out;
};

// keep track of last highlight time, so our timers only operate if we
// haven't received new highlight requests
let lastHighlight = (new Date()).getTime();
// you were originally managing highlightState in here. But then when you
// added iframe support, highlightState management was moved to eventPage.js,
// so it now gets passed along as an arg. This prevents different iframes
// from being in different states, in case they were loaded at different
// times (e.g., one before a highlight and one loaded after)
// XXX Update 2020/9/13: You're no longer injecting the script into iframes,
// so the changed approach mentioned above can possibly be reverted.
const highlight = function(highlightState) {
    const time = (new Date()).getTime();
    lastHighlight = time;
    // Where the background page is Inactive
    // (when using 'persistent': false),
    // there is a slight delay for the following call
    // we're in a new state, but we don't know whether there is success yet
    updateHighlightState(highlightState, null);  // loading
    // use a callback so icon updates right away
    const fn = function() {
        removeHighlightAllDocs();
        const scoredCandsToHighlight = highlightState > 0 ? cth(highlightState) : [];
        trimSpaces(scoredCandsToHighlight);
        // have to loop backwards since splitting text nodes
        for (let j = scoredCandsToHighlight.length-1; j >= 0; j--) {
            let highlightColor = OPTIONS['highlight_color'];
            if (OPTIONS['tinted_highlights']) {
                const importance = scoredCandsToHighlight[j].importance;
                // XXX: Ad-hoc formula can be improved.
                highlightColor = tintColor(highlightColor, 1.0 - Math.pow(1 / importance, 1.6));
            }
            const colorSpec = new ColorSpec(
                highlightColor, OPTIONS['text_color'], OPTIONS['link_color']);
            const candidate = scoredCandsToHighlight[j].candidate;
            const c = CYCLE_COLORS ? getNextColor() : colorSpec;
            candidate.highlight(c);
        }

        const success = highlightState === 0 || scoredCandsToHighlight.length > 0;
        // Before updating highlight state, wait until at least 0.5 seconds has elapsed
        // since this function started. This prevents jumpiness of the loading icon.
        const delay = Math.max(0, 500 - ((new Date()).getTime() - time));
        UTILS.setTimeoutIgnore(function() {
            if (lastHighlight === time) {
                updateHighlightState(highlightState, success);
                // if we don't have success, turn off icon in 2 seconds
                if (!success) {
                    const turnoffdelay = 2000;
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
            }
        }, delay);
    };
    UTILS.setTimeoutIgnore(function() {
        fn();
    }, 0);
};

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    const method = request.method;
    if (method === 'highlight') {
        // it's possible we're in an iframe with non-compatible content,
        // so check...
        if (compatibleDocument(document)) {
            const highlightState = request.highlightState;
            const delay = request.delay;
            if (delay === null || delay === undefined) {
                highlight(highlightState);
            } else {
                UTILS.setTimeoutIgnore(function() {
                    highlight(highlightState);
                }, delay);
            }
        }
    } else if (method === 'updateOptions') {
        OPTIONS = request.data;
    } else if (method === 'ping') {
        // response is sent below
    }
    sendResponse(true);
});

if (compatibleDocument(document)) {
    // tell eventPage our initial status, so it shows the icon
    updateHighlightState(0, true);

    // we may have existing highlighting. clear so we're in sync with icon.
    // after injecting content.js, remove highlighting. (will ensure icon
    // and page in sync)
    removeHighlightAllDocs();
}
