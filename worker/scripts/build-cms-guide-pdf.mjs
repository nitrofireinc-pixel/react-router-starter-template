#!/usr/bin/env node
/**
 * Rebuild assets/downloads/EFHS-Band-Website-CMS-Guide.pdf from the HTML source.
 * Uses headless Chrome so the committed PDF stays a real binary (not Word HTML).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = join(ROOT, 'assets/downloads/EFHS-Band-Website-CMS-Guide-Super-Admin.html');
const PDF = join(ROOT, 'assets/downloads/EFHS-Band-Website-CMS-Guide-Super-Admin.pdf');
const PROFILE = join('/tmp', `efhs-cms-guide-chrome-${process.pid}`);

const chromeCandidates = [
  process.env.CHROME_PATH,
  '/opt/google/chrome/chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/local/bin/google-chrome',
].filter(Boolean);

const chrome = chromeCandidates.find((path) => existsSync(path));
if (!chrome) {
  console.error('Chrome not found. Set CHROME_PATH or install Google Chrome.');
  process.exit(1);
}
if (!existsSync(HTML)) {
  console.error(`Missing guide source: ${HTML}`);
  process.exit(1);
}

mkdirSync(PROFILE, { recursive: true });
const result = spawnSync(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  `--user-data-dir=${PROFILE}`,
  `--print-to-pdf=${PDF}`,
  '--no-pdf-header-footer',
  `file://${HTML}`,
], {
  encoding: 'utf8',
  timeout: 60_000,
});

rmSync(PROFILE, { recursive: true, force: true });

if (result.status !== 0 || !existsSync(PDF)) {
  console.error(result.stderr || result.stdout || 'Failed to build CMS guide PDF.');
  process.exit(result.status || 1);
}

console.log(`Built ${PDF}`);
