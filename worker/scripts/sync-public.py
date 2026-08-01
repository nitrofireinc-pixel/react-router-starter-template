#!/usr/bin/env python3
"""Compatibility wrapper — prefer `node worker/scripts/sync-public.mjs`."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
raise SystemExit(subprocess.call(["node", str(ROOT / "worker/scripts/sync-public.mjs")], cwd=ROOT))
