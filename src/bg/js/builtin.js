// Built-in dictionary backed by IndexedDB.
//
// MV3 backgrounds (Chrome service worker / Firefox event page) are evicted when
// idle, so loading the ~75MB word-keyed JSON into memory on every wake made the
// first lookup slow. Instead we import the JSON into IndexedDB once (keyed by
// word) and then each lookup reads only the one entry it needs. Waking the
// background just re-opens the DB (instant); the big parse only happens on the
// first run and whenever the shipped data changes (detected via a .version file
// written by build_extension_wordnet_kaikki_json.py).
class Builtin {
    constructor() {
        this.dbName = 'odh-dict';
        this.storeName = 'wordnetkaikki';
        this.metaName = 'meta';
        this.dataPath = 'data/wordnet_kaikki.json';
        this.versionPath = 'data/wordnet_kaikki.json.version';
        this._db = null;
        this._ready = null;
        this._memory = null; // fallback dict if IndexedDB is unavailable
    }

    // Kept for compatibility with the previous call sites in core.js.
    loadData() {
        return this.ready();
    }

    loadOne(name, path) {
        if (name) this.storeName = name;
        if (path) {
            this.dataPath = path;
            this.versionPath = path + '.version';
        }
        return this.ready();
    }

    ready() {
        if (!this._ready) {
            this._ready = this._init().catch((err) => {
                console.error('Builtin IndexedDB init failed; using in-memory fallback:', err);
                return this._loadMemory();
            });
        }
        return this._ready;
    }

    async _init() {
        if (typeof indexedDB === 'undefined') {
            return this._loadMemory();
        }
        this._db = await this._openDB();
        const want = await this._fetchVersion();
        const have = await this._get(this.metaName, 'version');
        const count = await this._count(this.storeName);
        if (have !== want || count === 0) {
            await this._import();
            await this._put(this.metaName, 'version', want);
        }
    }

    _url(path) {
        return (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL(path)
            : path;
    }

    _openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(this.storeName)) db.createObjectStore(this.storeName);
                if (!db.objectStoreNames.contains(this.metaName)) db.createObjectStore(this.metaName);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async _fetchVersion() {
        try {
            const r = await fetch(this._url(this.versionPath));
            if (r.ok) return (await r.text()).trim();
        } catch (e) { /* fall through */ }
        return 'unknown';
    }

    // Load the dictionary object, preferring the gzipped file. Shipping the
    // data gzipped keeps the raw JSON under AMO's file-size scanner limit and
    // shrinks the package; we inflate it here with DecompressionStream. Falls
    // back to the plain JSON if the gz or DecompressionStream isn't available.
    async _fetchData() {
        try {
            const r = await fetch(this._url(this.dataPath + '.gz'));
            if (r.ok && r.body && typeof DecompressionStream !== 'undefined') {
                const stream = r.body.pipeThrough(new DecompressionStream('gzip'));
                return JSON.parse(await new Response(stream).text());
            }
        } catch (e) { /* fall back to the plain JSON below */ }
        const r2 = await fetch(this._url(this.dataPath));
        if (!r2.ok) throw new Error(`failed to load ${this.dataPath}: ${r2.status}`);
        return r2.json();
    }

    async _import() {
        const data = await this._fetchData(); // one-time full parse
        await this._clear(this.storeName);
        const words = Object.keys(data);
        const CHUNK = 4000;
        for (let i = 0; i < words.length; i += CHUNK) {
            const end = Math.min(i + CHUNK, words.length);
            await new Promise((resolve, reject) => {
                const tx = this._db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                for (let j = i; j < end; j++) {
                    // Store the JSON string so findTerm can return it directly.
                    store.put(JSON.stringify(data[words[j]]), words[j]);
                }
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
        }
        console.log('Builtin: imported', words.length, 'entries into IndexedDB');
    }

    async findTerm(dictname, term) {
        await this.ready();
        if (this._memory) {
            const d = this._memory[dictname];
            return d && Object.prototype.hasOwnProperty.call(d, term) ? JSON.stringify(d[term]) : null;
        }
        const value = await this._get(this.storeName, term);
        return value || null; // already a JSON string (or undefined -> null)
    }

    _get(store, key) {
        return new Promise((resolve, reject) => {
            const req = this._db.transaction(store, 'readonly').objectStore(store).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    _put(store, key, val) {
        return new Promise((resolve, reject) => {
            const tx = this._db.transaction(store, 'readwrite');
            tx.objectStore(store).put(val, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    _clear(store) {
        return new Promise((resolve, reject) => {
            const tx = this._db.transaction(store, 'readwrite');
            tx.objectStore(store).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    _count(store) {
        return new Promise((resolve, reject) => {
            const req = this._db.transaction(store, 'readonly').objectStore(store).count();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async _loadMemory() {
        this._memory = {};
        try {
            this._memory[this.storeName] = await this._fetchData();
        } catch (e) {
            console.error('Builtin: in-memory fallback load failed:', e);
        }
    }
}
