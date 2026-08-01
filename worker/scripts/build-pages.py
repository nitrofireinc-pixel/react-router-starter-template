#!/usr/bin/env python3
"""Build an Advanced Mode Cloudflare Pages deployment directory."""

from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "worker" / "public"
SOURCE = ROOT / "worker" / "src"
OUTPUT = ROOT / "dist"

if not PUBLIC.is_dir():
    raise SystemExit(f"Missing prepared public assets: {PUBLIC}")

shutil.rmtree(OUTPUT, ignore_errors=True)
shutil.copytree(PUBLIC, OUTPUT)
shutil.copy2(SOURCE / "worker.mjs", OUTPUT / "_worker.js")
shutil.copy2(SOURCE / "default-pages.mjs", OUTPUT / "default-pages.mjs")

print(f"Built Cloudflare Pages output: {OUTPUT}")
