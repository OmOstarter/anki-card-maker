# Offline English–Chinese Pop-up Dictionary (WordNet + Kaikki)

線上詞典助手 — a browser **selection / pop-up dictionary** for reading English
on the web. Select a word or phrase on any page to get an instant
**English→Traditional-Chinese** definition, and optionally send it to **Anki**.

Works on **Firefox** (desktop + Android) and **Chromium** browsers
(Chrome, Edge, Brave, Vivaldi, Opera).

## Features

- **Fully offline** built-in dictionary (WordNet + Wiktionary/Kaikki) with
  Traditional-Chinese glosses — lookups never leave your device.
- Phrase & inflection matching (e.g. `gave him a hand` → `give someone a hand`).
- Optional pronunciation audio (US / UK).
- Optional **Add to Anki** via a local [AnkiConnect](https://foosoft.net/projects/anki-connect/)
  bridge (works with AnkiDroid on Android via the AnkiConnect Android app).
- In-page reader mode with adjustable font size, configurable hotkey,
  light/dark UI, mobile-friendly layout.

No analytics, no tracking — see [`docs/PRIVACY_POLICY.md`](docs/PRIVACY_POLICY.md).

## Install

- **Firefox / Firefox for Android:** from addons.mozilla.org (link TBA), or
  build the `.xpi` below.
- **Chrome / Edge / Brave / …:** from the Chrome Web Store / Edge Add-ons
  (links TBA), or load the unpacked build below.

### From source

Requires **Python 3** only (no bundler/build toolchain).

```bash
# Firefox package (ships the gzipped dictionary; inflated at runtime)
python3 build_firefox_extension.py      # -> dist/wordnet_kaikki_firefox.xpi

# Chrome / Edge package (ships the raw JSON; Chromium rejects nested archives)
python3 build_chrome_extension.py       # -> dist/wordnet_kaikki_chrome.zip
```

Load unpacked for development:
- Chrome/Edge: `chrome://extensions` → Developer mode → **Load unpacked** →
  `dist/chrome_extension`
- Firefox: `about:debugging` → **Load Temporary Add-on** →
  `dist/firefox_extension/manifest.json`

The dictionary data ships as `src/data/wordnet_kaikki.json.gz`; the Chrome build
decompresses it automatically. To regenerate it you need the source dataset and
`build_extension_wordnet_kaikki_json.py`.

## Data sources & licenses

The bundled dictionary is derived from copyright-clean sources:

- **WordNet** © Princeton University — [WordNet License](https://wordnet.princeton.edu/license-and-commercial-use)
  (BSD-style).
- **Wiktionary / [Kaikki.org](https://kaikki.org)** data — **CC BY-SA 4.0**.
  Derived data in this project is likewise available under CC BY-SA 4.0.

## Credits & license

This is a fork of **[ODH (Online Dictionary Helper)](https://github.com/ninja33/ODH)**
by Zhenyu Huang, used under the **MIT License**. Bundled libraries: jQuery (MIT)
and Mozilla Readability (Apache-2.0).

The extension **code** is released under the **MIT License** — see
[`LICENSE`](LICENSE). Bundled dictionary **data** is under the source licenses
above.
