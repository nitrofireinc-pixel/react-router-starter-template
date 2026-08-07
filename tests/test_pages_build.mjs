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
  assert.equal(existsSync(join(OUTPUT, 'invoice-logo-rgb.mjs')), true);
  assert.equal(existsSync(join(OUTPUT, 'admin.js')), true);
  assert.equal(existsSync(join(OUTPUT, 'styles.css')), true);
  assert.equal(existsSync(join(OUTPUT, 'vendor/jspdf.umd.min.js')), true);

  const worker = readFileSync(join(OUTPUT, '_worker.js'), 'utf8');
  assert.match(worker, /from '\.\/default-pages\.mjs'/);
  assert.match(worker, /from '\.\/invoice-logo-rgb\.mjs'/);
  assert.match(worker, /dashboard-welcome/);
  assert.doesNotMatch(worker, /Trevor Olsen/);
  assert.doesNotMatch(worker, /pages-list/);
});
