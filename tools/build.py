#!/usr/bin/env python3
"""Run before each release: lists the files the app needs offline (precache.json)
and stamps a new version into sw.js so installed copies update themselves.

    python3 tools/build.py
"""
import hashlib, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git", "tools", ".github", "node_modules"}
SKIP_FILES = {"precache.json", "sw.js", "README.md", "LICENSE", "THIRD_PARTY_LICENSES.md", ".nojekyll", ".gitignore", "CONTRIBUTING.md"}

files, h = [], hashlib.sha256()
for d, dirs, names in os.walk(ROOT):
    dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS)
    for n in sorted(names):
        rel = os.path.relpath(os.path.join(d, n), ROOT).replace(os.sep, "/")
        if rel in SKIP_FILES or "LICENSE" in n or n.endswith(".md") or n.startswith("."):
            continue
        files.append(rel)
        with open(os.path.join(ROOT, rel), "rb") as f:
            h.update(rel.encode()); h.update(f.read())

files.insert(0, "./")
version = h.hexdigest()[:12]
with open(os.path.join(ROOT, "precache.json"), "w") as f:
    json.dump({"version": version, "files": files}, f, indent=0)

sw_path = os.path.join(ROOT, "sw.js")
sw = open(sw_path, encoding="utf-8").read()
sw = re.sub(r'const VERSION = "[^"]*";', f'const VERSION = "{version}";', sw, count=1)
open(sw_path, "w", encoding="utf-8").write(sw)
size = sum(os.path.getsize(os.path.join(ROOT, p)) for p in files[1:])
print(f"version {version}: {len(files)} files, {size/1e6:.1f} MB")
