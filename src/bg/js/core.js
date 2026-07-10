/* global Builtin, Deinflector, Ankiconnect,
   builtin_encn_WordnetKaikki, optionsLoad, optionsSave */

// Shared backend logic for the WordNet+Kaikki extension. Loaded by both:
//   - Chrome: bg/sw.js importScripts()'s this (+ its deps) into a service worker.
//   - Firefox: manifest `background.scripts` lists this (+ its deps) as an event
//     page. Firefox has no extension service worker, so it uses the same code
//     without the worker-only importScripts wrapper.
// All dependency classes/helpers are expected to already be in the global scope
// (loaded before this file by either mechanism).

const ankiconnect = new Ankiconnect();

const deinflector = new Deinflector();
const deinflectorReady = deinflector.loadData();

// Load only the copyright-clean WordNet+Kaikki data (skip the optional Collins
// blob that the MV2 build also tried). ~75MB; awaited before the first lookup.
const builtin = new Builtin();
const builtinReady = builtin.loadOne('wordnetkaikki', 'data/wordnet_kaikki.json');

// The provider expects a global `api` that the MV2 sandbox used to proxy back to
// the backend. Here it resolves against our in-process helpers directly.
const api = {
    locale: async () => chrome.i18n.getUILanguage(),
    deinflect: async (word) => {
        await deinflectorReady;
        return deinflector.deinflect(word);
    },
    getBuiltin: async (dict, word) => {
        await builtinReady;
        return await builtin.findTerm(dict, word);
    },
};

const DICT_OBJECT_NAME = 'builtin_encn_WordnetKaikki';
const provider = new builtin_encn_WordnetKaikki({});

let options = null;

async function ensureOptions() {
    if (!options) {
        options = await optionsLoad();
    }
    return options;
}

const DEFAULT_ANKI_URL = 'http://127.0.0.1:8765';

function ankiUrl() {
    const u = options && options.ankiconnecturl && options.ankiconnecturl.trim();
    return u || DEFAULT_ANKI_URL;
}

function ankiTarget() {
    if (options && options.services === 'ankiconnect') {
        ankiconnect.url = ankiUrl();
        return ankiconnect;
    }
    return null;
}

// ---- Frontend (content script) requests ----------------------------------

async function findTerm(expression) {
    await ensureOptions();
    if (typeof expression !== 'string') return null;
    // Trim a trailing period that can sneak in from sentence selection.
    if (expression.endsWith('.')) {
        expression = expression.slice(0, -1);
    }
    provider.setOptions(options);
    return await provider.findTerm(expression);
}

function formatNote(notedef) {
    if (!options.deckname || !options.typename || !options.expression) return null;

    const note = {
        deckName: options.deckname,
        modelName: options.typename,
        options: { allowDuplicate: options.duplicate == '1' },
        fields: {},
        tags: [],
    };

    const fieldnames = ['expression', 'reading', 'extrainfo', 'definitions', 'sentence', 'url'];
    for (const fieldname of fieldnames) {
        if (!options[fieldname]) continue;
        note.fields[options[fieldname]] = notedef[fieldname];
    }

    const tags = options.tags.trim();
    if (tags.length > 0) note.tags = tags.split(' ');

    if (options.audio && notedef.audios.length > 0) {
        note.fields[options.audio] = '';
        let audionumber = Number(options.preferredaudio);
        audionumber = (audionumber && notedef.audios[audionumber]) ? audionumber : 0;
        const audiofile = notedef.audios[audionumber];
        note.audio = {
            url: audiofile,
            filename: `ODH_${options.dictSelected}_${encodeURIComponent(notedef.expression)}_${audionumber}.mp3`,
            fields: [options.audio],
        };
    }

    return note;
}

async function addNote(notedef) {
    await ensureOptions();
    const target = ankiTarget();
    if (!target) return null;
    return await target.addNote(formatNote(notedef));
}

// ---- Option / popup page requests ----------------------------------------

async function getVersion() {
    await ensureOptions();
    const target = ankiTarget();
    return target ? await target.getVersion() : null;
}

async function getDeckNames() {
    await ensureOptions();
    const target = ankiTarget();
    return target ? await target.getDeckNames() : null;
}

async function getModelNames() {
    await ensureOptions();
    const target = ankiTarget();
    return target ? await target.getModelNames() : null;
}

async function getModelFieldNames(modelName) {
    await ensureOptions();
    const target = ankiTarget();
    return target ? await target.getModelFieldNames(modelName) : null;
}

async function optionsChanged(newOptions) {
    options = newOptions;
    // Single built-in provider in this build.
    const displayname = (typeof provider.displayName === 'function')
        ? await provider.displayName()
        : 'WordNet + Kaikki';
    options.dictNamelist = [{ objectname: DICT_OBJECT_NAME, displayname }];
    options.dictSelected = DICT_OBJECT_NAME;
    provider.setOptions(options);
    await optionsSave(options);
    setFrontendOptions(options);
    return options;
}

// ---- Push enabled state to content scripts + badge -----------------------

function setFrontendOptions(opts) {
    chrome.action.setBadgeText({ text: opts.enabled ? '' : 'off' });
    chrome.tabs.query({}, (tabs) => {
        for (const tab of tabs) {
            chrome.tabs.sendMessage(
                tab.id,
                { action: 'setFrontendOptions', params: { options: opts } },
                () => void chrome.runtime.lastError
            );
        }
    });
}

// ---- Message hub ----------------------------------------------------------

async function dispatch(request) {
    const { action, params = {} } = request || {};
    switch (action) {
        case 'isConnected': return await getVersion();
        case 'getFrontendOptions': return await ensureOptions();
        case 'getTranslation': return await findTerm(params.expression);
        case 'addNote': return await addNote(params.notedef);
        case 'playAudio': return true; // audio is played in the content script
        case 'opt_getDeckNames': return await getDeckNames();
        case 'opt_getModelNames': return await getModelNames();
        case 'opt_getModelFieldNames': return await getModelFieldNames(params.modelName);
        case 'opt_getVersion': return await getVersion();
        case 'opt_optionsChanged': return await optionsChanged(params.options);
        default: return null;
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    dispatch(request).then(sendResponse, (err) => {
        console.error(err);
        sendResponse(null);
    });
    return true; // keep the channel open for the async response
});

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.tabs.create({ url: chrome.runtime.getURL('bg/guide.html') });
    } else if (details.reason === 'update') {
        chrome.tabs.create({ url: chrome.runtime.getURL('bg/update.html') });
    }
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status !== 'complete') return;
    ensureOptions().then((opts) => {
        chrome.tabs.sendMessage(
            tabId,
            { action: 'setFrontendOptions', params: { options: opts } },
            () => void chrome.runtime.lastError
        );
    });
});

chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'enabled') return;
    await ensureOptions();
    options.enabled = !options.enabled;
    await optionsSave(options);
    setFrontendOptions(options);
});
