// State for long-press-then-drag reordering of senses inside a note.
const reorder = {
    el: null,        // the .odh-definition being pressed/dragged
    note: null,      // its parent .odh-note
    timer: null,     // long-press timer
    active: false,   // drag has started
    moved: false,    // dragged to a new position
    startX: 0,
    startY: 0,
    suppressClick: false, // swallow the click that follows a drag
};

function getImageSource(id) {
    return document.querySelector(`#${id}`).src;
}

function registerAddNoteLinks() {
    for (let link of document.getElementsByClassName('odh-addnote')) {
        link.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const ds = e.currentTarget.dataset;
            e.currentTarget.src = getImageSource('load');
            window.parent.postMessage({
                action: 'addNote',
                params: {
                    nindex: ds.nindex,
                    dindex: ds.dindex,
                    context: document.querySelector('.spell-content').innerHTML
                }
            }, '*');
        });
    }
}

function registerAudioLinks() {
    for (let link of document.getElementsByClassName('odh-playaudio')) {
        link.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const ds = e.currentTarget.dataset;
            window.parent.postMessage({
                action: 'playAudio',
                params: {
                    nindex: ds.nindex,
                    dindex: ds.dindex
                }
            }, '*');
        });
    }
}

function registerSoundLinks() {
    for (let link of document.getElementsByClassName('odh-playsound')) {
        link.setAttribute('src', getImageSource('play'));
        link.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const ds = e.currentTarget.dataset;
            window.parent.postMessage({
                action: 'playSound',
                params: {
                    sound: ds.sound,
                }
            }, '*');
        });
    }
}

function initSpellnTranslation(){
    document.querySelector('#odh-container').appendChild(spell());
    document.querySelector('.spell-content').innerHTML=document.querySelector('#context').innerHTML;
    if (document.querySelector('#monolingual').innerText == '1')
        hideTranslation();
}

function registerHiddenClass() {
    for (let div of document.getElementsByClassName('odh-definition')) {
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            // A drag just finished on this definition: swallow this click so it
            // does not also toggle the translation.
            if (reorder.suppressClick) {
                reorder.suppressClick = false;
                return;
            }
            hideTranslation();
        });
    }
}

// Long-press a sense, then drag to reorder senses within the same note.
function registerReorder() {
    for (let div of document.getElementsByClassName('odh-definition')) {
        div.addEventListener('mousedown', onReorderDown);
    }
    document.addEventListener('mousemove', onReorderMove);
    document.addEventListener('mouseup', onReorderUp);
}

function onReorderDown(e) {
    if (e.button !== 0) return; // left button only
    reorder.suppressClick = false; // clear any stale flag from a prior drag
    reorder.el = e.currentTarget;
    reorder.note = reorder.el.closest('.odh-note');
    reorder.active = false;
    reorder.moved = false;
    reorder.startX = e.clientX;
    reorder.startY = e.clientY;
    clearTimeout(reorder.timer);
    reorder.timer = setTimeout(startReorder, 350);
}

function startReorder() {
    if (!reorder.el || !reorder.note) return;
    if (reorder.note.querySelectorAll('.odh-definition').length < 2) return; // nothing to reorder
    reorder.active = true;
    reorder.el.classList.add('odh-dragging');
    document.body.classList.add('odh-reordering');
    // Ask the parent to grow the popup so every sense is visible (capped to screen).
    const height = Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    window.parent.postMessage({ action: 'expandPopup', params: { height } }, '*');
}

function onReorderMove(e) {
    if (!reorder.el) return;
    if (!reorder.active) {
        // Moving before the long-press fires means it is a scroll/drag, not a hold.
        if (Math.abs(e.clientX - reorder.startX) > 8 || Math.abs(e.clientY - reorder.startY) > 8) {
            clearTimeout(reorder.timer);
        }
        return;
    }
    e.preventDefault();
    const target = definitionUnderPoint(e.clientY, reorder.note);
    if (target && target !== reorder.el) {
        reorder.moved = true;
        const rect = target.getBoundingClientRect();
        const after = (e.clientY - rect.top) > rect.height / 2;
        target.parentNode.insertBefore(reorder.el, after ? target.nextSibling : target);
    }
}

function onReorderUp() {
    clearTimeout(reorder.timer);
    if (reorder.active) {
        reorder.el.classList.remove('odh-dragging');
        document.body.classList.remove('odh-reordering');
        if (reorder.moved) {
            reorder.suppressClick = true;
            sendReorder(reorder.note);
        }
        // Restore the popup to its pre-drag height.
        window.parent.postMessage({ action: 'restorePopup', params: {} }, '*');
    }
    reorder.el = null;
    reorder.note = null;
    reorder.active = false;
}

function definitionUnderPoint(y, note) {
    for (let div of note.querySelectorAll('.odh-definition')) {
        const r = div.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom) return div;
    }
    return null;
}

function sendReorder(note) {
    if (!note) return;
    const divs = note.querySelectorAll('.odh-definition');
    if (!divs.length) return;
    const nindex = divs[0].dataset.nindex;
    const order = Array.from(divs).map(d => Number(d.dataset.dindex));
    window.parent.postMessage({ action: 'reorderDefinitions', params: { nindex, order } }, '*');
}

function hideTranslation(){
    let className = 'span.chn_dis, span.chn_tran, span.chn_sent, span.tgt_tran, span.tgt_sent'; // to add your bilingual translation div class name here.
    for (let div of document.querySelectorAll(className)) {
        div.classList.toggle('hidden');
    }
}

// ---- Right-click to edit a sense (POS / Chinese / English def / examples) ----
const editor = { div: null };

function registerEditMenu() {
    for (let div of document.getElementsByClassName('odh-definition')) {
        div.addEventListener('contextmenu', onDefinitionContextMenu);
    }
}

function onDefinitionContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    openDefinitionEditor(e.currentTarget);
}

function parseDefinition(div) {
    const txt = (sel) => {
        const el = div.querySelector(sel);
        return el ? el.textContent.trim() : '';
    };
    const examples = Array.from(div.querySelectorAll('.eng_sent')).map(s => s.textContent.trim()).filter(x => x);
    return { pos: txt('.pos'), chn: txt('.chn_tran'), eng: txt('.eng_tran'), examples };
}

function escapeHTML(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Mirrors builtin_encn_WordnetKaikki.posCategory / the APK's AntimoonFormatter
// posClass, but works on the abbreviated chip label (n/v/adj/...) so an edited
// sense keeps the APK-matching per-POS chip colour. Returns '' for the default.
function posCategoryFromLabel(label) {
    if (!label) return '';
    const first = label.split(/[\/;]/)[0].trim().toLowerCase();
    const map = {
        n: 'n', noun: 'n', v: 'v', verb: 'v',
        adj: 'a', a: 'a', adjective: 'a', adv: 'ad', ad: 'ad', adverb: 'ad',
        phr: 'phr', prov: 'phr', phrase: 'phr', 'prep.phr': 'phr', 'adv.phr': 'phr',
        pl: 'pl', plural: 'pl'
    };
    return map[first] || '';
}

function buildDefinitionHTML(f) {
    let html = '';
    if (f.pos) {
        const cat = posCategoryFromLabel(f.pos);
        html += `<span class="${cat ? 'pos ' + cat : 'pos'}">${escapeHTML(f.pos)}</span>`;
    }
    if (f.chn) html += `<span class="chn_tran">${escapeHTML(f.chn)}</span>`;
    if (f.eng) html += `<span class="eng_tran">${escapeHTML(f.eng)}</span>`;
    if (f.examples.length) {
        html += '<ul class="sents">';
        for (const ex of f.examples) {
            html += `<li class='sent'><span class='eng_sent'>${escapeHTML(ex)}</span></li>`;
        }
        html += '</ul>';
    }
    return html;
}

function ensureEditor() {
    if (document.getElementById('odh-editor-mask')) return;
    const mask = document.createElement('div');
    mask.id = 'odh-editor-mask';
    mask.innerHTML = `
        <div id="odh-editor">
            <div class="odh-editor-row"><label>詞性</label><input id="odh-edit-pos" type="text"></div>
            <div class="odh-editor-row"><label>中文翻譯</label><input id="odh-edit-chn" type="text"></div>
            <div class="odh-editor-row"><label>英文解釋</label><textarea id="odh-edit-eng" rows="2"></textarea></div>
            <div class="odh-editor-row"><label>例句(每行一句)</label><textarea id="odh-edit-ex" rows="3"></textarea></div>
            <div class="odh-editor-actions">
                <button id="odh-edit-cancel" type="button">取消</button>
                <button id="odh-edit-save" type="button">儲存</button>
            </div>
        </div>`;
    document.body.appendChild(mask);
    mask.addEventListener('click', (e) => { if (e.target === mask) closeEditor(); });
    document.getElementById('odh-edit-cancel').addEventListener('click', closeEditor);
    document.getElementById('odh-edit-save').addEventListener('click', saveEditor);
}

function openDefinitionEditor(div) {
    ensureEditor();
    editor.div = div;
    const f = parseDefinition(div);
    document.getElementById('odh-edit-pos').value = f.pos;
    document.getElementById('odh-edit-chn').value = f.chn;
    document.getElementById('odh-edit-eng').value = f.eng;
    document.getElementById('odh-edit-ex').value = f.examples.join('\n');
    document.getElementById('odh-editor-mask').style.display = 'flex';
}

function closeEditor() {
    const mask = document.getElementById('odh-editor-mask');
    if (mask) mask.style.display = 'none';
    editor.div = null;
}

function saveEditor() {
    const div = editor.div;
    if (!div) { closeEditor(); return; }
    const f = {
        pos: document.getElementById('odh-edit-pos').value.trim(),
        chn: document.getElementById('odh-edit-chn').value.trim(),
        eng: document.getElementById('odh-edit-eng').value.trim(),
        examples: document.getElementById('odh-edit-ex').value.split('\n').map(s => s.trim()).filter(x => x),
    };
    const newHTML = buildDefinitionHTML(f);
    // Rebuild the definition content but keep the add-note button node so its
    // click listener survives.
    const btn = div.querySelector('img.odh-addnote, img.odh-addnote-disabled');
    while (div.firstChild) div.removeChild(div.firstChild);
    if (btn) div.appendChild(btn);
    div.insertAdjacentHTML('beforeend', newHTML);
    // Persist to the content script so the Anki export uses the edited text.
    window.parent.postMessage({
        action: 'editDefinition',
        params: { nindex: div.dataset.nindex, dindex: div.dataset.dindex, html: newHTML }
    }, '*');
    closeEditor();
}

function onDomContentLoaded() {
    registerAddNoteLinks();
    registerAudioLinks();
    registerSoundLinks();
    registerHiddenClass();
    registerReorder();
    registerEditMenu();
    initSpellnTranslation();
}

function onMessage(e) {
    const { action, params } = e.data;
    const method = window['api_' + action];
    if (typeof(method) === 'function') {
        method(params);
    }
}

function api_setActionState(result) {
    const { response, params } = result;
    const { nindex, dindex } = params;

    const match = document.querySelector(`.odh-addnote[data-nindex="${nindex}"].odh-addnote[data-dindex="${dindex}"]`);
    if (response)
        match.src = getImageSource('good');
    else
        match.src = getImageSource('fail');

    setTimeout(() => {
        match.src = getImageSource('plus');
    }, 1000);
}

function onMouseWheel(e) {
    document.querySelector('html').scrollTop -= e.wheelDeltaY / 3;
    document.querySelector('body').scrollTop -= e.wheelDeltaY / 3;
    e.preventDefault();
}

document.addEventListener('DOMContentLoaded', onDomContentLoaded, false);
window.addEventListener('message', onMessage);
window.addEventListener('wheel', onMouseWheel, {passive: false});
