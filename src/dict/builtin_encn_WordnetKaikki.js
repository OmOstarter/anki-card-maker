/* global api */
/*
 * Built-in offline dictionary backed by the copyright-clean WordNet + Kaikki
 * (phrase) data the user built. Data is bundled as data/wordnet_kaikki.json and
 * loaded by bg/js/builtin.js under the key 'wordnetkaikki'.
 *
 * The compact stored shape per word key is:
 *   [ { p:pos, r:reading, s:[ { d:def, t:translation, x:[examples], xt:[ex_trans] } ] } ]
 *
 * NOTE: the sandbox loads this file with eval(`(${scripttext})`), so the whole
 * file must be a single class expression — keep all helpers as static members.
 */
class builtin_encn_WordnetKaikki {
    constructor(options) {
        this.options = options;
        this.maxexample = 2;
        this.word = '';
    }

    async displayName() {
        let locale = await api.locale();
        if (locale.indexOf('CN') != -1) return '内建辞典';
        if (locale.indexOf('TW') != -1) return '內建辭典';
        return 'Built-in dictionary';
    }

    setOptions(options) {
        this.options = options;
        this.maxexample = options.maxexample;
    }

    async findTerm(word) {
        this.word = word;
        if (!word) return [];
        let candidates = await this.buildCandidates(word);
        // Return the first candidate that has an entry, so we do not show
        // duplicate cards for a word and its stem/variants.
        for (const candidate of candidates) {
            let notes = await this.lookup(candidate);
            if (notes.length) return notes;
        }
        return [];
    }

    // Build an ordered, de-duplicated list of lookup keys: the word itself, its
    // lowercase form, single-word stems, and — for phrases — pronoun-slot variants
    // matching the dictionary's placeholder conventions (cross your t -> cross
    // someone's t, give him a hand -> give someone a hand, ...).
    async buildCandidates(word) {
        let out = [];
        let push = (w) => {
            if (!w) return;
            w = w.trim().toLowerCase();
            if (w.length > 1 && out.indexOf(w) == -1) out.push(w);
        };

        push(word);
        let stem = await api.deinflect(word);
        if (stem) push(stem);
        let lower = word.toLowerCase();
        if (lower != word) {
            push(lower);
            let lowerStem = await api.deinflect(lower);
            if (lowerStem) push(lowerStem);
        }

        // Phrase pronoun-slot variants.
        for (const variant of builtin_encn_WordnetKaikki.phraseSlotVariants(lower)) {
            push(variant);
        }
        return out;
    }

    async lookup(word) {
        let entries = null;
        try {
            entries = JSON.parse(await api.getBuiltin('wordnetkaikki', word));
        } catch (err) {
            return [];
        }
        if (!entries || !entries.length) return [];

        const maxexample = this.maxexample;
        const expression = word;
        const expre = builtin_encn_WordnetKaikki.escapeRegExp(expression);
        let reading = '';
        for (const entry of entries) {
            if (entry.r) { reading = entry.r; break; }
        }

        let audios = [];
        // Standard order: index 0 = UK (type=1), index 1 = US (type=2), matching
        // the audio-preference labels. The default preference is set to US (1) in
        // utils.js sanitizeOptions.
        audios[0] = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(expression)}&type=1`;
        audios[1] = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(expression)}&type=2`;

        let definitions = [];
        for (const entry of entries) {
            let posLabel = builtin_encn_WordnetKaikki.abbrevPos(entry.p);
            let posCat = builtin_encn_WordnetKaikki.posCategory(entry.p);
            let posCls = posCat ? `pos ${posCat}` : 'pos';
            let pos = posLabel ? `<span class="${posCls}">${posLabel}</span>` : '';
            for (const sense of (entry.s || [])) {
                // POS chip and the Chinese translation sit on the same line; the
                // English definition drops to the line below.
                let chn = sense.t ? `<span class="chn_tran">${sense.t}</span>` : '';
                let eng = sense.d
                    ? `<span class="eng_tran">${sense.d.replace(RegExp(expre, 'gi'), `<b>${expression}</b>`)}</span>`
                    : '';
                if (!chn && !eng) continue;
                let definition = `${pos}${chn}${eng}`;

                if (sense.x && sense.x.length > 0 && maxexample > 0) {
                    definition += '<ul class="sents">';
                    for (const [idx, ex] of sense.x.entries()) {
                        if (idx > maxexample - 1) break;
                        let engSent = ex.replace(RegExp(expre, 'gi'), `<b>${expression}</b>`);
                        let chnSent = (sense.xt && sense.xt[idx]) ? sense.xt[idx] : '';
                        definition += `<li class='sent'><span class='eng_sent'>${engSent}</span>`;
                        if (chnSent) definition += `<span class='chn_sent'>${chnSent}</span>`;
                        definition += '</li>';
                    }
                    definition += '</ul>';
                }
                definitions.push(definition);
            }
        }
        if (!definitions.length) return [];

        let css = this.renderCSS();
        return [{ css, expression, reading, extrainfo: '', definitions, audios }];
    }

    // Possessive / object / reflexive pronoun slots, ported from the Android app's
    // DictionaryRepository so a selected phrase still hits the headword form.
    static phraseSlotVariants(phrase) {
        if (!phrase || phrase.indexOf(' ') < 0) return [];
        const families = builtin_encn_WordnetKaikki.slotFamilies();
        let tokens = phrase.split(/\s+/).filter(x => x);
        let results = [];
        let seen = {};
        let add = (s) => { if (s && !seen[s]) { seen[s] = 1; results.push(s); } };
        for (const family of families) {
            let hasSlot = tokens.some(t => family.forms.has(t));
            if (!hasSlot) continue;
            for (const placeholder of family.placeholders) {
                let rebuilt = tokens.map(t => family.forms.has(t) ? placeholder : t).join(' ');
                if (rebuilt != phrase) add(rebuilt);
            }
        }
        return results;
    }

    static slotFamilies() {
        return [
            {
                forms: new Set(['my', 'your', 'his', 'her', 'its', 'our', 'their',
                    "one's", "someone's", "somebody's", "sb's"]),
                placeholders: ["one's", "someone's", "somebody's",
                    'your', 'their', 'his', 'her', 'my', 'our', 'its']
            },
            {
                forms: new Set(['me', 'you', 'him', 'her', 'us', 'them',
                    'someone', 'somebody', 'one']),
                placeholders: ['someone', 'somebody', 'one']
            },
            {
                forms: new Set(['myself', 'yourself', 'himself', 'herself', 'itself',
                    'ourselves', 'yourselves', 'themselves', 'oneself']),
                placeholders: ['oneself', 'yourself', 'themselves', 'myself']
            }
        ];
    }

    static escapeRegExp(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Normalise a part-of-speech tag to a short dictionary abbreviation. The data
    // mixes full ("noun", "adjective", "name") and already-short ("adj", "intj")
    // tags, and compound tags joined with ';' (e.g. "noun;verb").
    static abbrevPos(pos) {
        if (!pos) return '';
        const map = {
            noun: 'n', verb: 'v', adjective: 'adj', adj: 'adj', adverb: 'adv', adv: 'adv',
            name: 'prop', pron: 'pron', prep: 'prep', conj: 'conj', det: 'det', num: 'num',
            intj: 'int', particle: 'part', article: 'art', contraction: 'contr',
            prefix: 'pref', suffix: 'suf', infix: 'inf', circumfix: 'circ',
            phrase: 'phr', proverb: 'prov', prep_phrase: 'prep.phr', adv_phrase: 'adv.phr'
        };
        return pos.split(';')
            .map(p => p.trim())
            .filter(p => p)
            .map(p => map[p] || p)
            .join('/');
    }

    // Maps a (possibly compound) POS string to the APK's POS chip colour class
    // (n/v/a/ad/phr/pl), based on the first/primary word class. Mirrors
    // AntimoonFormatter.posClass in the Android app so the popup chip colours
    // match the APK exactly. Anything else returns '' (default accent colour).
    static posCategory(pos) {
        if (!pos) return '';
        const first = pos.split(';')[0].trim().toLowerCase();
        const map = {
            noun: 'n', n: 'n',
            verb: 'v', v: 'v',
            adjective: 'a', adj: 'a', a: 'a',
            adverb: 'ad', adv: 'ad', ad: 'ad',
            phrase: 'phr', phr: 'phr', proverb: 'phr', prep_phrase: 'phr', adv_phrase: 'phr',
            plural: 'pl', pl: 'pl'
        };
        return map[first] || '';
    }

    renderCSS() {
        let css = `
            <style>
                .odh-definition span.pos {display:inline-block; font-size:0.85em; font-weight:600; line-height:1; margin-right:5px; padding:2px 7px; color:#ffffff; background-color:#2563eb; border-radius:999px; text-transform:lowercase; vertical-align:middle;}
                .odh-definition span.pos.n {background-color:#2563eb;}
                .odh-definition span.pos.v {background-color:#16a34a;}
                .odh-definition span.pos.a {background-color:#ea580c;}
                .odh-definition span.pos.ad {background-color:#7c3aed;}
                .odh-definition span.pos.phr {background-color:#0891b2;}
                .odh-definition span.pos.pl {background-color:#db2777;}
                .odh-definition span.chn_tran {color:#5b6ee1; vertical-align:middle;}
                .odh-definition span.eng_tran {display:block; margin-top:2px; color:#6f6f76;}
                .odh-definition ul.sents {font-size:0.8em; list-style:square inside; margin:3px 0 0; padding:5px 8px; background-color:#f7f7f8; border:1px solid #e1e1e6; border-radius:6px;}
                .odh-definition li.sent {margin:0; padding:0;}
                .odh-definition span.eng_sent {color:#2f2f33; margin-right:5px;}
                .odh-definition span.chn_sent {display:block; margin-top:2px; font-size:0.92em; color:#5b6ee1;}
                @media (prefers-color-scheme:dark){
                    .odh-definition span.pos {background-color:#7aa2ff;}
                    .odh-definition span.pos.n {background-color:#7aa2ff;}
                    .odh-definition span.pos.v {background-color:#4ade80;}
                    .odh-definition span.pos.a {background-color:#fb923c;}
                    .odh-definition span.pos.ad {background-color:#a78bfa;}
                    .odh-definition span.pos.phr {background-color:#22d3ee;}
                    .odh-definition span.pos.pl {background-color:#f472b6;}
                    .odh-definition span.chn_tran {color:#9aa7ff;}
                    .odh-definition span.eng_tran {color:#a0a0aa;}
                    .odh-definition ul.sents {background-color:#202026; border-color:#3a3a42;}
                    .odh-definition span.eng_sent {color:#d7d7dd;}
                    .odh-definition span.chn_sent {color:#9aa7ff;}
                }
            </style>`;
        return css;
    }
}
