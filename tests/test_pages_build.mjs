import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUTPUT = join(ROOT, 'dist');

test('pages build contains advanced worker and runtime module', () => {
  rmSync(OUTPUT, { recursive: true, force: true });
  const sync = spawnSync('node', ['worker/scripts/sync-public.mjs'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(sync.status, 0, sync.stderr || sync.stdout);
  const build = spawnSync('node', ['worker/scripts/build-pages.mjs'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr || build.stdout);

  assert.equal(existsSync(join(OUTPUT, '_worker.js')), true);
  assert.equal(existsSync(join(OUTPUT, 'default-pages.mjs')), true);
  assert.equal(existsSync(join(OUTPUT, 'admin-audit-log.mjs')), true);
  assert.equal(existsSync(join(OUTPUT, 'inkind-forms.mjs')), true);
  assert.equal(existsSync(join(OUTPUT, 'admin.js')), true);
  assert.equal(existsSync(join(OUTPUT, 'styles.css')), true);
  assert.equal(existsSync(join(OUTPUT, 'push-sw.js')), true);
  assert.equal(existsSync(join(OUTPUT, 'manifest.webmanifest')), true);
  assert.equal(existsSync(join(OUTPUT, 'web-push-browser/index.js')), true);
  assert.equal(existsSync(join(OUTPUT, 'vendor/jspdf.umd.min.js')), true);

  const worker = readFileSync(join(OUTPUT, '_worker.js'), 'utf8');
  assert.match(worker, /from '\.\/default-pages\.mjs'/);
  assert.match(worker, /from '\.\/admin-audit-log\.mjs'/);
  assert.match(worker, /from '\.\/inkind-forms\.mjs'/);
  assert.match(worker, /from '\.\/web-push-browser\/index\.js'/);
  assert.match(worker, /dashboard-welcome/);
  assert.match(worker, /data-notify-me/);
  assert.match(worker, /web_push_subscriptions/);
  assert.doesNotMatch(worker, /Trevor Olsen/);
  // Legacy CMS pages-list tab should stay gone (do not flag zernio-facebook-pages-list).
  assert.doesNotMatch(worker, /id=["']pages-list["']/);
  assert.doesNotMatch(worker, /#pages-list\b/);
});
