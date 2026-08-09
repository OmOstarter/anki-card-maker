#!/usr/bin/env python3
"""Build a source-code ZIP for Firefox AMO review.

The archive contains the files needed to inspect and reproduce the submitted
Firefox XPI. It intentionally excludes local/raw dictionary sources and the raw
extension dictionary JSON; Firefox ships the gzipped JSON.
"""
import shutil
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "dist" / "wordnet_kaikki_firefox_source.zip"

INCLUDE_FILES = [
    "build_extension_wordnet_kaikki_json.py",
    "build_firefox_extension.py",
    "build_firefox_source_zip.py",
    "amo/BUILD.md",
    "amo/REVIEWER_NOTES.md",
    "amo/PRIVACY_POLICY.md",
    "amo/LISTING.md",
]

EXCLUDE = {
    "src/data/collins.json",
    "src/data/collins.json.bak",
    "src/data/wordnet_kaikki.json",
}
EXCLUDE_DIR_NAMES = {"__pycache__"}
KEPT_DICTS = {"builtin_encn_WordnetKaikki.js"}

SOURCE_README = """# Firefox source package

This ZIP is the source package for AMO review of WordNet Kaikki Dictionary Helper.

The Firefox XPI is built from `src/` with:

```bash
python3 build_firefox_extension.py
```

The submitted Firefox package uses `src/manifest.firefox.json`, which the build
script installs as `manifest.json`, and ships `src/data/wordnet_kaikki.json.gz`.
The raw `src/data/wordnet_kaikki.json` is excluded from this source ZIP because
Firefox/AMO uses the gzipped dictionary file at runtime.

No bundler is used. Project JavaScript/CSS/HTML files are copied as-is.
"""


def is_excluded_src_file(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    if rel in EXCLUDE:
        return True
    if any(part in EXCLUDE_DIR_NAMES for part in path.relative_to(ROOT).parts):
        return True
    src_rel = path.relative_to(ROOT / "src")
    if len(src_rel.parts) == 2 and src_rel.parts[0] == "dict" and src_rel.suffix == ".js":
        return src_rel.name not in KEPT_DICTS
    return False


def add_file(zf: zipfile.ZipFile, path: Path, arcname: str | None = None) -> None:
    zf.write(path, arcname or path.relative_to(ROOT).as_posix())


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()

    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("SOURCE_README.md", SOURCE_README)
        for name in INCLUDE_FILES:
            path = ROOT / name
            if path.is_file():
                add_file(zf, path)

        # AMO docs are also copied to the archive root for reviewer convenience.
        root_docs = {
            "amo/BUILD.md": "BUILD.md",
            "amo/REVIEWER_NOTES.md": "REVIEWER_NOTES.md",
            "amo/PRIVACY_POLICY.md": "PRIVACY_POLICY.md",
        }
        for src, dest in root_docs.items():
            path = ROOT / src
            if path.is_file():
                add_file(zf, path, dest)

        for path in sorted((ROOT / "src").rglob("*")):
            if not path.is_file() or is_excluded_src_file(path):
                continue
            add_file(zf, path)

    print(f"source_zip={OUT}")
    print(f"size={OUT.stat().st_size}")


if __name__ == "__main__":
    main()
