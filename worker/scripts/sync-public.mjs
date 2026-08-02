#!/usr/bin/env node
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = join(ROOT, 'worker/public');

mkdirSync(PUBLIC, { recursive: true });

for (const name of [
  'index.html',
  'calendar.html',
  'contact.html',
  'boosters.html',
  'resources.html',
  'fundraising.html',
  'sponsors.html',
  'directors.html',
  'ensembles.html',
  'maintenance.html',
  'styles.css',
  'script.js',
  'site-content.js',
  'admin.js',
]) {
  cpSync(join(ROOT, name), join(PUBLIC, name));
}

const assetsDest = join(PUBLIC, 'assets');
rmSync(assetsDest, { recursive: true, force: true });
cpSync(join(ROOT, 'assets'), assetsDest, { recursive: true });

console.log(`Synced static assets to ${PUBLIC}`);
