class Deinflector {
    constructor() {
        this.path = 'data/wordforms.json';
        this.wordforms = null;
    }

    async loadData() {
        this.wordforms = await Deinflector.loadData(this.path);
    }

    deinflect(term) {
        if (!this.wordforms) return null;
        return this.wordforms[term] ? this.wordforms[term] : null;
    }

    static async loadData(path) {
        // Resolve against the extension root (see Builtin.loadData) so the data
        // file is found regardless of the background page's /bg location.
        const url = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL(path)
            : path;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`failed to load ${path}: ${response.status}`);
        return await response.json();
    }
    
}
