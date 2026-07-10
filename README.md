# anki單字製卡助手 — 離線英漢劃詞辭典（WordNet + Kaikki）

在網頁上**選取任何英文單字或片語**,即時跳出**英文→繁體中文**釋義,並可一鍵送進
**Anki** 製卡。支援 **Firefox**(桌面 + Android)與 **Chromium** 系瀏覽器
(Chrome、Edge、Brave、Vivaldi、Opera)。

> English version below ↓ — [jump to English](#offline-englishchinese-pop-up-dictionary-wordnet--kaikki)

## 功能

- **完全離線**的內建辭典(WordNet + Wiktionary/Kaikki),附繁體中文釋義 —— 查詞不連網、不外傳。
- **片語與變化形對應**(例如 `gave him a hand` → `give someone a hand`)。
- 可選發音(美式 / 英式)。
- 可選 **加入 Anki**,透過本機 [AnkiConnect](https://foosoft.net/projects/anki-connect/)
  橋接(Android 搭配 AnkiConnect Android app 也能用)。
- 內建閱讀模式(字級可調)、可自訂取詞熱鍵、亮/暗色介面、手機友善版面。

不做任何分析追蹤 —— 見 [`docs/PRIVACY_POLICY.md`](docs/PRIVACY_POLICY.md)。

## 安裝

- **Firefox / Firefox Android:** 從 addons.mozilla.org(連結待補),或自行建置下方的 `.xpi`。
- **Chrome / Edge / Brave …:** 從 Chrome 線上應用程式商店 / Edge 附加元件(連結待補),
  或用下方方式載入未封裝版本。

### 從原始碼建置

只需要 **Python 3**(不需其他建置工具)。

```bash
# Firefox 版(內含 gzip 字典,執行時解壓)
python3 build_firefox_extension.py      # -> dist/wordnet_kaikki_firefox.xpi

# Chrome / Edge 版(內含原始 JSON;Chromium 不允許包內壓縮檔)
python3 build_chrome_extension.py       # -> dist/wordnet_kaikki_chrome.zip
```

開發時載入未封裝:
- Chrome/Edge:`chrome://extensions` → 開發人員模式 → **載入未封裝** → `dist/chrome_extension`
- Firefox:`about:debugging` → **載入暫時性附加元件** → `dist/firefox_extension/manifest.json`

字典資料以 `src/data/wordnet_kaikki.json.gz` 形式附上,Chrome 建置會自動解壓。

## 資料來源與授權

內建辭典由「無版權疑慮」的來源整理而成:

- **WordNet** © 普林斯頓大學 —— [WordNet License](https://wordnet.princeton.edu/license-and-commercial-use)(BSD 類授權)。
- **Wiktionary / [Kaikki.org](https://kaikki.org)** 資料 —— **CC BY-SA 4.0**;本專案衍生資料同樣以 CC BY-SA 4.0 提供。

## 出處與授權

本專案改作自 **[ODH（Online Dictionary Helper）](https://github.com/ninja33/ODH)**
(作者 Zhenyu Huang,MIT 授權)。內含函式庫:jQuery(MIT)、Mozilla Readability(Apache-2.0)。

擴充**程式碼**以 **MIT 授權**釋出(見 [`LICENSE`](LICENSE));內建字典**資料**依上述來源授權。

---

# Offline English–Chinese Pop-up Dictionary (WordNet + Kaikki)

A browser **selection / pop-up dictionary** for reading English on the web.
Select a word or phrase on any page to get an instant
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
decompresses it automatically.

## Data sources & licenses

- **WordNet** © Princeton University — [WordNet License](https://wordnet.princeton.edu/license-and-commercial-use) (BSD-style).
- **Wiktionary / [Kaikki.org](https://kaikki.org)** — **CC BY-SA 4.0**; derived data here is likewise CC BY-SA 4.0.

## Credits & license

Fork of **[ODH (Online Dictionary Helper)](https://github.com/ninja33/ODH)** by
Zhenyu Huang, under the **MIT License**. Bundled libraries: jQuery (MIT) and
Mozilla Readability (Apache-2.0). Extension **code** is MIT — see
[`LICENSE`](LICENSE); bundled dictionary **data** uses the source licenses above.
