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

loadPublicContent();
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSponsorMapModal();
});
