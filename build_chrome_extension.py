#!/usr/bin/env python3
"""Assemble a Chrome/Edge-loadable copy of the extension in src/.

Same source as the Firefox build, but keeps the Chrome MV3 manifest.json and the
service worker (bg/sw.js), and drops the Firefox-only manifest. Also strips the
unused ODH dictionary providers, the copyrighted data, and the raw (uncompressed)
dictionary JSON (the .gz is shipped and inflated at runtime), then zips it for
the Chrome Web Store / Microsoft Edge Add-ons.
"""

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "dist" / "chrome_extension"
ZIP = ROOT / "dist" / "wordnet_kaikki_chrome.zip"

# Paths (relative to src/) to leave out of the Chrome build.
EXCLUDE = {
    "manifest.firefox.json",    # Firefox-only manifest
    "data/collins.json",        # copyrighted, unused by this build
    "data/collins.json.bak",
    # Chromium stores reject compressed files nested in the package, so ship the
    # raw JSON here (the outer .zip still compresses it). The AMO/Firefox build
    # ships the .gz instead; builtin.js loads whichever is present.
    "data/wordnet_kaikki.json.gz",
}
EXCLUDE_DIR_NAMES = {"__pycache__"}
KEPT_DICTS = {"builtin_encn_WordnetKaikki.js"}


def is_excluded(rel: Path) -> bool:
    if rel.as_posix() in EXCLUDE:
        return True
    if len(rel.parts) == 2 and rel.parts[0] == "dict" and rel.suffix == ".js":
        if rel.name not in KEPT_DICTS:
            return True
    return any(part in EXCLUDE_DIR_NAMES for part in rel.parts)


def main() -> None:
    if not SRC.is_dir():
        raise SystemExit(f"missing source dir: {SRC}")

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    copied = 0
    for path in SRC.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(SRC)
        if is_excluded(rel):
            continue
        dest = OUT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dest)
        copied += 1

    # Ensure the raw (uncompressed) dictionary JSON is in the output even when
    # the source tree only ships the .gz (keeps the public repo lean). Chromium
    # stores reject nested compressed files, so we decompress into the output.
    raw = OUT / "data" / "wordnet_kaikki.json"
    if not raw.exists():
        gz = SRC / "data" / "wordnet_kaikki.json.gz"
        if not gz.exists():
            raise SystemExit("missing data/wordnet_kaikki.json and .gz")
        import gzip
        raw.parent.mkdir(parents=True, exist_ok=True)
        with gzip.open(gz, "rb") as fi, open(raw, "wb") as fo:
            shutil.copyfileobj(fi, fo)
        copied += 1

    if ZIP.exists():
        ZIP.unlink()
    # zip the folder contents at the archive root (store submissions expect this)
    with __import__("zipfile").ZipFile(ZIP, "w", __import__("zipfile").ZIP_DEFLATED) as zf:
        for path in OUT.rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(OUT).as_posix())

    print(f"copied {copied} files")
    print(f"folder: {OUT}")
    print(f"zip:    {ZIP}")


if __name__ == "__main__":
    main()
