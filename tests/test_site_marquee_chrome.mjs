import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const siteContentSrc = readFileSync(join(root, 'site-content.js'), 'utf8');

function camelDataKey(name) {
  return String(name || '').replace(/^data-/, '').replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function hierarchyError() {
  const error = new Error("Failed to execute 'appendChild' on 'Node': The new child element contains the parent.");
  error.name = 'HierarchyRequestError';
  return error;
}

class FakeNode {
  constructor(tagName, attrs = {}) {
    this.tagName = String(tagName).toUpperCase();
    this.attrs = {};
    this.children = [];
    this.parentElement = null;
    this.parentNode = null;
    this.className = '';
    this.hidden = false;
    this.innerHTML = '';
    this.dataset = {};
    this.nodeType = 1;
    for (const [key, value] of Object.entries(attrs)) {
      this.setAttribute(key, value);
    }
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
      remove: (name) => {
        node.className = tokens().filter((token) => token !== String(name)).join(' ');
        node.attrs.class = node.className;
      },
    };
  }

  get previousElementSibling() {
    if (!this.parentElement) return null;
    const kids = this.parentElement.children;
    const index = kids.indexOf(this);
    return index > 0 ? kids[index - 1] : null;
  }

  getAttribute(name) {
    if (name === 'class') return this.className || null;
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }

  setAttribute(name, value) {
    const raw = String(value);
    this.attrs[name] = raw;
    if (name === 'class') this.className = raw;
    if (name === 'hidden') this.hidden = raw !== 'false';
    if (name.startsWith('data-')) this.dataset[camelDataKey(name)] = raw;
  }

  hasAttribute(name) {
    if (name === 'class') return Boolean(this.className);
    return Object.prototype.hasOwnProperty.call(this.attrs, name);
  }

  matches(selector) {
    return String(selector || '').split(',').map((part) => part.trim()).filter(Boolean)
      .some((part) => matchSelector(this, part));
  }

  contains(node) {
    if (this === node) return true;
    return this.children.some((child) => child.contains(node));
  }

  appendChild(child) {
    if (!child) return child;
    if (child === this || child.contains(this)) throw hierarchyError();
    detach(child);
    child.parentElement = this;
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertBefore(node, ref) {
    if (!node) return node;
    if (node === this || node.contains(this)) throw hierarchyError();
    detach(node);
    node.parentElement = this;
    node.parentNode = this;
    const index = ref ? this.children.indexOf(ref) : -1;
    if (index < 0) this.children.push(node);
    else this.children.splice(index, 0, node);
    return node;
  }

  after(node) {
    if (!this.parentElement) return node;
    const kids = this.parentElement.children;
    const index = kids.indexOf(this);
    const ref = index >= 0 ? kids[index + 1] : null;
    return this.parentElement.insertBefore(node, ref || null);
  }

  remove() {
    detach(this);
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
}

function detach(node) {
  if (!node?.parentElement) {
    if (node) {
      node.parentElement = null;
      node.parentNode = null;
    }
    return;
  }
  node.parentElement.children = node.parentElement.children.filter((child) => child !== node);
  node.parentElement = null;
  node.parentNode = null;
}

function matchSelector(node, selector) {
  let rest = String(selector || '').trim();
  const nots = [];
  rest = rest.replace(/:not\(([^)]+)\)/g, (_, inner) => {
    nots.push(inner.trim());
    return '';
  });
  let tag = null;
  const tagMatch = rest.match(/^[a-z][\w-]*/i);
  if (tagMatch && !rest.startsWith('.') && !rest.startsWith('[')) {
    tag = tagMatch[0].toUpperCase();
    rest = rest.slice(tagMatch[0].length);
  }
  const classes = [...rest.matchAll(/\.([a-z][\w-]*)/gi)].map((match) => match[1]);
  const attrs = [...rest.matchAll(/\[([a-z0-9:-]+)\]/gi)].map((match) => match[1]);
  if (tag && node.tagName !== tag) return false;
  if (classes.some((name) => !node.classList.contains(name))) return false;
  if (attrs.some((name) => !node.hasAttribute(name))) return false;
  return nots.every((inner) => !matchSelector(node, inner));
}

function makeDocument({ marqueeFlag = 'off', includeMarquee = false, pathname = '/contact.html' } = {}) {
  const html = new FakeNode('html');
  const body = new FakeNode('body', { class: 'efhs-theme', 'data-sponsor-marquee': marqueeFlag });
  html.appendChild(body);
  const header = new FakeNode('header', { class: 'site-header' });
  const brand = new FakeNode('a', { class: 'brand', href: '/' });
  header.appendChild(brand);
  body.appendChild(header);
  let marquee = null;
  if (includeMarquee) {
    marquee = new FakeNode('section', {
      class: 'sponsor-marquee-section',
      'data-sponsor-marquee': '',
      'aria-label': 'Sponsor marquee',
    });
    const track = new FakeNode('div', { class: 'sponsor-marquee-track' });
    track.innerHTML = '<a class="sponsor-marquee-item">Sponsor</a>';
    marquee.appendChild(track);
    body.appendChild(marquee);
  }
  const main = new FakeNode('main', { id: 'main' });
  main.innerHTML = '<h1>Page</h1><p>Visible content</p>';
  body.appendChild(main);

  const documentRef = {
    documentElement: html,
    body,
    createElement: (tag) => new FakeNode(tag),
    addEventListener() {},
    querySelector(selector) {
      if (html.matches(selector)) return html;
      if (body.matches(selector)) return body;
      return html.querySelector(selector);
    },
    querySelectorAll(selector) {
      const found = [];
      if (html.matches(selector)) found.push(html);
      if (body.matches(selector)) found.push(body);
      found.push(...html.querySelectorAll(selector));
      return found;
    },
  };

  const context = vm.createContext({
    document: documentRef,
    location: { pathname },
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    sessionStorage: { getItem: () => null, setItem: () => {} },
    fetch: async () => ({ ok: true, json: async () => ([]) }),
    __EFHS_SKIP_SITE_CONTENT_BOOT: true,
  });
  context.globalThis = context;
  context.window = context;
  vm.runInContext(siteContentSrc, context, { filename: 'site-content.js' });
  return { document: documentRef, body, header, main, marquee, api: context.__efhsSiteContent, context };
}

test('client marquee helpers never treat body as the marquee slot', () => {
  assert.match(siteContentSrc, /function querySponsorMarqueeSlots\(/);
  assert.match(siteContentSrc, /\[data-sponsor-marquee\]:not\(html\):not\(body\)/);
  assert.match(siteContentSrc, /function canPlaceInSiteChrome\(/);
  assert.doesNotMatch(siteContentSrc, /querySelector(?:All)?\('\[data-sponsor-marquee\]'\)/);
});

test('hydrateMarqueeFromCache on a no-marquee CMS page keeps body and main', () => {
  const { document, body, main, api } = makeDocument({
    marqueeFlag: 'off',
    includeMarquee: false,
    pathname: '/contact.html',
  });
  assert.equal(api.sponsorMarqueeEnabled(), false);
  assert.equal(document.querySelector('[data-sponsor-marquee]'), body);
  assert.equal(api.querySponsorMarqueeSlot(), null);
  assert.doesNotThrow(() => api.hydrateMarqueeFromCache());
  assert.equal(document.body, body);
  assert.ok(document.body.contains(main));
  assert.equal(document.body.parentElement, document.documentElement);
  assert.equal(api.querySponsorMarqueeSlots().length, 0);
});

test('removeSponsorMarquee does not delete body when the flag lives on body', () => {
  const { document, body, main, api } = makeDocument({
    marqueeFlag: 'off',
    includeMarquee: false,
    pathname: '/gallery.html',
  });
  api.removeSponsorMarquee();
  assert.equal(document.body, body);
  assert.ok(document.body.contains(main));
});

test('ensureSiteChrome refuses to append body into the header chrome', () => {
  const { header, body, main, api } = makeDocument({
    marqueeFlag: 'on',
    includeMarquee: false,
    pathname: '/sponsors.html',
  });
  assert.doesNotThrow(() => api.ensureSiteChrome(header, body, null));
  assert.equal(header.parentElement.className, 'site-chrome');
  assert.equal(body.contains(header), true);
  assert.ok(body.contains(main));
  assert.notEqual(header.parentElement, body);
});

test('hydrate on a marquee page wraps the real section, not body', () => {
  const { document, body, header, marquee, api } = makeDocument({
    marqueeFlag: 'on',
    includeMarquee: true,
    pathname: '/sponsors.html',
  });
  assert.equal(api.sponsorMarqueeEnabled(), true);
  assert.equal(api.querySponsorMarqueeSlot(), marquee);
  assert.doesNotThrow(() => api.hydrateMarqueeFromCache());
  assert.equal(document.body, body);
  assert.equal(marquee.parentElement.className, 'site-chrome');
  assert.equal(header.parentElement, marquee.parentElement);
  assert.notEqual(marquee, body);
});
