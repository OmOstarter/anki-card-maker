function sanitizeOptions(options) {
    const defaults = {
        enabled: true,
        mouseselection: true,
        readerfab: true, // show the floating reader-mode button on article pages
        hotkey: '16', // 0:off , 16:shift, 17:ctrl, 18:alt
        maxcontext: '1',
        maxexample: '2',
        monolingual: '0', //0: bilingual 1:monolingual
        preferredaudio: '1', // default to US (American) audio
        services: 'none',
        ankiconnecturl: 'http://127.0.0.1:8765',
        id: '',
        password: '',

        duplicate: '1', // 0: not allowe duplicated cards; 1: allowe duplicated cards;
        tags: 'DV',
        deckname: 'Default',
        typename: 'Dict Vocab',
        expression: 'expression',
        reading: 'reading',
        extrainfo: 'note',
        definitions: 'FullDefinition',
        sentence: 'sentence',
        url: 'url',
        audio: 'audio',

        sysscripts: 'builtin_encn_WordnetKaikki,builtin_encn_Collins,encn_Collins,encn_Collins_tc,encn_Cambridge,encn_Oxford,fren_Cambridge,esen_Spanishdict,decn_Eudict,escn_Eudict,frcn_Eudict',
        udfscripts: '',

        dictSelected: '',
        dictNamelist: [],
    };

    for (const key in defaults) {
        if (!options.hasOwnProperty(key)) {
            options[key] = defaults[key];
        }
    }
    return options;
}


async function optionsLoad() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(null, (options) => {
            resolve(sanitizeOptions(options));
        });
    });
}

async function optionsSave(options) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(sanitizeOptions(options), resolve());
    });
}

function utilAsync(func) {
    return function(...args) {
        func.apply(this, args);
    };
}

// MV3 has no persistent background page, so option/popup pages can no longer
// grab the backend instance directly. This shim keeps the existing
// `odhback().opt_*()` call sites working by routing them to the service worker
// over chrome.runtime messaging.
function odhback() {
    const call = (action, params = {}) => new Promise((resolve) => {
        chrome.runtime.sendMessage({ action, params }, (result) => {
            void chrome.runtime.lastError;
            resolve(result);
        });
    });
    return {
        opt_getDeckNames: () => call('opt_getDeckNames'),
        opt_getModelNames: () => call('opt_getModelNames'),
        opt_getModelFieldNames: (modelName) => call('opt_getModelFieldNames', { modelName }),
        opt_getVersion: () => call('opt_getVersion'),
        opt_optionsChanged: (options) => call('opt_optionsChanged', { options }),
    };
}

// Resolve whether we're on macOS so the hotkey dropdown can offer the right
// modifier keys (Cmd/Option on Mac, Alt on Windows/Linux).
function isMacPlatform() {
    return new Promise((resolve) => {
        if (chrome.runtime && chrome.runtime.getPlatformInfo) {
            try {
                chrome.runtime.getPlatformInfo((info) => {
                    void chrome.runtime.lastError;
                    resolve(!!info && info.os === 'mac');
                });
                return;
            } catch (e) { /* fall back to UA sniff below */ }
        }
        resolve(/Mac/i.test(`${navigator.platform || ''} ${navigator.userAgent || ''}`));
    });
}

// Remove the hotkey <option>s that don't apply to the current platform. Options
// are tagged data-platform="mac" (Cmd/Option) or "nonmac" (Alt).
async function applyHotkeyPlatform(selector = '#hotkey') {
    const isMac = await isMacPlatform();
    const drop = isMac ? 'nonmac' : 'mac';
    document.querySelectorAll(`${selector} option[data-platform="${drop}"]`)
        .forEach((el) => el.remove());
}

function localizeHtmlPage() {
    for (const el of document.querySelectorAll('[data-i18n]')) {
        el.innerHTML = chrome.i18n.getMessage(el.getAttribute('data-i18n'));
    }
}
