#!/usr/bin/env node
/** Build an Advanced Mode Cloudflare Pages deployment directory. */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = join(ROOT, 'worker/public');
const SOURCE = join(ROOT, 'worker/src');
const OUTPUT = join(ROOT, 'dist');

if (!existsSync(PUBLIC)) {
  console.error(`Missing prepared public assets: ${PUBLIC}`);
  process.exit(1);
}

rmSync(OUTPUT, { recursive: true, force: true });
cpSync(PUBLIC, OUTPUT, { recursive: true });
cpSync(join(SOURCE, 'worker.mjs'), join(OUTPUT, '_worker.js'));
cpSync(join(SOURCE, 'default-pages.mjs'), join(OUTPUT, 'default-pages.mjs'));
cpSync(join(SOURCE, 'invoice-logo-rgb.mjs'), join(OUTPUT, 'invoice-logo-rgb.mjs'));
cpSync(join(SOURCE, 'web-push-browser'), join(OUTPUT, 'web-push-browser'), { recursive: true });

console.log(`Built Cloudflare Pages output: ${OUTPUT}`);
