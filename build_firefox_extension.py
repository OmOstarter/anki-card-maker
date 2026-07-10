#!/usr/bin/env python3
"""Assemble a Firefox-loadable copy of the Chrome extension in src/.

Firefox has no extension service worker, so it can't use src/manifest.json
(background.service_worker) or bg/sw.js. This produces dist/firefox_extension/
with manifest.firefox.json installed as manifest.json (background.scripts event
page) and the Chrome-only / copyrighted / unused files stripped, then zips it to
dist/wordnet_kaikki_firefox.xpi.

Load it in Firefox via about:debugging -> "This Firefox" -> "Load Temporary
Add-on" -> pick dist/firefox_extension/manifest.json (or the .xpi).
"""
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "dist" / "firefox_extension"
XPI = ROOT / "dist" / "wordnet_kaikki_firefox.xpi"

# Paths (relative to src/) to leave out of the Firefox build.
EXCLUDE = {
    "manifest.json",            # Chrome manifest; replaced by the Firefox one
    "manifest.firefox.json",    # source of the Firefox manifest (installed as manifest.json)
    "bg/sw.js",                 # Chrome service-worker entry; Firefox uses background.scripts
    "data/collins.json",        # copyrighted, unused by this build
    "data/collins.json.bak",
    # Ship only the gzipped dictionary: the raw 71MB JSON exceeds AMO's
    # file-size scanner limit. builtin.js inflates the .gz at runtime.
    "data/wordnet_kaikki.json",
}
EXCLUDE_DIR_NAMES = {"__pycache__"}

# This build loads exactly one dictionary provider (via manifest background
# scripts). The other dict/*.js are unused ODH leftovers — some fetch remote
# data or use eval(), which trips the AMO reviewer/linter — so don't ship them.
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
    firefox_manifest = SRC / "manifest.firefox.json"
    if not firefox_manifest.is_file():
        raise SystemExit(f"missing {firefox_manifest}")

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

    # Install the Firefox manifest as manifest.json.
    shutil.copy2(firefox_manifest, OUT / "manifest.json")

    # Zip to an .xpi for web-ext / distribution (paths must be at the archive root).
    XPI.parent.mkdir(parents=True, exist_ok=True)
    if XPI.exists():
        XPI.unlink()
    with zipfile.ZipFile(XPI, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in OUT.rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(OUT).as_posix())

    print(f"copied {copied} files (+ manifest.json)")
    print(f"folder: {OUT}")
    print(f"xpi:    {XPI}")


if __name__ == "__main__":
    main()
