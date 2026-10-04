import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import {
  publicSquarePublishableConfig,
  publicSitePayload,
  PUBLIC_SITE_KEYS,
  renderSponsorTiersHtml,
} from '../worker/src/worker.mjs';
import { renderPublicReadBootstrap } from '../worker/src/d1-read-policy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const siteContentSrc = readFileSync(join(root, 'site-content.js'), 'utf8');
const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');

test('public Square publishable config exposes application and location IDs only', () => {
  const config = publicSquarePublishableConfig({
    SQUARE_ACCESS_TOKEN: 'EAABsecret-token',
    SQUARE_APPLICATION_ID: 'sq0idp-public-app',
    SQUARE_LOCATION_ID: 'LLOC123',
    SQUARE_ENVIRONMENT: 'production',
  });
  assert.deepEqual(config, {
    application_id: 'sq0idp-public-app',
    location_id: 'LLOC123',
    environment: 'production',
    web_payments: true,
  });
  const serialized = JSON.stringify(config);
  assert.equal(serialized.includes('EAABsecret-token'), false);
  assert.equal(serialized.includes('access_token'), false);
  assert.equal(publicSquarePublishableConfig({}).web_payments, false);
  assert.equal(PUBLIC_SITE_KEYS.includes('square_settings'), false);
  const site = publicSitePayload({
    title: 'East Forsyth Band',
    square_settings: JSON.stringify({
      access_token: 'EAABsecret-token',
      application_id: 'sq0idp-public-app',
    }),
  });
  assert.equal(Object.prototype.hasOwnProperty.call(site, 'square_settings'), false);
  assert.equal(JSON.stringify(site).includes('EAABsecret-token'), false);
  assert.match(workerSrc, /square: publicSquarePublishableConfig\(env\)/);
  assert.match(workerSrc, /Never reads D1 and never returns the access token/);
});

test('public read bootstrap keeps Square IDs and drops any access token', () => {
  const html = renderPublicReadBootstrap({
    site: { title: 'East Forsyth Band' },
    sponsors: [],
    photos: [],
    deadlineBanners: [],
    square: {
      application_id: 'sq0idp-public-app',
      location_id: 'LLOC123',
      environment: 'production',
      web_payments: true,
      access_token: 'EAABsecret-token',
      square_access_token: 'EAABsecret-token',
    },
  });
  const json = html.match(/<script type="application\/json" id="efhs-public-read">([\s\S]*)<\/script>/)[1];
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed.square, {
    application_id: 'sq0idp-public-app',
    location_id: 'LLOC123',
    environment: 'production',
    web_payments: true,
  });
  assert.equal(json.includes('EAABsecret-token'), false);
  assert.equal(json.includes('access_token'), false);
});

test('sponsor tier cards include amount cents for logged-out signup', () => {
  const html = renderSponsorTiersHtml({
    bronze_amount: '$250',
    silver_amount: '$500',
    gold_amount: '$1000',
  });
  assert.match(html, /data-tier="bronze"[^>]*data-amount-cents="25000"/);
  assert.match(html, /data-tier="silver"[^>]*data-amount-cents="50000"/);
  assert.match(html, /data-tier="gold"[^>]*data-amount-cents="100000"/);
});

test('client binds sponsor signup at boot and waits for Square.js instead of spinning', () => {
  const boot = siteContentSrc.match(/function bootPublicSiteContent\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(boot, /bindSponsorTierSignup\(\)/);
  assert.match(boot, /bindDonateButtons\(\)/);
  assert.ok(boot.indexOf('bindSponsorTierSignup()') < boot.indexOf('loadPublicContent()'));
  assert.match(siteContentSrc, /document\.addEventListener\('click', openFromEvent\)/);
  assert.match(siteContentSrc, /function readSquarePublishableConfig\(/);
  assert.match(siteContentSrc, /readPublicBootstrap\(\)\?\.square/);
  assert.match(siteContentSrc, /function loadSquareWebSdk\(/);
  assert.match(siteContentSrc, /script\[data-square-web-sdk\]/);
  assert.match(siteContentSrc, /SQUARE_SDK_TIMEOUT_MS/);
  assert.match(siteContentSrc, /function attachSquareCard\(/);
  assert.match(siteContentSrc, /Could not load the secure card form/);
  assert.equal((siteContentSrc.match(/function loadSquareWebSdk\(/g) || []).length, 1);
});

function camelDataKey(name) {
  return String(name || '').replace(/^data-/, '').replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

class MiniNode {
  constructor(tagName, attrs = {}) {
    this.tagName = String(tagName).toUpperCase();
    this.attrs = {};
    this.children = [];
    this.parentElement = null;
    this.className = '';
    this.dataset = {};
    this.listeners = {};
    this._text = '';
    this.nodeType = 1;
    for (const [key, value] of Object.entries(attrs)) this.setAttribute(key, value);
  }

  get classList() {
    const node = this;
    const tokens = () => String(node.className || '').split(/\s+/).filter(Boolean);
    return {
      contains: (name) => tokens().includes(String(name)),
      add: (name) => {
        const next = new Set(tokens());
        next.add(String(name));
        node.className = [...next].join(' ');
        node.attrs.class = node.className;
      },
    };
  }

  get textContent() {
    if (this.children.length) return this.children.map((child) => child.textContent).join('');
    return this._text;
  }

  set textContent(value) {
    this.children = [];
    this._text = String(value || '');
  }

  getAttribute(name) {
    if (name === 'class') return this.className || null;
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }

  setAttribute(name, value) {
    const raw = String(value);
    this.attrs[name] = raw;
    if (name === 'class') this.className = raw;
    if (name.startsWith('data-')) this.dataset[camelDataKey(name)] = raw;
  }

  hasAttribute(name) {
    if (name === 'class') return Boolean(this.className);
    return Object.prototype.hasOwnProperty.call(this.attrs, name);
  }

  matches(selector) {
    return String(selector || '').split(',').some((part) => matchMini(this, part.trim()));
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches(selector)) return node;
      node = node.parentElement;
    }
    return null;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const found = [];
    const walk = (node) => {
      if (node.matches(selector)) found.push(node);
      node.children.forEach(walk);
    };
    this.children.forEach(walk);
    return found;
  }

  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }

  dispatchEvent(event) {
    let node = this;
    const ev = { ...event, target: this, preventDefault() { ev.defaultPrevented = true; } };
    while (node) {
      for (const fn of node.listeners[event.type] || []) fn(ev);
      node = node.parentElement;
    }
    return !ev.defaultPrevented;
  }
}

function matchMini(node, selector) {
  if (!selector) return false;
  const parts = selector.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) return parts.some((part) => matchMini(node, part));
  if (/\s/.test(selector)) return false;
  let rest = selector;
  const idMatch = rest.match(/#([a-z][\w-]*)/i);
  if (idMatch && node.getAttribute('id') !== idMatch[1]) return false;
  const classes = [...rest.matchAll(/\.([a-z][\w-]*)/gi)].map((match) => match[1]);
  const attrs = [...rest.matchAll(/\[([a-z0-9:-]+)(?:=["']?([^"'\]]+)["']?)?\]/gi)];
  if (classes.some((name) => !node.classList.contains(name))) return false;
  return attrs.every(([, name, value]) => {
    if (!node.hasAttribute(name)) return false;
    if (value == null) return true;
    return node.getAttribute(name) === value;
  });
}

function loadSiteContentApi() {
  const html = new MiniNode('html');
  const head = new MiniNode('head');
  const body = new MiniNode('body');
  html.appendChild(head);
  html.appendChild(body);
  const listeners = {};
  const documentRef = {
    documentElement: html,
    body,
    head,
    getElementById: () => null,
    createElement: (tag) => new MiniNode(tag),
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    querySelector(selector) {
      if (body.matches(selector)) return body;
      return html.querySelector(selector);
    },
    querySelectorAll(selector) {
      const found = [];
      if (body.matches(selector)) found.push(body);
      found.push(...html.querySelectorAll(selector));
      return found;
    },
    _emit(type, target) {
      const event = { type, target, preventDefault() { this.defaultPrevented = true; } };
      for (const fn of listeners[type] || []) fn(event);
      return event;
    },
  };
  const context = vm.createContext({
    document: documentRef,
    location: { pathname: '/become-a-sponsor.html' },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    sessionStorage: { getItem: () => null, setItem: () => {} },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    __EFHS_SKIP_SITE_CONTENT_BOOT: true,
  });
  context.globalThis = context;
  context.window = context;
  vm.runInContext(siteContentSrc, context, { filename: 'site-content.js' });
  return { document: documentRef, body, api: context.__efhsSiteContent, context };
}

test('logged-out sponsor tier cards parse amounts and bind before /api/site returns', () => {
  const { document, body, api } = loadSiteContentApi();
  const card = new MiniNode('article', { class: 'sponsor-tier', 'data-tier': 'bronze', 'data-amount-cents': '25000' });
  const amount = new MiniNode('p', { class: 'sponsor-tier-amount', 'data-cms-field': 'bronze_amount' });
  amount.textContent = '$250';
  const title = new MiniNode('h3');
  title.textContent = 'Bronze Sponsor';
  card.appendChild(title);
  card.appendChild(amount);
  body.appendChild(card);

  api.bindSponsorTierSignup();
  assert.equal(card.classList.contains('sponsor-tier-clickable'), true);
  assert.equal(card.getAttribute('role'), 'button');
  const bronze = JSON.parse(JSON.stringify(api.readTierPackageFromCard(card)));
  assert.deepEqual(bronze, {
    tier: 'bronze',
    title: 'Bronze Sponsor',
    amountCents: 25000,
    amountDisplay: '$250',
  });

  const empty = new MiniNode('article', { class: 'sponsor-tier', 'data-tier': 'silver' });
  empty.appendChild(Object.assign(new MiniNode('h3'), { textContent: 'Silver Sponsor' }));
  assert.equal(api.readTierPackageFromCard(empty), null);
  assert.equal(typeof document.addEventListener, 'function');
});

test('attachSquareCard refuses to start without public application and location IDs', async () => {
  const { api } = loadSiteContentApi();
  await assert.rejects(
    () => api.attachSquareCard({ application_id: '', location_id: '' }, '#donate-square-card'),
    /Square card form is not configured/,
  );
  await assert.rejects(
    () => api.attachSquareCard({ application_id: 'sq0idp-app' }, '#donate-square-card'),
    /Square card form is not configured/,
  );
});
