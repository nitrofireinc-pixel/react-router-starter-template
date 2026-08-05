function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function decodeBasicHtmlEntities(value) {
  let text = String(value ?? '');
  for (let i = 0; i < 3; i += 1) {
    const next = text
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;/gi, "'")
      .replace(/&#x0*27;/gi, "'");
    if (next === text) break;
    text = next;
  }
  return text;
}

function looksLikeHtml(value) {
  return /<\/?[a-z][^>]*>/i.test(String(value || ''));
}

function looksLikeInlineRichHtml(value) {
  return /<\/?(?:span|strong|b|em|i|u|br)(?:\s|>|\/)/i.test(String(value || ''));
}

function sanitizeStyleAttribute(attrs) {
  const match = String(attrs || '').match(/style\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  if (!match) return '';
  const parts = [];
  for (const declaration of String(match[1] || match[2] || '').split(';')) {
    const [rawProp, ...rest] = declaration.split(':');
    if (!rawProp || !rest.length) continue;
    const prop = rawProp.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (prop === 'color' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i.test(value)) parts.push(`color: ${value}`);
    if (prop === 'font-size' && /^[\d.]+\s*(px|em|rem|%)$/i.test(value)) parts.push(`font-size: ${value}`);
  }
  return parts.join('; ');
}

function normalizeCssEmphasisMarkup(dirty) {
  return String(dirty || '')
    .replace(/<span\b([^>]*)style\s*=\s*(["'])([\s\S]*?)\2([^>]*)>([\s\S]*?)<\/span>/gi, (match, pre, _q, style, post, inner) => {
      const decls = String(style || '');
      let nextInner = inner;
      let nextStyle = decls;
      if (/(?:^|;)\s*font-weight\s*:\s*(bold|[7-9]00|bolder)\s*(?:;|$)/i.test(decls)) {
        nextInner = `<strong>${nextInner}</strong>`;
        nextStyle = nextStyle.replace(/(?:^|;)\s*font-weight\s*:\s*[^;]+/ig, ';');
      }
      if (/(?:^|;)\s*font-style\s*:\s*italic\s*(?:;|$)/i.test(decls)) {
        nextInner = `<em>${nextInner}</em>`;
        nextStyle = nextStyle.replace(/(?:^|;)\s*font-style\s*:\s*[^;]+/ig, ';');
      }
      if (/(?:^|;)\s*text-decoration(?:-line)?\s*:[^;]*underline/i.test(decls)) {
        nextInner = `<u>${nextInner}</u>`;
        nextStyle = nextStyle.replace(/(?:^|;)\s*text-decoration(?:-line)?\s*:\s*[^;]+/ig, ';');
      }
      nextStyle = nextStyle.replace(/;{2,}/g, ';').replace(/^;|;$/g, '').trim();
      const attrs = `${pre || ''} style="${nextStyle}" ${post || ''}`.replace(/\s+/g, ' ').trim();
      if (!nextStyle) return nextInner;
      return `<span ${attrs}>${nextInner}</span>`;
    });
}

function sanitizeRichHtml(dirty) {
  let html = normalizeCssEmphasisMarkup(dirty)
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
  const allowed = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'span', 'ul', 'ol', 'li', 'div', 'h2', 'h3']);
  html = html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, rawTag, attrs) => {
    const tag = rawTag.toLowerCase();
    if (!allowed.has(tag)) return '';
    if (match.startsWith('</')) return `</${tag}>`;
    if (tag === 'br') return '<br>';
    if (tag === 'span') {
      const style = sanitizeStyleAttribute(attrs);
      return style ? `<span style="${style}">` : '<span>';
    }
    if (tag === 'div') {
      const classMatch = String(attrs || '').match(/class\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      const className = String(classMatch?.[1] || classMatch?.[2] || '')
        .split(/\s+/)
        .filter((name) => ['kicker', 'tag', 'draft'].includes(name))
        .join(' ');
      return className ? `<div class="${className}">` : '<div>';
    }
    return `<${tag}>`;
  });
  html = html
    .replace(/<span(?:\s[^>]*)?>\s*(<br\s*\/?>)\s*<\/span>/gi, '$1')
    .replace(/(?:<br>\s*){3,}/gi, '<br><br>')
    .trim();
  if (!html) return '';
  if (!/<(?:p|div|h2|h3|ul|ol)[\s>]/i.test(html)) html = `<p>${html}</p>`;
  return html;
}

function sanitizeInlineRichHtml(dirty) {
  let html = normalizeCssEmphasisMarkup(dirty)
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<\/?(p|div|ul|ol|li|h[1-6]|section|article)[^>]*>/gi, ' ');
  const allowed = new Set(['br', 'strong', 'b', 'em', 'i', 'u', 'span']);
  html = html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, rawTag, attrs) => {
    const tag = rawTag.toLowerCase();
    if (!allowed.has(tag)) return '';
    if (match.startsWith('</')) return `</${tag}>`;
    if (tag === 'br') return '<br>';
    if (tag === 'span') {
      const style = sanitizeStyleAttribute(attrs);
      return style ? `<span style="${style}">` : '<span>';
    }
    return `<${tag}>`;
  });
  return html.replace(/\s+/g, ' ').replace(/(?:<br>\s*){2,}/gi, '<br>').trim();
}

function paragraphsFromText(value) {
  return String(value || '')
    .split(/\n\s*\n/)
    .map((part) => decodeBasicHtmlEntities(part).trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part)}</p>`)
    .join('') || (String(value || '').trim() ? `<p>${escapeHtml(decodeBasicHtmlEntities(String(value).trim()))}</p>` : '');
}

function formatInlineRichText(value, fallback = '') {
  const raw = String(value ?? '');
  const source = raw.trim() ? raw : String(fallback || '');
  if (!source.trim()) return '';
  return looksLikeInlineRichHtml(source)
    ? sanitizeInlineRichHtml(source)
    : escapeHtml(decodeBasicHtmlEntities(source));
}

function formatRichText(value, fallback = '') {
  const raw = String(value ?? '');
  const source = raw.trim() ? raw : String(fallback || '');
  if (!source.trim()) return '';
  return looksLikeHtml(source) ? sanitizeRichHtml(source) : paragraphsFromText(source);
}

function isHomePage() {
  const path = (location.pathname || '/').replace(/\/+$/, '') || '/';
  return path === '/' || path.endsWith('/index.html') || /(^|\/)index\.html$/i.test(path);
}

function pickRandomSponsor(sponsors) {
  if (!Array.isArray(sponsors) || !sponsors.length) return null;
  return sponsors[Math.floor(Math.random() * sponsors.length)];
}

function dismissSponsorAd(root) {
  if (!root) return;
  root.classList.add('is-leaving');
  root.classList.remove('is-visible');
  document.body.classList.remove('sponsor-flyin-open');
  window.setTimeout(() => root.remove(), 420);
}

function normalizeSponsorAdSeconds(value, fallback = 6) {
  const raw = Number(value);
  const base = Number.isFinite(raw) ? raw : Number(fallback);
  const seconds = Math.round(Number.isFinite(base) ? base : 6);
  return Math.min(30, Math.max(2, seconds));
}

function showHomepageSponsorAd(sponsor, durationSeconds = 6) {
  if (!sponsor || document.querySelector('.sponsor-flyin')) return;

  const logo = sponsor.logo_url
    ? `<span class="sponsor-flyin-logo"><img src="${escapeHtml(sponsor.logo_url)}" alt="${escapeHtml(sponsor.name)} logo"></span>`
    : `<span class="sponsor-flyin-mark" aria-hidden="true">${escapeHtml(sponsor.mark_text || '★')}</span>`;

  const root = document.createElement('aside');
  root.className = 'sponsor-flyin';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Featured sponsor');
  root.innerHTML = `
    <button type="button" class="sponsor-flyin-backdrop" aria-label="Dismiss sponsor ad"></button>
    <div class="sponsor-flyin-panel">
      <button type="button" class="sponsor-flyin-close" aria-label="Close sponsor ad">×</button>
      <a class="sponsor-flyin-card" href="/sponsors.html">
        ${logo}
        <div class="sponsor-flyin-copy">
          <span class="sponsor-flyin-kicker">${escapeHtml(sponsor.tier_label || 'Community')} Partner</span>
          <strong>${escapeHtml(sponsor.name)}</strong>
          <span>${escapeHtml(sponsor.level || 'Sponsor')}</span>
          <em>View all sponsors</em>
        </div>
      </a>
    </div>
  `;

  document.body.appendChild(root);
  document.body.classList.add('sponsor-flyin-open');
  requestAnimationFrame(() => root.classList.add('is-visible'));

  const close = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    dismissSponsorAd(root);
  };
  root.querySelector('.sponsor-flyin-close')?.addEventListener('click', close);
  root.querySelector('.sponsor-flyin-backdrop')?.addEventListener('click', close);

  const durationMs = normalizeSponsorAdSeconds(durationSeconds, 6) * 1000;
  window.setTimeout(() => {
    if (document.body.contains(root)) dismissSponsorAd(root);
  }, durationMs);
}

function sponsorShowsFlyin(sponsor = {}) {
  if (Number(sponsor.active) === 0) return false;
  if (sponsor.show_flyin === true || sponsor.show_flyin === 1) return true;
  const tier = String(sponsor.tier || sponsor.level || '').toLowerCase();
  return /\b(silver|gold)\b/.test(tier) || Number(sponsor.homepage_ad) === 1;
}

function sponsorShowsMarquee(sponsor = {}) {
  if (Number(sponsor.active) === 0) return false;
  if (sponsor.show_marquee === false || sponsor.show_marquee === 0) return false;
  const tier = String(sponsor.tier || sponsor.level || '').toLowerCase();
  return /\b(bronze|silver|gold)\b/.test(tier) || sponsor.show_marquee === true || sponsor.show_marquee === 1;
}

async function maybeShowHomepageSponsorAd() {
  if (!isHomePage()) return;
  try {
    const [sponsors, site] = await Promise.all([
      fetch('/api/sponsors', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : [])),
      fetch('/api/site', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : {})),
    ]);
    const eligible = (Array.isArray(sponsors) ? sponsors : []).filter(sponsorShowsFlyin);
    if (!eligible.length) return;
    const picked = pickRandomSponsor(eligible);
    if (picked) showHomepageSponsorAd(picked, site?.sponsor_ad_seconds);
  } catch {
    // Bypass the ad entirely if sponsors cannot be loaded.
  }
}

function ensureSponsorMarqueeMount() {
  const header = document.querySelector('header.site-header');
  let mount = document.querySelector('header.site-header + [data-sponsor-marquee], [data-sponsor-marquee]');
  if (header) {
    // Keep a single marquee directly under the site header on every page.
    if (!mount || mount.previousElementSibling !== header) {
      mount = document.createElement('section');
      mount.className = 'sponsor-marquee-section';
      mount.setAttribute('data-sponsor-marquee', '');
      mount.setAttribute('aria-label', 'Sponsor marquee');
      mount.hidden = true;
      header.insertAdjacentElement('afterend', mount);
    }
    document.querySelectorAll('[data-sponsor-marquee]').forEach((node) => {
      if (node !== mount) node.remove();
    });
    return mount;
  }
  return mount || null;
}

function renderSponsorMarquee(sponsors = []) {
  const mount = ensureSponsorMarqueeMount();
  if (!mount) return;
  const items = (Array.isArray(sponsors) ? sponsors : []).filter(sponsorShowsMarquee);
  if (!items.length) {
    mount.hidden = true;
    mount.innerHTML = '';
    return;
  }
  const logos = items.map((sponsor) => {
    const visual = sponsor.logo_url
      ? `<img src="${escapeHtml(sponsor.logo_url)}" alt="${escapeHtml(sponsor.name)} logo">`
      : `<span class="sponsor-marquee-mark" aria-hidden="true">${escapeHtml(sponsor.mark_text || '★')}</span>`;
    return `<a class="sponsor-marquee-item" href="/sponsors.html" title="${escapeHtml(sponsor.name)}">${visual}<span>${escapeHtml(sponsor.name)}</span></a>`;
  }).join('');
  // Duplicate the track so the CSS loop can scroll seamlessly.
  mount.hidden = false;
  mount.innerHTML = `
    <div class="wrap sponsor-marquee-bar">
      <span class="sponsor-marquee-label">Sponsors</span>
      <div class="sponsor-marquee" data-marquee-track>
        <div class="sponsor-marquee-track">${logos}${logos}</div>
      </div>
    </div>
  `;
}

async function loadSponsorMarquee() {
  try {
    const sponsors = await fetch('/api/sponsors', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : []));
    renderSponsorMarquee(sponsors);
  } catch {
    // Leave the page alone if sponsors cannot load.
  }
}

function closeSponsorMapModal() {
  const modal = document.querySelector('.sponsor-map-modal');
  if (!modal) return;
  modal.classList.add('is-leaving');
  document.body.classList.remove('sponsor-map-open');
  window.setTimeout(() => modal.remove(), 280);
}

function openSponsorMapModal({ name, address, embedUrl, directionsUrl }) {
  if (!address || !embedUrl || !directionsUrl) return;
  closeSponsorMapModal();

  const modal = document.createElement('aside');
  modal.className = 'sponsor-map-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', `${name || 'Sponsor'} map`);
  modal.innerHTML = `
    <button type="button" class="sponsor-map-backdrop" aria-label="Close map"></button>
    <div class="sponsor-map-panel">
      <button type="button" class="sponsor-map-close" aria-label="Close map">×</button>
      <div class="sponsor-map-copy">
        <span class="sponsor-map-kicker">Sponsor location</span>
        <h3>${escapeHtml(name || 'Sponsor')}</h3>
        <p>${escapeHtml(address)}</p>
      </div>
      <a class="sponsor-map-shot" href="${escapeHtml(directionsUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open directions in maps">
        <iframe
          title="Map for ${escapeHtml(name || 'sponsor')}"
          src="${escapeHtml(embedUrl)}"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
          tabindex="-1"
        ></iframe>
        <span class="sponsor-map-overlay">
          <strong>Open in Maps</strong>
          <small>Get directions in Google, Apple, Bing, or your default maps app</small>
        </span>
      </a>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.classList.add('sponsor-map-open');
  requestAnimationFrame(() => modal.classList.add('is-visible'));

  modal.querySelector('.sponsor-map-close')?.addEventListener('click', closeSponsorMapModal);
  modal.querySelector('.sponsor-map-backdrop')?.addEventListener('click', closeSponsorMapModal);
}

function bindSponsorMapCards(root = document) {
  root.querySelectorAll('[data-sponsor-card]').forEach((card) => {
    if (card.dataset.mapBound === '1') return;
    card.dataset.mapBound = '1';
    const open = (event) => {
      event.preventDefault();
      openSponsorMapModal({
        name: card.dataset.sponsorName || '',
        address: card.dataset.sponsorAddress || '',
        embedUrl: card.dataset.sponsorMapEmbed || '',
        directionsUrl: card.dataset.sponsorMapDirections || '',
      });
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') open(event);
    });
  });
}

function ensureBoosterMeetingsContainers() {
  if (document.querySelector('[data-booster-meetings]')) return;
  const cards = [...document.querySelectorAll('article.card, .card')];
  const meetingsCard = cards.find((card) => {
    const tag = card.querySelector('.tag')?.textContent || '';
    const heading = card.querySelector('h3')?.textContent || '';
    return /meetings/i.test(tag) || /booster meetings/i.test(heading);
  });
  if (!meetingsCard) return;
  let slot = meetingsCard.querySelector('[data-booster-meetings]');
  if (!slot) {
    slot = document.createElement('div');
    slot.className = 'timeline booster-meetings';
    slot.dataset.boosterMeetings = '';
    const placeholder = [...meetingsCard.querySelectorAll('p')].find((node) => /placeholder|monthly meeting/i.test(node.textContent || ''));
    if (placeholder) placeholder.replaceWith(slot);
    else meetingsCard.appendChild(slot);
  }
}

async function loadPublicContent() {
  const [site, events, photos] = await Promise.all([
    fetch('/api/site', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
    fetch('/api/events', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
    fetch('/api/photos', { cache: 'no-store' }).then(r => r.json()).catch(() => []),
  ]);

  if (site) {
    document.querySelectorAll('[data-site-field]').forEach(element => {
      const key = element.dataset.siteField;
      const value = site[key];
      if (!value) return;
      if (key === 'hero_title' || key === 'title') {
        element.innerHTML = formatInlineRichText(value);
        return;
      }
      if (key === 'hero_subtitle' || key === 'footer_note') {
        const html = formatRichText(value);
        if (element.tagName === 'P') {
          const match = html.match(/^<p>([\s\S]*)<\/p>$/i);
          element.innerHTML = match ? match[1] : sanitizeInlineRichHtml(html);
        } else {
          element.innerHTML = html;
        }
        return;
      }
      element.textContent = value;
    });
    if (site.title) {
      const plainTitle = String(site.title).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (plainTitle) document.title = document.title.replace('East Forsyth Band', plainTitle);
    }
  }

  document.querySelectorAll('[data-events]').forEach(container => {
    const rawLimit = container.dataset.limit;
    const limit = rawLimit === undefined || rawLimit === ''
      ? events.length
      : Math.max(0, Number(rawLimit) || 0);
    const visibleEvents = events.slice(0, limit || events.length);
    if (!visibleEvents.length) {
      container.innerHTML = '<p class="draft">No upcoming events have been published yet.</p>';
      return;
    }
    container.innerHTML = visibleEvents.map(event => `
      <article class="event">
        <div class="datebox">${escapeHtml(event.date_label)} <span>${escapeHtml(event.date_detail)}</span></div>
        <div><h3>${formatInlineRichText(event.title)}</h3><div class="event-description">${formatRichText(event.description)}</div></div>
      </article>
    `).join('');
  });

  ensureBoosterMeetingsContainers();
  const boosterMeetings = (Array.isArray(events) ? events : []).filter((event) => (
    Number(event.show_on_boosters) === 1
    && Number(event.repeat_enabled) !== 1
    && !event.is_occurrence
  ));
  document.querySelectorAll('[data-booster-meetings]').forEach((container) => {
    if (!boosterMeetings.length) {
      container.innerHTML = '<p class="draft">No upcoming booster meetings are scheduled yet.</p>';
      return;
    }
    container.innerHTML = boosterMeetings.map((event) => `
      <article class="event">
        <div class="datebox">${escapeHtml(event.date_label)} <span>${escapeHtml(event.date_detail)}</span></div>
        <div><h3>${formatInlineRichText(event.title)}</h3><div class="event-description">${formatRichText(event.description)}</div></div>
      </article>
    `).join('');
  });

  document.querySelectorAll('[data-photo-gallery]').forEach(container => {
    if (!photos.length) return;
    container.innerHTML = photos.map(photo => `
      <figure class="gallery-item"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.alt_text)}"><figcaption>${formatInlineRichText(photo.caption || photo.alt_text)}</figcaption></figure>
    `).join('');
  });

  bindSponsorMapCards();
  bindSponsorTierSignup();
  await Promise.all([loadSponsorMarquee(), maybeShowHomepageSponsorAd(), loadContactForms()]);
}

function buildContactFormHtml(topics = []) {
  const options = topics.length
    ? topics.map((topic) => `<option value="${escapeHtml(topic.id)}">${escapeHtml(topic.label)}</option>`).join('')
    : '<option value="" disabled selected>Contact topics coming soon</option>';
  const disabled = topics.length ? '' : ' disabled';
  return `
    <span class="tag">Contact</span>
    <h3>Send a message</h3>
    <p class="contact-form-intro">Choose a topic and we will route your message to the right person.</p>
    <div class="form-grid">
      <label>Name<input name="name" required autocomplete="name" placeholder="Your name"${disabled}></label>
      <label>Email<input name="email" type="email" required autocomplete="email" placeholder="you@example.com"${disabled}></label>
      <label class="full">Topic<select name="topic_id" required${disabled}>${options}</select></label>
      <label class="full">Message<textarea name="message" rows="5" required placeholder="How can we help?"${disabled}></textarea></label>
      <label class="contact-honeypot" aria-hidden="true">Company<input name="company" tabindex="-1" autocomplete="off"></label>
    </div>
    <p style="margin-top:16px"><button class="btn primary" type="submit"${disabled}>Send message</button></p>
    <p class="status" data-contact-status></p>
  `;
}

function bindContactForm(form) {
  if (!form || form.dataset.bound === '1') return;
  form.dataset.bound = '1';
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = form.querySelector('[data-contact-status]');
    const payload = Object.fromEntries(new FormData(form).entries());
    if (status) status.textContent = 'Sending…';
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail || 'Could not send message');
      form.reset();
      if (status) status.textContent = result.detail || 'Message sent. Thank you!';
    } catch (error) {
      if (status) status.textContent = error.message || 'Could not send message.';
    }
  });
}

async function loadContactForms() {
  const slots = [...document.querySelectorAll('[data-contact-form-slot], form[data-contact-form]')];
  if (!slots.length) return;
  const topics = await fetch('/api/contact/topics', { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : []))
    .catch(() => []);

  slots.forEach((slot) => {
    let form = slot;
    if (slot.matches('[data-contact-form-slot]')) {
      form = document.createElement('form');
      form.className = 'card contact-form';
      form.dataset.contactForm = '';
      form.noValidate = true;
      form.innerHTML = buildContactFormHtml(topics);
      slot.replaceWith(form);
    } else {
      form.classList.add('card', 'contact-form');
      form.innerHTML = buildContactFormHtml(topics);
    }
    bindContactForm(form);
  });
}

function isCmsAdminPreviewContext(root = document) {
  return Boolean(
    document.body?.classList?.contains('admin-body')
    || root.closest?.('#page-preview, .cms-shell, .image-admin-shell')
  );
}

function parseSponsorAmountCents(value) {
  const cleaned = String(value || '').replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const dollars = Number(cleaned);
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.round(dollars * 100);
}

function formatSponsorAmountDisplay(cents) {
  const amount = Number(cents);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const dollars = amount / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function readTierPackageFromCard(card) {
  const tier = String(card?.dataset?.tier || '').trim().toLowerCase();
  if (!['bronze', 'silver', 'gold'].includes(tier)) return null;
  const title = (card.querySelector('[data-cms-field$="_title"], h3')?.textContent || `${tier} Sponsor`)
    .replace(/\s+/g, ' ')
    .trim();
  const amountText = (card.querySelector('[data-cms-field$="_amount"], .sponsor-tier-amount')?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
  const amountCents = parseSponsorAmountCents(amountText);
  if (!amountCents) return null;
  return {
    tier,
    title,
    amountCents,
    amountDisplay: formatSponsorAmountDisplay(amountCents) || amountText,
  };
}

let sponsorSignupState = null;

function closeSponsorSignupModal({ immediate = false } = {}) {
  const modal = document.querySelector('.sponsor-signup-modal');
  if (!modal) {
    document.body.classList.remove('sponsor-signup-open');
    sponsorSignupState = null;
    return;
  }
  if (immediate) {
    modal.remove();
    document.body.classList.remove('sponsor-signup-open');
    sponsorSignupState = null;
    return;
  }
  modal.classList.add('is-leaving');
  modal.classList.remove('is-visible');
  window.setTimeout(() => {
    if (document.body.contains(modal)) modal.remove();
    if (!document.querySelector('.sponsor-signup-modal')) {
      document.body.classList.remove('sponsor-signup-open');
    }
    sponsorSignupState = null;
  }, 280);
}

function showSponsorSignupConfirm(modal) {
  const confirm = modal.querySelector('[data-signup-confirm]');
  if (!confirm) return;
  confirm.hidden = false;
  confirm.querySelector('[data-confirm-yes]')?.focus();
}

function hideSponsorSignupConfirm(modal) {
  const confirm = modal.querySelector('[data-signup-confirm]');
  if (!confirm) return;
  confirm.hidden = true;
}

function openSponsorSignupModal(pkg) {
  closeSponsorMapModal();
  closeSponsorSignupModal({ immediate: true });
  sponsorSignupState = { ...pkg, draft: null, application: null };

  const modal = document.createElement('aside');
  modal.className = 'sponsor-signup-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', `Become a ${pkg.title}`);
  modal.innerHTML = `
    <button type="button" class="sponsor-signup-backdrop" data-signup-cancel aria-label="Cancel signup"></button>
    <div class="sponsor-signup-panel">
      <div class="sponsor-signup-head" data-signup-head>
        <span class="sponsor-signup-kicker">Become a sponsor</span>
        <h3>${escapeHtml(pkg.title)}</h3>
        <p data-signup-head-copy>Tell us about your business, then continue to payment for <strong>${escapeHtml(pkg.amountDisplay)}</strong>.</p>
      </div>
      <div class="sponsor-signup-step" data-signup-step="details">
        <form class="sponsor-signup-form" data-signup-form novalidate>
          <label>Business name<input name="business_name" required autocomplete="organization" maxlength="160" placeholder="Business or organization name"></label>
          <label>Address<textarea name="address" required rows="2" maxlength="400" autocomplete="street-address" placeholder="Street, city, state, ZIP"></textarea></label>
          <label>Phone<input name="phone" type="tel" required autocomplete="tel" maxlength="40" placeholder="(336) 555-0100"></label>
          <label class="sponsor-signup-logo">Company logo <span>(optional, image under 2 MB)</span>
            <input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif">
          </label>
          <p class="sponsor-signup-logo-name" data-logo-name hidden></p>
          <p class="status" data-signup-status></p>
          <div class="sponsor-signup-actions">
            <button class="btn outline" type="button" data-signup-cancel>Cancel</button>
            <button class="btn primary" type="submit">Next</button>
          </div>
        </form>
      </div>
      <div class="sponsor-signup-step" data-signup-step="payment" hidden>
        <div class="sponsor-signup-payment-body" data-pay-body>
          <div class="sponsor-signup-summary">
            <p><span>Business</span><strong data-pay-business></strong></p>
            <p><span>Package</span><strong>${escapeHtml(pkg.title)}</strong></p>
          </div>
          <label class="sponsor-signup-amount-lock">Amount due
            <input data-pay-amount type="text" readonly tabindex="-1" value="${escapeHtml(pkg.amountDisplay)}">
          </label>
          <p class="sponsor-signup-pay-note" data-pay-note>Your package amount is locked. Continue to Square to complete payment.</p>
          <p class="status" data-pay-status></p>
        </div>
        <div class="sponsor-signup-actions" data-pay-actions>
          <button class="btn outline" type="button" data-signup-cancel>Cancel</button>
          <button class="btn primary" type="button" data-pay-continue>Pay with Square</button>
        </div>
        <p class="sponsor-signup-mock" data-mock-pay-wrap hidden>
          <button type="button" class="sponsor-signup-mock-btn" data-mock-pay>Simulate successful payment (test)</button>
        </p>
      </div>
      <div class="sponsor-signup-confirm" data-signup-confirm hidden>
        <div class="sponsor-signup-confirm-card" role="alertdialog" aria-labelledby="sponsor-signup-confirm-title" aria-describedby="sponsor-signup-confirm-copy">
          <h4 id="sponsor-signup-confirm-title">Are you sure?</h4>
          <p id="sponsor-signup-confirm-copy">Canceling returns you to the sponsor page and discards this form.</p>
          <div class="sponsor-signup-actions">
            <button class="btn outline" type="button" data-confirm-no>No</button>
            <button class="btn primary" type="button" data-confirm-yes>Yes</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.classList.add('sponsor-signup-open');
  requestAnimationFrame(() => modal.classList.add('is-visible'));

  const form = modal.querySelector('[data-signup-form]');
  const detailsStep = modal.querySelector('[data-signup-step="details"]');
  const paymentStep = modal.querySelector('[data-signup-step="payment"]');
  const payBody = modal.querySelector('[data-pay-body]');
  const status = modal.querySelector('[data-signup-status]');
  const payStatus = modal.querySelector('[data-pay-status]');
  const payNote = modal.querySelector('[data-pay-note]');
  const logoName = modal.querySelector('[data-logo-name]');
  const logoInput = form?.querySelector('input[name="logo"]');
  const mockWrap = modal.querySelector('[data-mock-pay-wrap]');
  let checkoutMessageBound = false;

  function handleSponsorPaidMessage(event) {
    const data = event?.data;
    if (!data || data.type !== 'efhs-sponsor-paid') return;
    if (!sponsorSignupState?.application) return;
    if (String(data.application_id || '') !== String(sponsorSignupState.application.id || '')) return;
    window.removeEventListener('message', handleSponsorPaidMessage);
    checkoutMessageBound = false;
    if (!data.ok) {
      if (payStatus) payStatus.textContent = data.detail || 'Payment could not be confirmed.';
      return;
    }
    finishSponsorSignupSuccess(data.sponsor, data.detail);
  }

  function finishSponsorSignupSuccess(sponsor, detail) {
    closeSponsorSignupModal({ immediate: true });
    const note = detail || (sponsor?.name
      ? `${sponsor.name} is now listed as ${sponsor.level || 'a sponsor'}.`
      : 'Sponsorship activated. Thank you!');
    const toast = document.createElement('div');
    toast.className = 'sponsor-signup-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = note;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => toast.remove(), 280);
    }, 4200);
    loadSponsorMarquee();
  }

  function loadSquareWebSdk(environment = 'production') {
    const existing = document.querySelector('script[data-square-web-sdk]');
    if (existing && window.Square) return Promise.resolve(window.Square);
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.dataset.squareWebSdk = '1';
      script.src = environment === 'sandbox'
        ? 'https://sandbox.web.squarecdn.com/v1/square.js'
        : 'https://web.squarecdn.com/v1/square.js';
      script.onload = () => (window.Square ? resolve(window.Square) : reject(new Error('Square.js failed to load')));
      script.onerror = () => reject(new Error('Could not load Square payment form'));
      document.head.appendChild(script);
    });
  }

  async function embedCardCheckout(application, config) {
    if (!payBody) return;
    modal.classList.add('is-checkout');
    const headCopy = modal.querySelector('[data-signup-head-copy]');
    if (headCopy) {
      headCopy.innerHTML = `Enter card details to pay <strong>${escapeHtml(pkg.amountDisplay)}</strong>.`;
    }
    payBody.innerHTML = `
      <div class="sponsor-signup-summary">
        <p><span>Business</span><strong>${escapeHtml(application.business_name || sponsorSignupState.draft?.businessName || '')}</strong></p>
        <p><span>Package</span><strong>${escapeHtml(pkg.title)}</strong></p>
        <p><span>Amount</span><strong>${escapeHtml(pkg.amountDisplay)}</strong></p>
      </div>
      <div class="sponsor-signup-card-box">
        <div id="sponsor-square-card" class="sponsor-signup-card-host"></div>
      </div>
      <p class="status" data-pay-status>Loading secure card form…</p>
    `;
    const liveStatus = payBody.querySelector('[data-pay-status]');
    const payContinue = modal.querySelector('[data-pay-continue]');
    if (payContinue) {
      payContinue.hidden = false;
      payContinue.disabled = true;
      payContinue.textContent = `Pay ${pkg.amountDisplay}`;
    }
    if (mockWrap) mockWrap.hidden = !config?.mock_enabled;

    const Square = await loadSquareWebSdk(config.environment || 'production');
    const payments = Square.payments(config.application_id, config.location_id);
    const card = await payments.card();
    await card.attach('#sponsor-square-card');
    if (liveStatus) liveStatus.textContent = 'Card form ready.';
    if (payContinue) {
      payContinue.disabled = false;
      payContinue.onclick = async () => {
        payContinue.disabled = true;
        if (liveStatus) liveStatus.textContent = 'Processing payment…';
        try {
          const verificationDetails = {
            amount: (Number(application.amount_cents || pkg.amountCents) / 100).toFixed(2),
            currencyCode: 'USD',
            intent: 'CHARGE',
            customerInitiated: true,
            sellerKeyedIn: false,
            billingContact: {
              givenName: String(application.business_name || sponsorSignupState.draft?.businessName || 'Sponsor').slice(0, 100),
              phone: String(sponsorSignupState.draft?.phone || '').replace(/\D/g, '').slice(0, 20),
              addressLines: [String(sponsorSignupState.draft?.address || '').slice(0, 200)],
              countryCode: 'US',
            },
          };
          const result = await card.tokenize(verificationDetails);
          if (result.status !== 'OK' || !result.token) {
            const message = result.errors?.[0]?.message || 'Card could not be processed.';
            throw new Error(message);
          }
          const response = await fetch(`/api/sponsor-applications/${encodeURIComponent(application.id)}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: application.completion_token,
              source_id: result.token,
            }),
          });
          const paid = await response.json().catch(() => ({}));
          if (!response.ok || !paid.ok) throw new Error(paid.detail || 'Payment failed');
          finishSponsorSignupSuccess(paid.sponsor, paid.detail);
        } catch (error) {
          if (liveStatus) liveStatus.textContent = error.message || 'Payment failed.';
          payContinue.disabled = false;
        }
      };
    }
  }

  function embedMockCheckout(url) {
    if (!payBody || !url) return;
    modal.classList.add('is-checkout');
    const headCopy = modal.querySelector('[data-signup-head-copy]');
    if (headCopy) headCopy.textContent = 'Test checkout — completing a simulated payment.';
    payBody.innerHTML = `
      <iframe
        class="sponsor-signup-checkout-frame"
        title="Test sponsorship payment"
        src="${escapeHtml(url)}"
      ></iframe>
      <p class="status" data-pay-status>Running test payment…</p>
    `;
    const payContinue = modal.querySelector('[data-pay-continue]');
    if (payContinue) payContinue.hidden = true;
    if (mockWrap) mockWrap.hidden = true;
    if (!checkoutMessageBound) {
      window.addEventListener('message', handleSponsorPaidMessage);
      checkoutMessageBound = true;
    }
  }

  function embedCheckout(url, { mock = false } = {}) {
    if (mock) embedMockCheckout(url);
  }

  async function ensureApplication() {
    const draft = sponsorSignupState?.draft;
    if (!draft) throw new Error('Business details are required.');
    if (sponsorSignupState.application?.id && sponsorSignupState.application.completion_token) {
      return sponsorSignupState.application;
    }
    const body = new FormData();
    body.set('business_name', draft.businessName);
    body.set('address', draft.address);
    body.set('phone', draft.phone);
    body.set('tier', pkg.tier);
    body.set('amount_display', pkg.amountDisplay);
    body.set('amount_cents', String(pkg.amountCents));
    if (draft.logo) body.set('logo', draft.logo, draft.logo.name || 'logo.png');
    const response = await fetch('/api/sponsor-applications', { method: 'POST', body });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || 'Could not save application');
    sponsorSignupState.application = result;
    return result;
  }

  modal.querySelectorAll('[data-signup-cancel]').forEach((button) => {
    button.addEventListener('click', () => showSponsorSignupConfirm(modal));
  });
  modal.querySelector('[data-confirm-no]')?.addEventListener('click', () => hideSponsorSignupConfirm(modal));
  modal.querySelector('[data-confirm-yes]')?.addEventListener('click', () => {
    if (checkoutMessageBound) window.removeEventListener('message', handleSponsorPaidMessage);
    closeSponsorSignupModal();
  });

  logoInput?.addEventListener('change', () => {
    const file = logoInput.files?.[0];
    if (!file) {
      if (logoName) {
        logoName.hidden = true;
        logoName.textContent = '';
      }
      return;
    }
    if (file.size > 1_900_000) {
      logoInput.value = '';
      if (status) status.textContent = 'Logo must be an image under 2 MB.';
      if (logoName) {
        logoName.hidden = true;
        logoName.textContent = '';
      }
      return;
    }
    if (status) status.textContent = '';
    if (logoName) {
      logoName.hidden = false;
      logoName.textContent = file.name;
    }
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (status) status.textContent = '';
    const businessName = String(form.elements.business_name?.value || '').trim();
    const address = String(form.elements.address?.value || '').trim();
    const phone = String(form.elements.phone?.value || '').trim();
    const logo = form.elements.logo?.files?.[0] || null;
    if (!businessName || !address || !phone) {
      if (status) status.textContent = 'Business name, address, and phone are required.';
      return;
    }
    if (logo && logo.size > 1_900_000) {
      if (status) status.textContent = 'Logo must be an image under 2 MB.';
      return;
    }
    sponsorSignupState.draft = { businessName, address, phone, logo };
    modal.querySelector('[data-pay-business]').textContent = businessName;
    modal.querySelector('[data-pay-amount]').value = pkg.amountDisplay;
    detailsStep.hidden = true;
    paymentStep.hidden = false;
    if (payStatus) payStatus.textContent = '';
    if (payNote) {
      payNote.textContent = 'Your package amount is locked. Continue to Square to complete payment.';
    }
    fetch('/api/sponsor-checkout/config', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((config) => {
        if (mockWrap) mockWrap.hidden = !(config && config.mock_enabled);
      })
      .catch(() => {
        if (mockWrap) mockWrap.hidden = true;
      });
    modal.querySelector('[data-pay-continue]')?.focus();
  });

  async function startSquarePayment() {
    const payButton = modal.querySelector('[data-pay-continue]');
    const statusEl = modal.querySelector('[data-pay-status]');
    if (statusEl) statusEl.textContent = 'Saving application…';
    if (payButton) payButton.disabled = true;
    try {
      const [result, config] = await Promise.all([
        ensureApplication(),
        fetch('/api/sponsor-checkout/config', { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null),
      ]);
      if (mockWrap) mockWrap.hidden = !(config && config.mock_enabled);
      if (config?.web_payments) {
        await embedCardCheckout(result, config);
        return;
      }
      if (result.mock_enabled && result.mock_checkout_url) {
        if (statusEl) {
          statusEl.textContent = 'In-popup Square card checkout needs SQUARE_APPLICATION_ID. You can still use the test payment option below.';
        }
        if (payButton) payButton.disabled = false;
        return;
      }
      if (statusEl) {
        statusEl.textContent = result.detail
          || 'Application saved. Add SQUARE_APPLICATION_ID to enable in-popup card checkout.';
      }
      if (payButton) payButton.disabled = false;
    } catch (error) {
      if (statusEl) statusEl.textContent = error.message || 'Could not continue to payment.';
      if (payButton) payButton.disabled = false;
    }
  }

  modal.querySelector('[data-pay-continue]')?.addEventListener('click', () => {
    if (modal.classList.contains('is-checkout')) return;
    startSquarePayment();
  });

  modal.querySelector('[data-mock-pay]')?.addEventListener('click', async () => {
    const payButton = modal.querySelector('[data-pay-continue]');
    const statusEl = modal.querySelector('[data-pay-status]');
    if (statusEl) statusEl.textContent = 'Starting test payment…';
    if (payButton) payButton.disabled = true;
    try {
      const result = await ensureApplication();
      if (!result.mock_checkout_url) throw new Error('Test payments are not enabled.');
      embedMockCheckout(result.mock_checkout_url);
    } catch (error) {
      if (statusEl) statusEl.textContent = error.message || 'Could not start test payment.';
      if (payButton) payButton.disabled = false;
    }
  });

  form?.querySelector('input[name="business_name"]')?.focus();
}

function bindSponsorTierSignup(root = document) {
  if (isCmsAdminPreviewContext(root)) return;
  root.querySelectorAll('.sponsor-tiers [data-tier].sponsor-tier, .sponsor-tier[data-tier]').forEach((card) => {
    if (card.dataset.signupBound === '1') return;
    if (card.closest('#page-preview, .cms-shell, .admin-body')) return;
    card.dataset.signupBound = '1';
    card.classList.add('sponsor-tier-clickable');
    if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');
    if (!card.getAttribute('role')) card.setAttribute('role', 'button');
    const open = (event) => {
      event.preventDefault();
      const pkg = readTierPackageFromCard(card);
      if (!pkg) return;
      openSponsorSignupModal(pkg);
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') open(event);
    });
  });
}

loadPublicContent();
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const signup = document.querySelector('.sponsor-signup-modal');
  if (signup) {
    const confirm = signup.querySelector('[data-signup-confirm]');
    if (confirm && !confirm.hidden) {
      hideSponsorSignupConfirm(signup);
      return;
    }
    showSponsorSignupConfirm(signup);
    return;
  }
  closeSponsorMapModal();
});
