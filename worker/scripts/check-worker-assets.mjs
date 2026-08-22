#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const toml = readFileSync(join(root, 'wrangler.toml'), 'utf8');

function fail(message) {
  console.error(`check:worker-assets failed: ${message}`);
  process.exit(1);
}

if (!/directory\s*=\s*"\.\/worker\/public"/.test(toml)) {
  fail('wrangler.toml [assets] directory must be "./worker/public" (not "./assets"). Deploying with ./assets 404s styles.css/script.js on efhsband.org.');
}
if (!/run_worker_first\s*=\s*true/.test(toml)) {
  fail('wrangler.toml must set run_worker_first = true so the Worker serves CMS HTML ahead of static assets.');
}
if (!/efhsband\.org\/\*/.test(toml)) {
  fail('wrangler.toml must keep the efhsband.org/* route so Worker deploys continue serving the live domain.');
}
if (!/^name\s*=\s*"efhsband-live"/m.test(toml)) {
  fail('wrangler.toml name must be "efhsband-live" — that Worker owns the efhsband.org route and production secrets. Deploying as "efhsband" only updates workers.dev.');
}

console.log('check:worker-assets ok');
