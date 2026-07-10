/* global rangeFromPoint */

class Popup {
    constructor() {
        this.popup = null;
        this.offset = 5;
        this.savedHeight = null;
    }

    // Temporarily grow the popup so all senses are visible while dragging to
    // reorder, but never past the bottom of the screen. Only grows (never shrinks),
    // and keeps the top fixed so the sense under the finger stays put.
    expand(contentHeight) {
        if (this.popup === null) return;
        const rect = this.popup.getBoundingClientRect();
        if (this.savedHeight === null) {
            this.savedHeight = this.popup.style.height || (rect.height + 'px');
        }
        const maxHeight = window.innerHeight - rect.top - 8;
        const target = Math.min(contentHeight + 4, Math.max(maxHeight, 0));
        if (target > rect.height) {
            this.popup.style.height = target + 'px';
        }
    }

    restore() {
        if (this.popup === null || this.savedHeight === null) return;
        this.popup.style.height = this.savedHeight;
        this.savedHeight = null;
    }

    showAt(pos, content) {
        this.inject();

        this.popup.style.left = pos.x + 'px';
        this.popup.style.top = pos.y + 'px';
        this.popup.style.visibility = 'visible';

        this.setContent(content);
    }

    showNextTo(point, content) {

        this.inject();
        const elementRect = this.getRangeRect(point);
        const popupRect = this.popup.getBoundingClientRect();

        const margin = 8; // keep the popup off the screen edges
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pw = popupRect.width || 400;
        const ph = popupRect.height || 300;

        // Horizontal: align with the word, but keep the whole popup on screen.
        var posX = elementRect.left;
        posX = Math.min(posX, vw - pw - margin);
        posX = Math.max(margin, posX);

        // Vertical: below the word; flip above if it would overflow the bottom.
        var posY = elementRect.bottom + this.offset;
        if (posY + ph > vh - margin) {
            posY = elementRect.top - ph - this.offset;
        }
        posY = Math.min(posY, vh - ph - margin);
        posY = Math.max(margin, posY);

        this.showAt({ x: posX, y: posY }, content);
    }

    hide() {
        if (this.popup !== null) {
            this.popup.style.visibility = 'hidden';
        }
    }

    setContent(content) {
        if (this.popup === null) {
            return;
        }

        this.popup.contentWindow.scrollTo(0, 0);

        const doc = this.popup;
        doc.srcdoc = content;
    }

    getRangeRect(point) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
            const selectionRect = selection.getRangeAt(0).getBoundingClientRect();
            if (selectionRect && (selectionRect.width || selectionRect.height)) {
                return selectionRect;
            }
        }

        const range = rangeFromPoint(point);
        if (range) {
            return range.getBoundingClientRect();
        }

        return {
            left: point.x,
            right: point.x,
            top: point.y,
            bottom: point.y
        };
    }

    sendMessage(action, params, callback) {
        if (this.popup !== null) {
            this.popup.contentWindow.postMessage({ action, params }, '*');
        }
    }

    inject() {
        if (this.popup !== null) {
            return;
        }

        this.popup = document.createElement('iframe');
        this.popup.id = 'odh-popup';
        this.popup.addEventListener('mousedown', (e) => e.stopPropagation());
        this.popup.addEventListener('scroll', (e) => e.stopPropagation());

        let simpread = document.querySelector('.simpread-read-root');
        let root = simpread ? simpread : document.body;
        root.appendChild(this.popup);
    }
}
