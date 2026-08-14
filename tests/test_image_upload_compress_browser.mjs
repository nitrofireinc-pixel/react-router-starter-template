/**
 * Browser-side compress checks for 2 MB image endpoints (1.8 MB client target).
 * Skips if Playwright Chromium is unavailable in this environment.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = join(ROOT, 'tests/.tmp-image-upload');

function makePngBuffer(width, height, seed = 7) {
  // Uncompressed-ish PNG via raw canvas in browser is easier; here build a simple BMP-like
  // payload as a data URL generator script instead. This helper only creates a tiny valid PNG.
  // For large files we generate them in the browser with canvas.
  void width; void height; void seed;
  return null;
}

test('browser prepareImageFileForUpload enforces 1.8 MB for oversized photos', async (t) => {
  let chromium;
  try {
    const playwright = await import('playwright').catch(() => null);
    if (!playwright?.chromium) {
      // Try npx install on demand once.
      const install = spawnSync('npx', ['--yes', 'playwright@1.54.2', 'install', 'chromium'], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 180_000,
      });
      if (install.status !== 0) {
        t.skip('Playwright Chromium unavailable for browser compress tests');
        return;
      }
      const retry = await import('playwright');
      chromium = retry.chromium;
    } else {
      chromium = playwright.chromium;
    }
  } catch {
    t.skip('Playwright not available');
    return;
  }

  mkdirSync(TMP, { recursive: true });
  const pageHtml = `<!doctype html><html><body>
<script src="${pathToFileURL(join(ROOT, 'image-upload.js')).href}"></script>
<script>
async function makeJpegFile(bytesTarget, name) {
  const canvas = document.createElement('canvas');
  // Large noisy canvas compresses poorly enough to exceed 1.8MB at high quality.
  let dim = 2800;
  let file = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    canvas.width = dim;
    canvas.height = dim;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(dim, dim);
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = (i * 37 + attempt * 13) % 256;
      image.data[i + 1] = (i * 91 + attempt * 29) % 256;
      image.data[i + 2] = (i * 17 + attempt * 7) % 256;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.98));
    file = new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
    if (file.size >= bytesTarget) return file;
    dim += 400;
  }
  return file;
}
window.__run = async () => {
  const api = window.EfhsImageUpload;
  const under = await makeJpegFile(200_000, 'under.jpg');
  // Force under target by taking a small canvas.
  const smallCanvas = document.createElement('canvas');
  smallCanvas.width = 640; smallCanvas.height = 480;
  const sctx = smallCanvas.getContext('2d');
  sctx.fillStyle = '#224466'; sctx.fillRect(0,0,640,480);
  const smallBlob = await new Promise((r) => smallCanvas.toBlob(r, 'image/jpeg', 0.85));
  const smallFile = new File([smallBlob], 'small.jpg', { type: 'image/jpeg' });

  const between = await makeJpegFile(1_850_000, 'between.jpg');
  const over2 = await makeJpegFile(2_100_000, 'over2.jpg');

  const preparedSmall = await api.prepareImageFileForUpload(smallFile);
  const preparedBetween = await api.prepareImageFileForUpload(between);
  const preparedOver = await api.prepareImageFileForUpload(over2);

  return {
    target: api.CLIENT_TARGET_BYTES,
    server: api.SERVER_MAX_BYTES,
    small: { in: smallFile.size, out: preparedSmall.size, same: preparedSmall === smallFile },
    between: { in: between.size, out: preparedBetween.size },
    over2: { in: over2.size, out: preparedOver.size },
  };
};
</script></body></html>`;
  const htmlPath = join(TMP, 'compress.html');
  writeFileSync(htmlPath, pageHtml);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href);
    const result = await page.evaluate(async () => window.__run());
    assert.equal(result.target, 1_800_000);
    assert.equal(result.server, 1_900_000);
    assert.ok(result.small.in <= 1_800_000);
    assert.equal(result.small.same, true);
    assert.ok(result.small.out <= 1_800_000);
    assert.ok(result.between.in > 1_800_000, `expected between fixture > 1.8MB, got ${result.between.in}`);
    assert.ok(result.between.out <= 1_800_000, `between processed ${result.between.out}`);
    assert.ok(result.over2.in > 2_000_000 || result.over2.in > 1_900_000, `expected over2 fixture large, got ${result.over2.in}`);
    assert.ok(result.over2.out <= 1_800_000, `over2 processed ${result.over2.out}`);
  } finally {
    await browser.close();
    rmSync(TMP, { recursive: true, force: true });
  }
});

// Keep lint quiet for unused helper in environments that skip browser generation.
void makePngBuffer;
