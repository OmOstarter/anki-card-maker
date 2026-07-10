/* global Popup, rangeFromPoint, TextSourceRange, selectedText, isEmpty, getSentence, isConnected, addNote, getTranslation, getFrontendOptions, playAudio, isValidElement, Readability, isProbablyReaderable*/

// Styling for the built-in reader mode (an in-page declutter that keeps 划詞
// working, since native Firefox reader view is an about:reader page extensions
// can't run in).
const ODH_READER_CSS = `
#odh-reader-root{position:relative;z-index:2147483000;background:#fdfdfd;color:#1a1a1a;min-height:100vh;}
.odh-reader-article{max-width:42em;margin:0 auto;padding:24px 18px 120px;font:19px/1.75 -apple-system,"Noto Sans TC","Segoe UI",Roboto,sans-serif;}
.odh-reader-article h1{font-size:1.6em;line-height:1.25;margin:0 0 .7em;font-weight:700;}
.odh-reader-content p{margin:0 0 1em;}
.odh-reader-content img,.odh-reader-content figure,.odh-reader-content video{max-width:100%;height:auto;margin:1em auto;display:block;}
.odh-reader-content a{color:#0b57d0;text-decoration:none;}
.odh-reader-content h2,.odh-reader-content h3{line-height:1.3;margin:1.2em 0 .5em;}
.odh-reader-content pre,.odh-reader-content code{white-space:pre-wrap;word-break:break-word;}
@media (prefers-color-scheme:dark){#odh-reader-root{background:#16181c;color:#e3e3e3;}.odh-reader-content a{color:#8ab4f8;}}
`;

// For the exported Anki FullDefinition, put the Chinese translation AFTER the
// English definition (separated by a space), matching the APK card order. The
// popup display is unaffected — it renders note.definitions / note.css directly.
function reorderTranForExport(html) {
    if (html.indexOf('chn_tran') < 0 || html.indexOf('eng_tran') < 0) return html;
    let tmp = document.createElement('div');
    tmp.innerHTML = html;
    let chn = tmp.querySelector('.chn_tran');
    let eng = tmp.querySelector('.eng_tran');
    if (chn && eng && (eng.compareDocumentPosition(chn) & Node.DOCUMENT_POSITION_PRECEDING)) {
        eng.insertAdjacentElement('afterend', chn); // move Chinese to right after English
        chn.insertAdjacentText('beforebegin', ' '); // space between the two
    }
    return tmp.innerHTML;
}

class ODHFront {

    constructor() {
        this.options = null;
        this.point = null;
        this.notes = null;
        this.sentence = null;
        this.audio = {};
        this.enabled = false;
        this.mouseselection = true;
        this.activateKey = 16; // shift 16, ctl 17, alt 18
        this.exitKey = 27; // esc 27
        this.maxContext = 1; //max context sentence #
        this.services = 'none';
        this.popup = new Popup();
        this.timeout = null;
        this.mousemoved = false;
        this.touched = false;
        this.requestToken = 0;
        this.readerActive = false;
        this._readerHidden = null;
        this.readerFontPx = 19; // reader base font size (px); A+/A- bubbles adjust it
        this.loadReaderFontPx(); // restore the saved size (persists across pages)

        window.addEventListener('mousemove', e => this.onMouseMove(e));
        window.addEventListener('mousedown', e => this.onMouseDown(e));
        window.addEventListener('dblclick', e => this.onDoubleClick(e));
        window.addEventListener('keydown', e => this.onKeyDown(e));
        // A mouse+keyboard attached to Android may deliver mouse input as pointer
        // events instead of legacy mousemove; track those too so hover+hotkey
        // ("划詞") works there. Gated to mouse so touch is unaffected.
        window.addEventListener('pointermove', e => this.onPointerMove(e));
        // Touch (Firefox for Android): there is no mouse hover, so drive the
        // lookup from text selection instead and anchor the popup at the touch.
        window.addEventListener('touchend', e => this.onTouchEnd(e));

        chrome.runtime.onMessage.addListener(this.onBgMessage.bind(this));
        window.addEventListener('message', e => this.onFrameMessage(e));
        document.addEventListener('selectionchange', e => this.userSelectionChanged(e));
        //window.addEventListener('selectionend', e => this.onSelectionEnd(e));
        // Re-evaluate the reader FAB once the page has fully loaded.
        window.addEventListener('load', () => this.maybeShowReaderFab());

        this.init();
    }

    async init() {
        const options = await getFrontendOptions();
        if (options) {
            this.applyFrontendOptions(options);
        }
        // Late-loading pages (SPAs) may only become readerable after a moment.
        setTimeout(() => this.maybeShowReaderFab(), 1500);
    }

    onKeyDown(e) {
        if (!this.activateKey)
            return;

        if (!isValidElement(e.target))
            return;

        // Cmd (⌘) reports keyCode 91 (left) or 93 (right), or e.key === 'Meta'.
        const activateHit = e.keyCode === this.activateKey
            || e.charCode === this.activateKey
            || (this.activateKey === 91 && (e.keyCode === 93 || e.key === 'Meta'));
        if (this.enabled && this.point !== null && activateHit) {
            const range = rangeFromPoint(this.point);
            if (range == null) return;
            let textSource = new TextSourceRange(range);
            textSource.selectText();
            this.mousemoved = false;
            this.onSelectionEnd(e);
        }

        if (e.keyCode === this.exitKey || e.charCode === this.exitKey)
            this.popup.hide();
    }

    onDoubleClick(e) {
        if (!this.mouseselection)
            return;

        if (!isValidElement(e.target))
            return;

        if (this.timeout)
            clearTimeout(this.timeout);
        this.mousemoved = false;
        this.onSelectionEnd(e);
    }

    onMouseDown(e) {
        this.popup.hide();
    }

    onMouseMove(e) {
        this.mousemoved = true;
        this.point = {
            x: e.clientX,
            y: e.clientY,
        };
    }

    onPointerMove(e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        this.mousemoved = true;
        this.point = { x: e.clientX, y: e.clientY };
    }

    onTouchEnd(e) {
        this.touched = true;
        const touch = (e.changedTouches && e.changedTouches[0]) || null;
        if (touch) {
            this.point = { x: touch.clientX, y: touch.clientY };
        }
    }

    // Bounding rect of the current selection, used to anchor the popup when
    // there is no mouse pointer (touch devices).
    selectionRect() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        return (rect && (rect.width || rect.height)) ? rect : null;
    }

    userSelectionChanged(e) {

        if (!this.enabled || !this.mouseselection || !isValidElement()) return;
        // Desktop requires a prior mouse move; touch devices set `touched`.
        if (!this.mousemoved && !this.touched) return;

        if (this.timeout) {
            clearTimeout(this.timeout);
        }

        // wait 500 ms after the last selection change event
        this.timeout = setTimeout(() => {
            this.onSelectionEnd(e);
            //var selEndEvent = new CustomEvent('selectionend');
            //window.dispatchEvent(selEndEvent);
        }, 500);
    }

    async onSelectionEnd(e) {

        if (!this.enabled)
            return;

        if (!isValidElement(e && e.target ? e.target : null))
            return;

        const requestToken = this.requestToken;

        // reset selection timeout
        this.timeout = null;
        const expression = selectedText();
        if (isEmpty(expression)) return;

        let result = await getTranslation(expression);
        if (!this.enabled || requestToken !== this.requestToken) return;
        if (result == null || result.length == 0) return;
        this.notes = this.buildNote(result);
        const content = await this.renderPopup(this.notes);
        if (!this.enabled || requestToken !== this.requestToken) return;
        // Prefer the mouse/touch point; fall back to the selection rect (touch
        // where no pointer coordinate was captured).
        let anchor = this.point;
        if (anchor === null) {
            const rect = this.selectionRect();
            if (rect) anchor = { x: rect.left, y: rect.bottom };
        }
        if (anchor === null) return;
        this.popup.showNextTo({ x: anchor.x, y: anchor.y, }, content);

    }

    onBgMessage(request, sender, callback) {
        const { action, params } = request;
        const method = this['api_' + action];

        if (typeof(method) === 'function') {
            params.callback = callback;
            method.call(this, params);
        }

        callback();
    }

    api_setFrontendOptions(params) {
        let { options, callback } = params;
        this.applyFrontendOptions(options);
        callback();
    }

    api_toggleReaderMode(params) {
        try {
            if (this.readerActive) this.exitReaderMode();
            else this.enterReaderMode();
        } catch (e) {
            console.error(e);
        }
        if (this.readerActive) this.updateReaderFab();
        else this.maybeShowReaderFab();
        if (params && typeof params.callback === 'function') {
            params.callback({ active: !!this.readerActive });
        }
    }

    // Floating action button: shown only when the page has an extractable
    // article (Readability's isProbablyReaderable), one tap toggles reader mode.
    maybeShowReaderFab() {
        if (this.readerActive) return; // managed by updateReaderFab while reading
        const showFab = !this.options || this.options.readerfab !== false;
        if (!this.enabled || !showFab) { this.removeReaderFab(); return; }
        let readerable = false;
        try {
            readerable = (typeof isProbablyReaderable === 'function') && isProbablyReaderable(document);
        } catch (e) {
            readerable = false;
        }
        if (readerable) this.createReaderFab();
        else this.removeReaderFab();
    }

    createReaderFab() {
        if (!document.body || document.getElementById('odh-reader-fab')) return;
        const fab = document.createElement('div');
        fab.id = 'odh-reader-fab';
        fab.setAttribute('role', 'button');
        fab.setAttribute('aria-label', 'Reader mode');
        fab.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" '
            + 'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'
            + '<path d="M4 5h16"/><path d="M4 10h16"/><path d="M4 15h10"/></svg>';
        fab.style.cssText = 'position:fixed;left:12px;bottom:72px;width:32px;height:32px;border-radius:50%;'
            + 'background:#0d47a1;box-shadow:0 1px 4px rgba(0,0,0,.25);display:flex;align-items:center;'
            + 'justify-content:center;cursor:pointer;z-index:2147483001;opacity:.45;-webkit-tap-highlight-color:transparent;';
        // Taps on the FAB must not reach the page-level selection/lookup handlers.
        for (const type of ['mousedown', 'mouseup', 'touchstart', 'touchend']) {
            fab.addEventListener(type, e => e.stopPropagation());
        }
        fab.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.api_toggleReaderMode({});
        });
        document.body.appendChild(fab);
        this.updateReaderFab();
    }

    removeReaderFab() {
        const fab = document.getElementById('odh-reader-fab');
        if (fab) fab.remove();
    }

    updateReaderFab() {
        const fab = document.getElementById('odh-reader-fab');
        if (!fab) return;
        fab.style.opacity = this.readerActive ? '.9' : '.45';
        fab.style.background = this.readerActive ? '#1565c0' : '#0d47a1';
        fab.setAttribute('aria-pressed', this.readerActive ? 'true' : 'false');
    }

    enterReaderMode() {
        if (this.readerActive || typeof Readability === 'undefined') return;
        let article = null;
        try {
            article = new Readability(document.cloneNode(true)).parse();
        } catch (e) {
            article = null;
        }
        if (!article || !article.content) return; // couldn't extract; leave page as-is

        // Hide (don't wipe) the original body children so exiting restores the
        // page — and skip our own popup/reader nodes.
        this._readerHidden = [];
        for (const el of Array.from(document.body.children)) {
            if (el.id === 'odh-popup' || el.id === 'odh-reader-root' || el.id === 'odh-reader-fab') continue;
            this._readerHidden.push([el, el.style.display]);
            el.style.display = 'none';
        }

        const root = document.createElement('div');
        root.id = 'odh-reader-root';
        const style = document.createElement('style');
        style.textContent = ODH_READER_CSS;
        root.appendChild(style);
        const articleEl = document.createElement('article');
        articleEl.className = 'odh-reader-article';
        const title = document.createElement('h1');
        title.textContent = article.title || document.title || '';
        articleEl.appendChild(title);
        const content = document.createElement('div');
        content.className = 'odh-reader-content';
        content.innerHTML = article.content; // Readability-sanitized HTML
        articleEl.appendChild(content);
        articleEl.style.fontSize = this.readerFontPx + 'px'; // honor A+/A- setting
        root.appendChild(articleEl);
        document.body.appendChild(root);
        window.scrollTo(0, 0);
        this.readerActive = true;
        this.createReaderFontButtons();
    }

    exitReaderMode() {
        const root = document.getElementById('odh-reader-root');
        if (root) root.remove();
        if (this._readerHidden) {
            for (const [el, display] of this._readerHidden) el.style.display = display;
            this._readerHidden = null;
        }
        this.readerActive = false;
        this.removeReaderFontButtons();
    }

    // Two bubbles above the reader FAB that grow/shrink ONLY the reader text
    // (by setting the article's font-size). Unlike Ctrl++ page zoom, this leaves
    // the lookup popup card unaffected. Only present while reading.
    createReaderFontButtons() {
        if (!document.body || document.getElementById('odh-reader-fontinc')) return;
        const make = (id, label, bottom, ariaLabel, onClick) => {
            const b = document.createElement('div');
            b.id = id;
            b.setAttribute('role', 'button');
            b.setAttribute('aria-label', ariaLabel);
            b.textContent = label;
            b.style.cssText = 'position:fixed;left:12px;bottom:' + bottom + 'px;width:32px;height:32px;'
                + 'border-radius:50%;background:#0d47a1;color:#fff;'
                + 'font:bold 15px/1 -apple-system,"Segoe UI",Roboto,sans-serif;'
                + 'box-shadow:0 1px 4px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;'
                + 'cursor:pointer;z-index:2147483001;opacity:.55;-webkit-tap-highlight-color:transparent;user-select:none;';
            // Keep taps off the page-level selection/lookup handlers.
            for (const type of ['mousedown', 'mouseup', 'touchstart', 'touchend']) {
                b.addEventListener(type, e => e.stopPropagation());
            }
            b.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                onClick();
            });
            document.body.appendChild(b);
        };
        // Stacked above the reader FAB (which sits at bottom:72px).
        make('odh-reader-fontinc', 'A+', 150, 'Increase reader font size', () => this.adjustReaderFont(2));
        make('odh-reader-fontdec', 'A−', 111, 'Decrease reader font size', () => this.adjustReaderFont(-2));
    }

    removeReaderFontButtons() {
        for (const id of ['odh-reader-fontinc', 'odh-reader-fontdec']) {
            const el = document.getElementById(id);
            if (el) el.remove();
        }
    }

    adjustReaderFont(delta) {
        this.readerFontPx = Math.max(12, Math.min(40, this.readerFontPx + delta));
        const article = document.querySelector('#odh-reader-root .odh-reader-article');
        if (article) article.style.fontSize = this.readerFontPx + 'px';
        // Persist so the size sticks across pages/sessions.
        try { chrome.storage.local.set({ odhReaderFontPx: this.readerFontPx }); } catch (e) { /* ignore */ }
    }

    loadReaderFontPx() {
        try {
            chrome.storage.local.get('odhReaderFontPx', (r) => {
                if (chrome.runtime.lastError) return;
                const v = r && r.odhReaderFontPx;
                if (typeof v === 'number' && v >= 12 && v <= 40) {
                    this.readerFontPx = v;
                    const article = document.querySelector('#odh-reader-root .odh-reader-article');
                    if (article) article.style.fontSize = this.readerFontPx + 'px';
                }
            });
        } catch (e) { /* storage unavailable; keep default */ }
    }

    applyFrontendOptions(options) {
        this.options = options;
        this.enabled = options.enabled;
        this.mouseselection = options.mouseselection;
        this.activateKey = Number(this.options.hotkey);
        this.maxContext = Number(this.options.maxcontext);
        this.services = options.services;

        ++this.requestToken;
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        if (!this.enabled) {
            this.popup.hide();
            this.notes = null;
        }
        this.maybeShowReaderFab();
    }

    onFrameMessage(e) {
        const { action, params } = e.data;
        const method = this['api_' + action];
        if (typeof(method) === 'function') {
            method.call(this, params);
        }
    }

    async api_addNote(params) {
        let { nindex, dindex, context } = params;

        let note = this.notes[nindex];
        let notedef = Object.assign({}, note);
        // Honor the display order set by drag-to-reorder (falls back to natural order).
        let order = Array.isArray(note.order) ? note.order.slice() : note.definitions.map((_, i) => i);
        // The sense whose "+" was clicked goes to the top of the exported card.
        let clicked = Number(dindex);
        if (Number.isInteger(clicked) && note.definitions[clicked] !== undefined) {
            order = [clicked, ...order.filter(i => i !== clicked)];
        }
        let ordered = order.map(i => note.definitions[i]).filter(x => x !== undefined)
            .map(reorderTranForExport);
        notedef.definitions = note.css + ordered.join('<hr>');
        notedef.sentence = context;
        notedef.url = window.location.href;
        let response = await addNote(notedef);
        this.popup.sendMessage('setActionState', { response, params });
    }

    // Right-click edit of a sense in the popup; replace the stored definition HTML
    // so the Anki export uses the edited POS / Chinese / English / examples.
    api_editDefinition(params) {
        let { nindex, dindex, html } = params;
        let note = this.notes ? this.notes[nindex] : null;
        if (!note || !Array.isArray(note.definitions)) return;
        let i = Number(dindex);
        if (note.definitions[i] === undefined) return;
        note.definitions[i] = html;
    }

    // Grow / restore the popup while dragging to reorder, so all senses show.
    api_expandPopup(params) {
        if (this.popup) this.popup.expand(Number(params.height) || 0);
    }

    api_restorePopup() {
        if (this.popup) this.popup.restore();
    }

    // Long-press-then-drag in the popup reorders senses; `order` is the list of
    // original definition indices in their new display order.
    api_reorderDefinitions(params) {
        let { nindex, order } = params;
        let note = this.notes ? this.notes[nindex] : null;
        if (!note || !Array.isArray(order)) return;
        let cleaned = order.map(Number).filter(i => Number.isInteger(i) && note.definitions[i] !== undefined);
        if (cleaned.length === note.definitions.length) {
            note.order = cleaned;
        }
    }

    async api_playAudio(params) {
        let { nindex, dindex } = params;
        let url = this.notes[nindex].audios[dindex];
        let response = await playAudio(url);
    }

    api_playSound(params) {
        let url = params.sound;

        for (let key in this.audio) {
            this.audio[key].pause();
        }

        const audio = this.audio[url] || new Audio(url);
        audio.currentTime = 0;
        audio.play();

        this.audio[url] = audio;
    }

    buildNote(result) {
        //get 1 sentence around the expression.
        const expression = selectedText();
        const sentence = getSentence(this.maxContext);
        this.sentence = sentence;
        let tmpl = {
            css: '',
            expression,
            reading: '',
            extrainfo: '',
            definitions: '',
            sentence,
            url: '',
            audios: [],
        };

        //if 'result' is array with notes.
        if (Array.isArray(result)) {
            for (const item of result) {
                for (const key in tmpl) {
                    item[key] = item[key] ? item[key] : tmpl[key];
                }
            }
            return result;
        } else { // if 'result' is simple string, then return standard template.
            tmpl['definitions'] = [].concat(result);
            return [tmpl];
        }

    }

    async renderPopup(notes) {
        let content = '';
        let services = this.options ? this.options.services : '';
        let image = '';
        let imageclass = '';
        if (services != 'none') {
            image = (services == 'ankiconnect') ? 'plus.png' : 'cloud.png';
            imageclass = await isConnected() ? 'class="odh-addnote"' : 'class="odh-addnote-disabled"';
        }

        for (const [nindex, note] of notes.entries()) {
            content += note.css + '<div class="odh-note">';
            let audiosegment = '';
            if (note.audios) {
                for (const [dindex, audio] of note.audios.entries()) {
                    if (audio)
                        audiosegment += `<img class="odh-playaudio" data-nindex="${nindex}" data-dindex="${dindex}" src="${chrome.runtime.getURL('fg/img/play.png')}"/>`;
                }
            }
            content += `
                <div class="odh-headsection">
                    <span class="odh-audios">${audiosegment}</span>
                    <span class="odh-expression">${note.expression}</span>
                    <span class="odh-reading">${note.reading}</span>
                    <span class="odh-extra">${note.extrainfo}</span>
                </div>`;
            for (const [dindex, definition] of note.definitions.entries()) {
                let button = (services == 'none' || services == '') ? '' : `<img ${imageclass} data-nindex="${nindex}" data-dindex="${dindex}" src="${chrome.runtime.getURL('fg/img/'+ image)}" />`;
                content += `<div class="odh-definition" data-nindex="${nindex}" data-dindex="${dindex}">${button}${definition}</div>`;
            }
            content += '</div>';
        }
        content += '<div id="odh-container" class="odh-sentence"></div>';
        return this.popupHeader() + content + this.popupFooter();
    }

    popupHeader() {
        let root = chrome.runtime.getURL('/');
        return `
        <html lang="en">
            <head><meta charset="UTF-8"><title></title>
                <link rel="stylesheet" href="${root+'fg/css/frame.css'}">
                <link rel="stylesheet" href="${root+'fg/css/spell.css'}">
            </head>
            <body style="margin:0px;">
            <div class="odh-notes">`;
    }

    popupFooter() {
        let root = chrome.runtime.getURL('/');
        let services = this.options ? this.options.services : '';
        let image = (services == 'ankiconnect') ? 'plus.png' : 'cloud.png';
        let button = chrome.runtime.getURL('fg/img/' + image);
        let monolingual = this.options ? (this.options.monolingual == '1' ? 1 : 0) : 0;

        return `
            </div>
            <div class="icons hidden"">
                <img id="plus" src="${button}"/>
                <img id="load" src="${root+'fg/img/load.gif'}"/>
                <img id="good" src="${root+'fg/img/good.png'}"/>
                <img id="fail" src="${root+'fg/img/fail.png'}"/>
                <img id="play" src="${root+'fg/img/play.png'}"/>
                <div id="context">${this.sentence}</div>
                <div id="monolingual">${monolingual}</div>
                </div>
            <script src="${root+'fg/js/spell.js'}"></script>
            <script src="${root+'fg/js/frame.js'}"></script>
            </body>
        </html>`;
    }
}

window.odhfront = new ODHFront();
