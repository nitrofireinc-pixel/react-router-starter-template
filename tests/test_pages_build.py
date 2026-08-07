import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist"


def test_pages_build_contains_advanced_worker_and_runtime_module():
    shutil.rmtree(OUTPUT, ignore_errors=True)
    subprocess.run(["npm", "run", "build:pages"], cwd=ROOT, check=True)

    assert (OUTPUT / "_worker.js").is_file()
    assert (OUTPUT / "default-pages.mjs").is_file()
    assert not (OUTPUT / "invoice-logo-rgb.mjs").is_file()
    assert (OUTPUT / "admin.js").is_file()
    assert (OUTPUT / "styles.css").is_file()

    worker = (OUTPUT / "_worker.js").read_text()
    assert "from './default-pages.mjs'" in worker
    assert "from './invoice-logo-rgb.mjs'" not in worker
    assert "dashboard-welcome" in worker
    assert "Trevor Olsen" not in worker
    assert 'id="pages-list"' not in worker
