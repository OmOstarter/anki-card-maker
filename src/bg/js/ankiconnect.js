class Ankiconnect {
    constructor(url) {
        this.version = 6;
        // Configurable endpoint: desktop Anki-Connect or the on-device
        // AnkiConnectAndroid bridge (both default to 127.0.0.1:8765).
        this.url = url || 'http://127.0.0.1:8765';
    }

    async ankiInvoke(action, params = {}, timeout = 3000) {
        const request = { action, version: this.version, params };
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const httpResponse = await fetch(this.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                body: JSON.stringify(request),
                signal: controller.signal,
            });
            const response = await httpResponse.json();
            if (Object.getOwnPropertyNames(response).length != 2) {
                throw 'response has an unexpected number of fields';
            }
            if (!response.hasOwnProperty('error')) {
                throw 'response is missing required error field';
            }
            if (!response.hasOwnProperty('result')) {
                throw 'response is missing required result field';
            }
            if (response.error) {
                throw response.error;
            }
            return response.result;
        } catch (e) {
            // Network failure, timeout/abort, or a malformed response: match the
            // MV2 behavior of surfacing "not connected" rather than throwing.
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    async addNote(note) {
        if (note)
            return await this.ankiInvoke('addNote', { note });
        else
            return Promise.resolve(null);
    }

    async getDeckNames() {
        return await this.ankiInvoke('deckNames');
    }

    async getModelNames() {
        return await this.ankiInvoke('modelNames');
    }

    async getModelFieldNames(modelName) {
        return await this.ankiInvoke('modelFieldNames', { modelName });
    }

    async getVersion() {
        // 2000ms (not 100ms): a closed port refuses instantly, so this only
        // affects an alive-but-slow server — e.g. AnkiConnectAndroid waking
        // AnkiDroid on a phone, which needs far more than 100ms to answer.
        let version = await this.ankiInvoke('version', {}, 2000);
        return version ? 'ver:' + version : null;
    }
}