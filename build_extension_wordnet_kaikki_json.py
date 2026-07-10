#!/usr/bin/env python3
"""Convert the wordnet+kaikki app jsonl into a compact word-keyed JSON for the
browser extension's builtin dictionary loader (bg/js/builtin.js).

Output shape (compact keys keep the ~130MB file as small as possible):

    {
      "<lowercased word>": [
        { "p": "<pos>", "r": "<reading>",
          "s": [ { "d": "<def>", "t": "<translation>",
                   "x": ["<example>", ...], "xt": ["<example tran>", ...] } ] }
      ]
    }

Empty fields are omitted. Entries that share a word (e.g. different POS) are
grouped into the list under that word.
"""
import json
import shutil
import sys

SRC = "wordnet_kaikki_data/combined_wordnet_kaikki_phrase_app_dictionary_tw.jsonl"
OUT = "src/data/wordnet_kaikki.json"


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else SRC
    out = sys.argv[2] if len(sys.argv) > 2 else OUT

    table = {}
    lines = 0
    with open(src, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            lines += 1
            obj = json.loads(line)
            word = (obj.get("word") or "").strip()
            if not word:
                continue
            key = word.lower()

            senses = []
            for sense in obj.get("senses", []):
                compact = {}
                d = (sense.get("def") or "").strip()
                t = (sense.get("translation") or "").strip()
                if d:
                    compact["d"] = d
                if t:
                    compact["t"] = t
                examples = [e for e in (sense.get("examples") or []) if e and e.strip()]
                if examples:
                    compact["x"] = examples
                    ex_trans = sense.get("example_translations") or []
                    # keep example translations only when at least one is non-empty
                    if any(x and x.strip() for x in ex_trans):
                        compact["xt"] = ex_trans
                if compact:
                    senses.append(compact)

            if not senses:
                continue

            entry = {}
            pos = (obj.get("pos") or "").strip()
            reading = (obj.get("reading") or "").strip()
            if pos:
                entry["p"] = pos
            if reading:
                entry["r"] = reading
            entry["s"] = senses

            table.setdefault(key, []).append(entry)

    with open(out, "w", encoding="utf-8") as fh:
        json.dump(table, fh, ensure_ascii=False, separators=(",", ":"))

    # Version stamp so the extension's IndexedDB import only re-runs when the
    # data actually changes (builtin.js fetches this tiny file to decide).
    import hashlib
    with open(out, "rb") as fh:
        digest = hashlib.sha1(fh.read()).hexdigest()
    with open(out + ".version", "w", encoding="utf-8") as fh:
        fh.write(digest)

    # Also emit a gzipped copy. The Firefox build ships only the .gz (the raw
    # JSON exceeds AMO's file-size scanner limit); builtin.js inflates it via
    # DecompressionStream. The .version hashes the raw JSON, so it stays valid.
    import gzip
    with open(out, "rb") as fh_in, gzip.open(out + ".gz", "wb", compresslevel=9) as fh_out:
        shutil.copyfileobj(fh_in, fh_out)

    print(f"read {lines} lines -> {len(table)} unique word keys")
    print(f"wrote {out}")
    print(f"wrote {out}.gz")
    print(f"wrote {out}.version = {digest[:12]}")


if __name__ == "__main__":
    main()
