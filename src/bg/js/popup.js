/* global odhback, localizeHtmlPage, utilAsync, optionsLoad, optionsSave */
async function populateAnkiDeckAndModel(options) {
    let names = [];
    $('#deckname').empty();
    names = await odhback().opt_getDeckNames();
    if (names !== null) {
        names.forEach(name => $('#deckname').append($('<option>', { value: name, text: name })));
    }
    $('#deckname').val(options.deckname);
}

function populateDictionary(dicts) {
    $('#dict').empty();
    dicts.forEach(item => $('#dict').append($('<option>', { value: item.objectname, text: item.displayname })));
}

async function updateAnkiStatus(options) {
    let version = await odhback().opt_getVersion();
    if (version === null) {
        $('.anki-options').addClass('collapsed');
    } else {
        populateAnkiDeckAndModel(options);
        // toggle a class instead of jQuery show/hide, which would force
        // display:block and break the CSS flex row layout
        $('.anki-options').removeClass('collapsed');
    }
}

async function onOptionChanged(e) {
    if (!e.originalEvent) return;

    let options = await optionsLoad();

    options.enabled = $('#enabled').prop('checked');
    options.mouseselection = $('#mouseselection').prop('checked');
    options.readerfab = $('#readerfab').prop('checked');
    options.hotkey = $('#hotkey').val();

    options.dictSelected = $('#dict').val();

    options.deckname = $('#deckname').val();
    options.tags = $('#tags').val();
    let newOptions = await odhback().opt_optionsChanged(options);
    optionsSave(newOptions);
}

function onMoreOptions() {
    // Open the options page as a normal browser tab. Firefox for Android has no
    // desktop-style add-on preferences pane, so openOptionsPage()'s target can't
    // render; a real tab (tabs.create) shows the extension page fine there.
    const url = chrome.runtime.getURL('bg/options.html');
    if (chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url });
    } else if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
    } else {
        window.open(url);
    }
    window.close();
}

function onReaderMode() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleReaderMode', params: {} },
                () => void chrome.runtime.lastError);
        }
        window.close();
    });
}

async function onReady() {
    localizeHtmlPage();
    await applyHotkeyPlatform();
    let options = await optionsLoad();
    // Rebuild the dictionary list so its display name reflects the current
    // build; the name cached in storage can be stale after an update.
    options = await odhback().opt_optionsChanged(options);
    $('#enabled').prop('checked', options.enabled);
    $('#mouseselection').prop('checked', options.mouseselection);
    $('#readerfab').prop('checked', options.readerfab);
    $('#hotkey').val(options.hotkey);
    populateDictionary(options.dictNamelist);
    $('#dict').val(options.dictSelected);
    $('#deckname').val(options.deckname);
    $('#tags').val(options.tags);

    $('#enabled').change(onOptionChanged);
    $('#mouseselection').change(onOptionChanged);
    $('#readerfab').change(onOptionChanged);
    $('#hotkey').change(onOptionChanged);
    $('#dict').change(onOptionChanged);

    $('#deckname').change(onOptionChanged);
    $('#tags').change(onOptionChanged);

    $('#more').click(onMoreOptions);
    $('#reader').click(onReaderMode);

    $('.anki-options').addClass('collapsed');
    updateAnkiStatus(options);

}

$(document).ready(utilAsync(onReady));