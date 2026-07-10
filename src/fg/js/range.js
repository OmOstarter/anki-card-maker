function rangeFromPoint(point) {
    const nativeRange = getNativeCaretRange(point.x, point.y);
    if (nativeRange) {
        return nativeRange;
    }

    const element = document.elementFromPoint(point.x, point.y);
    if (!element) {
        return null;
    }

    return getRangeFromElementPoint(element, point.x, point.y);
}

function getNativeCaretRange(x, y) {
    if (typeof document.caretRangeFromPoint === 'function') {
        const range = document.caretRangeFromPoint(x, y);
        if (range) {
            return range;
        }
    }

    if (typeof document.caretPositionFromPoint === 'function') {
        const position = document.caretPositionFromPoint(x, y);
        if (position && position.offsetNode) {
            return buildRangeFromNode(position.offsetNode, position.offset);
        }
    }

    return null;
}

function buildRangeFromNode(node, offset) {
    if (node.nodeType === Node.TEXT_NODE) {
        const range = document.createRange();
        const safeOffset = Math.max(0, Math.min(offset, node.textContent.length));
        range.setStart(node, safeOffset);
        range.setEnd(node, safeOffset);
        return range;
    }

    const textNode = firstTextNode(node);
    if (!textNode) {
        return null;
    }

    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 0);
    return range;
}

function firstTextNode(node) {
    if (!node) {
        return null;
    }

    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
        acceptNode(textNode) {
            return textNode.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
    });

    return walker.nextNode();
}

function getRangeFromElementPoint(element, x, y) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode(textNode) {
            return textNode.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
    });

    let textNode = null;
    while ((textNode = walker.nextNode())) {
        const range = getRangeFromTextNodePoint(textNode, x, y);
        if (range) {
            return range;
        }
    }

    return buildRangeFromNode(element, 0);
}

function getRangeFromTextNodePoint(textNode, x, y) {
    const text = textNode.textContent;
    for (let i = 0; i < text.length; ++i) {
        const range = document.createRange();
        range.setStart(textNode, i);
        range.setEnd(textNode, i + 1);

        for (const rect of range.getClientRects()) {
            if (pointInsideRect(x, y, rect)) {
                range.setEnd(textNode, i);
                return range;
            }
        }
    }

    return null;
}

function pointInsideRect(x, y, rect) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

class TextSourceRange {
    constructor(range) {
        this.rng = range;
    }

    text() {
        return this.rng.toString();
    }

    setWordRange() {
        let backwardcount = 1;
        let forwardcount = 1;
        if (this.rng.startContainer.data) {
            this.setStartOffset(backwardcount);
            this.setEndOffset(forwardcount);
        }
        return null;
    }

    isAlpha(char) {
        return /[\u002D|\u0041-\u005A|\u0061-\u007A|\u00A0-\u024F]/.test(char);
    }

    getStartPos(backwardcount) {
        let clone = this.rng.cloneRange();
        let pos = this.rng.startOffset;
        let count = 0;
        let rangeText = '';

        while (pos >= 1) {
            clone.setStart(this.rng.startContainer, --pos);
            rangeText = clone.toString();
            count += this.isAlpha(rangeText.charAt(0)) ? 0 : 1;
            if (count == backwardcount) {
                break;
            }
        }
        return pos;
    }

    getEndPos(forwardcount) {
        let clone = this.rng.cloneRange();
        let pos = this.rng.endOffset;
        let count = 0;
        let rangeText = '';

        while (pos < this.rng.endContainer.data.length) {
            clone.setEnd(this.rng.endContainer, ++pos);
            rangeText = clone.toString();
            count += this.isAlpha(rangeText.charAt(rangeText.length - 1)) ? 0 : 1;
            if (count == forwardcount) {
                break;
            }
        }
        return pos;
    }

    setStartOffset(backwardcount) {
        let startPos = this.getStartPos(backwardcount);
        if (startPos != 0)
            startPos++;
        this.rng.setStart(this.rng.startContainer, startPos);

    }

    setEndOffset(forwardcount) {
        let endPos = this.getEndPos(forwardcount);
        if (endPos != this.rng.endContainer.data.length)
            endPos--;
        this.rng.setEnd(this.rng.endContainer, endPos);
    }

    selectText() {
        this.setWordRange();
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(this.rng);
    }

    deselect() {
        const selection = window.getSelection();
        selection.removeAllRanges();
    }
}
