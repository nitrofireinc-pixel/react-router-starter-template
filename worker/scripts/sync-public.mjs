#!/usr/bin/env node
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = join(ROOT, 'worker/public');

mkdirSync(PUBLIC, { recursive: true });

for (const name of [
  'index.html',
  'maintenance.html',
  'calendar.html',
  'caldev.html',
  'contact.html',
  'boosters.html',
  'dues-dev.html',
  'gallery.html',
  'resources.html',
  'fundraising.html',
  'sponsors.html',
  'become-a-sponsor.html',
  'in-kind.html',
  'letterman-jacket.html',
  'qr.html',
  'sponsor-payment-complete.html',
  'directors.html',
  'ensembles.html',
  'styles.css',
  'public-theme.css',
  'home-redesign.css',
  'error-page.css',
  'script.js',
  'site-content.js',
  'caldev.js',
  'admin-caldev.js',
  'admin.js',
  'admin-nav.js',
  'admin-nav.css',
  'admin-visual.js',
  'admin-visual.css',
  'badge-creator.js',
  'badge-creator-admin.js',
  'push-sw.js',
  'manifest.webmanifest',
  '_headers',
]) {
  cpSync(join(ROOT, name), join(PUBLIC, name));
}

const assetsDest = join(PUBLIC, 'assets');
rmSync(assetsDest, { recursive: true, force: true });
cpSync(join(ROOT, 'assets'), assetsDest, { recursive: true });

const vendorDest = join(PUBLIC, 'vendor');
mkdirSync(vendorDest, { recursive: true });
cpSync(join(ROOT, 'vendor/jspdf.umd.min.js'), join(vendorDest, 'jspdf.umd.min.js'));
const grapesDest = join(vendorDest, 'grapesjs');
mkdirSync(grapesDest, { recursive: true });
cpSync(join(ROOT, 'vendor/grapesjs/grapes.min.js'), join(grapesDest, 'grapes.min.js'));
cpSync(join(ROOT, 'vendor/grapesjs/grapes.min.css'), join(grapesDest, 'grapes.min.css'));

console.log(`Synced static assets to ${PUBLIC}`);
