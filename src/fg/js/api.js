async function sendtoBackend(request){
    return new Promise((resolve, reject)=>{
        chrome.runtime.sendMessage(request, result => {
            resolve(result);
        });
    });
}

async function isConnected(){
    try {
        return await sendtoBackend({action:'isConnected', params:{}});
    } catch (err) {
        return null;
    }
}

async function getTranslation(expression){
    try {
        return await sendtoBackend({action:'getTranslation', params:{expression}});
    } catch (err) {
        return null;
    }
}

async function getFrontendOptions(){
    try {
        return await sendtoBackend({action:'getFrontendOptions', params:{}});
    } catch (err) {
        return null;
    }
}

async  function addNote(notedef){
    try {
        return await sendtoBackend({action:'addNote',params:{notedef}});
    } catch (err) {
        return null;
    }
}

async  function playAudio(url){
    // MV3: the service worker has no DOM/Audio, so play in the page context
    // (content scripts can create an Audio element) instead of round-tripping.
    try {
        if (window.__odhAudio) {
            try { window.__odhAudio.pause(); } catch (e) { /* ignore */ }
        }
        const audio = new Audio(url);
        window.__odhAudio = audio;
        audio.currentTime = 0;
        await audio.play();
        return true;
    } catch (err) {
        return null;
    }
}
