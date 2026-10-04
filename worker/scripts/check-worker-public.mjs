#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const toml = readFileSync(join(root, 'wrangler.toml'), 'utf8');
const dirMatch = toml.match(/\[assets\][\s\S]*?directory\s*=\s*"([^"]+)"/);

function fail(message) {
  console.error(`check:worker-public failed: ${message}`);
  process.exit(1);
}

if (!dirMatch) fail('wrangler.toml [assets] directory is missing');

const assetsDir = process.env.WORKER_PUBLIC_DIR
  ? process.env.WORKER_PUBLIC_DIR
  : join(root, dirMatch[1].replace(/^\.\//, ''));

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const next = join(dir, name);
    if (statSync(next).isDirectory()) out.push(...walk(next));
    else out.push(next);
  }
  return out;
}

if (!existsSync(assetsDir)) {
  fail(`assets dir missing: ${assetsDir}. Run npm run sync:worker-assets first.`);
}

const tracked = new Set(
  spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).stdout.split(/\r?\n/).filter(Boolean),
);
const files = walk(assetsDir);
const problems = [];

for (const abs of files) {
  const rel = relative(assetsDir, abs).split('\\').join('/');
  if (!tracked.has(rel)) {
    problems.push(`untracked/unexpected file ${rel} (not in git at this path)`);
  }
}

if (problems.length) {
  fail(`assets dir is not a clean copy of tracked files:\n- ${problems.join('\n- ')}`);
}

console.log(`check:worker-public ok (${files.length} files, all git-tracked)`);
