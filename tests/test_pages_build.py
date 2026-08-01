import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist"


def test_pages_build_contains_advanced_worker_and_runtime_module():
    shutil.rmtree(OUTPUT, ignore_errors=True)
    subprocess.run(["python3", "worker/scripts/build-pages.py"], cwd=ROOT, check=True)

    assert (OUTPUT / "_worker.js").is_file()
    assert (OUTPUT / "default-pages.mjs").is_file()
    assert (OUTPUT / "admin.js").is_file()
    assert (OUTPUT / "styles.css").is_file()

    worker = (OUTPUT / "_worker.js").read_text()
    assert "from './default-pages.mjs'" in worker
