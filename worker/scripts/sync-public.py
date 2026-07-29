#!/usr/bin/env python3
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "worker" / "public"
PUBLIC.mkdir(parents=True, exist_ok=True)

for name in [
    "index.html",
    "calendar.html",
    "contact.html",
    "boosters.html",
    "resources.html",
    "fundraising.html",
    "sponsors.html",
    "directors.html",
    "ensembles.html",
    "styles.css",
    "script.js",
    "site-content.js",
    "admin.js",
]:
    shutil.copy2(ROOT / name, PUBLIC / name)

assets_src = ROOT / "assets"
assets_dest = PUBLIC / "assets"
if assets_dest.exists():
    shutil.rmtree(assets_dest)
shutil.copytree(assets_src, assets_dest)
print(f"Synced static assets to {PUBLIC}")
