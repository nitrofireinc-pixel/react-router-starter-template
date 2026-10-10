/** Approved home-page redesign. Markup follows the mockup; copy stays in the CMS or live data. */

const HEART = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.6 1.1 5.4 3 1.8-1.9 3.3-3 5.4-3 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z"/></svg>';
const ARROW = '<svg class="ic arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 7.25h9.2L8.1 4.15 9.15 3.1 14 8l-4.85 4.9-1.05-1.05L11.2 8.75H2z"/></svg>';
const CHEV = '<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 7.25h9.2L8.1 4.15 9.15 3.1 14 8l-4.85 4.9-1.05-1.05L11.2 8.75H2z"/></svg>';

export const HOME_REDESIGN_MARKER = 'data-home-redesign';

export const APPROVED_HERO_SUBTITLE = 'The East Forsyth Blue Regiment — marching band, concert bands, color guard and percussion — powered by students, families, alumni, sponsors, and the Kernersville community.';

export const DEFAULT_FUNDRAISING_INTRO = 'Centralize active campaigns, passive giving links, payment information, and fundraiser deadlines.';

export const APPROVED_FUNDRAISING_INTRO = 'Every fundraiser helps pay for instruments, travel, meals and uniforms for our students. Here\'s what\'s coming up and how you can help.';

export const PREVIOUS_HERO_SUBTITLE = 'A polished home for the East Forsyth Band program — built for students, families, alumni, sponsors, and the Kernersville community.';

const DEFAULT_HERO_CARD = '<aside class="hero-card"><img src="/assets/efhs-blue-regiment-mark.png" alt="East Forsyth Blue Regiment"><h2>Band information in one place</h2><ul><li>Ensembles and program overview</li><li>Upcoming events and rehearsal notes</li><li>Booster, fundraising, and sponsor information</li></ul></aside>';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function stripStyleAndEditorChrome(value) {
  return String(value || '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<link\b[^>]*>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
}

function looksLikeCssOrStyleDump(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  if (/[{};]|body\s*\{|html\s*\{|margin\s*:|padding\s*:|@media\b|@font-face\b/i.test(text) && !/\s/.test(text.replace(/[{}:;]/g, ''))) return true;
  if (/^(?:body|html|html\s*,\s*body)\s*\{/i.test(text)) return true;
  if (/^[a-z.#\[][\w\s,.#:[\]=()>"'-]*\{[^}]{0,200}\}$/i.test(text)) return true;
  return /\{[^}]*margin\s*:[^}]*\}/i.test(text) && text.length < 80;
}

function plainText(value) {
  return stripStyleAndEditorChrome(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function fundraiserDisplayTitle(title = '') {
  const raw = plainText(title);
  const stripped = raw.replace(/^fundraiser\s*[/:|–-]\s*/i, '').trim();
  return stripped || raw;
}

export function isHomeFundraiserEvent(event = {}) {
  const blob = `${event.title || ''} ${event.description || ''} ${event.track || ''}`.toLowerCase();
  return /fundrais|mattress|silent auction|\bauction\b/.test(blob);
}

export function isHomeRoutineRehearsal(event = {}) {
  if (isHomeFundraiserEvent(event)) return false;
  const track = String(event.track || '').toLowerCase();
  const title = String(event.title || '').toLowerCase();
  return track === 'rehearsal' || /^band practice\b/.test(title);
}

export function homeEventTag(event = {}) {
  if (isHomeFundraiserEvent(event)) return { label: 'Fundraiser', className: 'ev-fund' };
  const track = String(event.track || '').toLowerCase();
  if (track === 'deadline') return { label: 'IMPORTANT', className: 'ev-deadline' };
  if (track === 'game') return { label: 'Game', className: '' };
  if (track === 'meeting') return { label: 'Meeting', className: '' };
  if (/parade/i.test(event.title || '')) return { label: 'Parade', className: '' };
  const label = track ? track.charAt(0).toUpperCase() + track.slice(1) : 'Event';
  return { label, className: '' };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatHomeEventWhen(event = {}) {
  const iso = String(event.start_date || '');
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { short: '', long: '', weekday: '' };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = WEEKDAYS[date.getUTCDay()] || '';
  const monthName = MONTHS[month - 1] || '';
  const time = formatTimeRange(event);
  return {
    short: `${weekday}, ${monthName} ${day}`.replace(/^, /, ''),
    long: `${weekday}, ${monthName} ${day}, ${year}`,
    weekday,
    month: monthName,
    day: String(day).padStart(2, '0'),
    time,
  };
}

function formatTimeRange(event = {}) {
  const source = event || {};
  if (Number(source.all_day) && !source.start_time && !source.end_time) return '';
  const start = formatClock(source.start_time);
  const end = formatClock(source.end_time);
  if (start && end) return `${start}–${end}`;
  return start || end || '';
}

function fundraiserWhenTime(event = {}) {
  const source = event || {};
  const ranged = formatTimeRange(source);
  if (ranged) return ranged;
  const blob = `${source.description || ''} ${source.location || ''}`;
  const match = blob.match(/(\d{1,2}(?::\d{2})?\s*[ap]m)\s*[–\-to]+\s*(\d{1,2}(?::\d{2})?\s*[ap]m)/i);
  if (!match) return '';
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').toUpperCase();
  return `${clean(match[1])}–${clean(match[2])}`;
}

function formatClock(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  let hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return minute === '00' ? `${hour} ${suffix}` : `${hour}:${minute} ${suffix}`;
}

function eventWhere(event = {}) {
  const location = plainText(event.location);
  if (location) return location;
  return plainText(event.description);
}

export function selectHomeSchedule(events = []) {
  const list = (Array.isArray(events) ? events : []).filter((event) => event && event.start_date);
  const fundraisers = list.filter(isHomeFundraiserEvent);
  const display = list.filter((event) => !isHomeRoutineRehearsal(event)).slice(0, 8);
  return { fundraisers, display, nextFundraiser: fundraisers[0] || null };
}

function mapsHref(text) {
  const query = plainText(text);
  if (!query || query.length < 8) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function renderHomeEventArticle(event) {
  const when = formatHomeEventWhen(event);
  const tag = homeEventTag(event);
  const month = event.date_label || when.month || '';
  const day = event.date_detail || when.day || '';
  return `<article class="ev${tag.className ? ` ${tag.className}` : ''}"><div class="db">${escapeHtml(month)}<b>${escapeHtml(day)}</b></div><div><h3>${escapeHtml(plainText(event.title))}</h3><p>${escapeHtml(plainText(event.description) || eventWhere(event))}</p></div><span class="ev-tag">${escapeHtml(tag.label)}</span></article>`;
}

export function renderNextFundraiserCard(event, { dealHtml = '' } = {}) {
  if (!event) return '';
  const when = formatHomeEventWhen(event);
  const time = when.time ? `<span>${escapeHtml(when.time)}</span>` : '';
  const where = eventWhere(event);
  const deal = String(dealHtml || '').trim();
  return `<div class="nf-flag">Save the date</div>
      <div class="nf-kicker">Next fundraiser</div>
      <h2>${escapeHtml(plainText(event.title))}</h2>
      <div class="nf-date"><b>${escapeHtml(when.short)}</b>${time}</div>
      ${where ? `<p class="nf-where">${escapeHtml(where)}</p>` : ''}
      ${deal ? `<p class="nf-deal">${deal}</p>` : ''}
      <a class="btn btn-blue btn-block" href="/fundraising.html">Fundraiser details</a>`;
}

export function renderFeaturedFundraiser(event, { flyer = '/assets/home/mattress-flyer.jpg', dealHtml = '' } = {}) {
  if (!event) return '';
  const when = formatHomeEventWhen(event);
  const where = eventWhere(event);
  const directions = mapsHref(where);
  const deal = String(dealHtml || '').trim();
  const timeLine = when.time ? `<br>${escapeHtml(when.time)}` : '';
  return `<div class="ff-media"><img src="${escapeAttr(flyer)}" alt="${escapeAttr(plainText(event.title) || 'Fundraiser')} flyer"></div>
      <div class="ff-body">
        <div class="pill-row"><span class="pill pill-gold">Featured fundraiser</span><span class="pill pill-red">Band members must attend</span></div>
        <h3>${escapeHtml(plainText(event.title))}</h3>
        <p class="ff-sub">${escapeHtml(plainText(event.description) || 'See the fundraising page for details.')}</p>
        <dl class="ff-facts">
          <div><dt>When</dt><dd>${escapeHtml(when.long || when.short)}${timeLine}</dd></div>
          ${where ? `<div><dt>Where</dt><dd>${escapeHtml(where)}</dd></div>` : ''}
          ${deal ? `<div class="ff-deal"><dt>The deal</dt><dd>${deal}</dd></div>` : ''}
        </dl>
        <div class="btn-row">
          <a class="btn btn-blue" href="/calendar.html">View on calendar</a>
          ${directions ? `<a class="btn btn-outline" href="${escapeAttr(directions)}" target="_blank" rel="noopener noreferrer">Get directions</a>` : ''}
          <a class="btn btn-link" href="/fundraising.html">Fundraising page ${ARROW}</a>
        </div>
      </div>`;
}

export function renderOtherFundraiserCard(event) {
  if (!event) return '';
  const when = formatHomeEventWhen(event);
  return `<article class="fund-card photo-card" style="--img:url('/assets/home/home2-13.jpg')">
        <div class="fc-top"><span class="pill pill-light">Fundraiser${when.short ? ` · ${escapeHtml(when.short)}` : ''}</span></div>
        <div class="fc-body">
          <h3>${escapeHtml(plainText(event.title))}</h3>
          <p>${escapeHtml(plainText(event.description) || 'See the calendar for details.')}</p>
          <a class="btn btn-gold btn-sm" href="/boosters.html">I can help</a>
        </div>
      </article>`;
}

function tierCard(id, fields, { gold = false } = {}) {
  const benefits = fields[`${id}_benefits`] || '<ul></ul>';
  const ribbon = gold ? '<div class="tier-ribbon">Top package</div>' : '';
  const buttonClass = gold ? 'btn btn-gold btn-block' : 'btn btn-outline btn-block';
  const label = plainText(fields[`${id}_label`]) || id;
  return `<article class="tier tier-${escapeAttr(id)}">
        ${ribbon}
        <div class="tier-name">${escapeHtml(label)}</div>
        <div class="tier-price">${escapeHtml(plainText(fields[`${id}_amount`]))}</div>
        <p class="tier-tag">${escapeHtml(plainText(fields[`${id}_blurb`]))}</p>
        ${benefits}
        <a class="${buttonClass}" href="/become-a-sponsor.html">Choose ${escapeHtml(label)}</a>
      </article>`;
}

export function renderHomeSponsorTiers(fields = {}) {
  if (!fields || !fields.bronze_amount) return '';
  return `${tierCard('bronze', fields)}
      ${tierCard('silver', fields)}
      ${tierCard('gold', fields, { gold: true })}`;
}

function sponsorTierName(level = '') {
  const raw = String(level || '').toLowerCase();
  if (raw.includes('gold')) return 'Gold';
  if (raw.includes('silver')) return 'Silver';
  if (raw.includes('bronze')) return 'Bronze';
  return plainText(level);
}

export function renderHomeSponsorThanks(sponsors = []) {
  const items = (Array.isArray(sponsors) ? sponsors : []).filter((sponsor) => sponsor && sponsor.name);
  return items.map((sponsor) => {
    const tier = sponsorTierName(sponsor.level || sponsor.tier);
    const gold = tier === 'Gold' ? ' sp-gold' : '';
    const logo = sponsor.logo_url
      ? `<img src="${escapeAttr(sponsor.logo_url)}" alt="${escapeAttr(sponsor.name)} logo">`
      : `<i aria-hidden="true">${escapeHtml(initials(sponsor.name))}</i>`;
    const place = [sponsor.city, sponsor.state].filter(Boolean).join(', ');
    return `<figure class="sp${gold}">${logo}<figcaption><b>${escapeHtml(sponsor.name)}</b><span>${escapeHtml([tier, place].filter(Boolean).join(' · '))}</span></figcaption></figure>`;
  }).join('');
}

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function renderHomeOfficers(members = []) {
  const people = (Array.isArray(members) ? members : []).filter((member) => member && member.name);
  if (!people.length) return '';
  return people.map((member) => {
    const photo = member.photo_url
      ? `<img src="${escapeAttr(member.photo_url)}" alt="${escapeAttr(member.name)}">`
      : `<i>${escapeHtml(initials(member.name))}</i>`;
    return `<div class="off">${photo}<div><b>${escapeHtml(member.name)}</b><span>${escapeHtml(plainText(member.role))}</span></div></div>`;
  }).join('');
}

function firstFundraisingImage(html = '') {
  return extractFundraisingMedia(html).images[0]?.src || '';
}

const SKIP_FUNDRAISING_IMAGE = /efhs-logo|blue-regiment-mark|sponsor-qr|donate-qr|admin-mark/i;
const ADDRESS_IN_TEXT = /\b\d{2,6}\s+[A-Za-z0-9.#\s-]+?(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln)\.?(?:,\s*[A-Za-z .]+)?(?:,\s*[A-Z]{2}\s*\d{5})?/i;

function fundraisingCopySource(html = '') {
  const source = stripStyleAndEditorChrome(html);
  const field = source.match(/<([a-z0-9]+)\b[^>]*data-cms-field=["']body_text["'][^>]*>([\s\S]*?)<\/\1>/i);
  if (field?.[2]) return stripStyleAndEditorChrome(field[2]);
  return source
    .replace(/<section\b[^>]*page-hero[^>]*>[\s\S]*?<\/section>/i, ' ')
    .replace(/<article\b[^>]*(?:data-square-donate|square-donate-card)[^>]*>[\s\S]*?<\/article>/gi, ' ')
    .replace(/<(?:section|form|div)\b[^>]*(?:data-email-list-signup|email-list-signup|data-fundraising-help)[^>]*>[\s\S]*?<\/(?:section|form|div)>/gi, ' ');
}

function collapseEmptyFundraisingParagraphs(html = '') {
  return String(html || '')
    .replace(/(?:<p>\s*(?:<br\s*\/?>)?\s*<\/p>\s*){2,}/gi, '')
    .replace(/<p>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, '');
}

function fundraisingInnerIsBlank(html = '') {
  const text = plainText(String(html || '').replace(/<img\b[^>]*>/gi, ' '))
    .replace(/\b(?:band\s+members|students)\s+must\s+attend!?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return !text || looksLikeCssOrStyleDump(text);
}

export function extractFundraisingMedia(html = '') {
  const source = fundraisingCopySource(html);
  const images = [];
  const imgRe = /<img\b[^>]*>/gi;
  let match;
  while ((match = imgRe.exec(source))) {
    const tag = match[0];
    const src = (tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    const alt = (tag.match(/\balt\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
    if (!src) continue;
    if (!src.startsWith('/uploads/') && !src.startsWith('/assets/')) continue;
    if (SKIP_FUNDRAISING_IMAGE.test(src)) continue;
    images.push({ src, alt });
  }
  const text = plainText(source.replace(/<img\b[^>]*>/gi, ' '));
  const mustAttend = /must\s+attend/i.test(text);
  const description = looksLikeCssOrStyleDump(text)
    ? ''
    : text
      .replace(/\b(?:band\s+members|students)\s+must\s+attend!?/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return { images, description, mustAttend, text: description || '' };
}

function fundraiserPlace(event, leftoverDescription = '') {
  const location = plainText(event?.location);
  const raw = leftoverDescription || plainText(event?.description);
  let description = raw;
  let where = location;
  if (!where && raw) {
    const address = raw.match(ADDRESS_IN_TEXT);
    if (address) {
      where = address[0].replace(/\s+/g, ' ').trim();
      description = raw.replace(address[0], ' ').replace(/\s+/g, ' ').trim();
    }
  }
  description = description
    .replace(/\b(?:band\s+members|students)\s+must\s+attend!?/gi, ' ')
    .replace(/\blocation\s+tbd\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { description, where };
}

function addHtmlClass(openTag, className) {
  const source = String(openTag || '');
  if (new RegExp(`\\b${className}\\b`).test(source)) return source;
  if (/\bclass\s*=\s*["']/.test(source)) {
    return source.replace(/\bclass\s*=\s*["']([^"']*)["']/, (full, value) => `class="${value} ${className}"`);
  }
  return source.replace(/>$/, ` class="${className}">`);
}

function stripLegacyFundraisingExtras(html = '') {
  return String(html || '')
    .replace(/<div\b[^>]*data-fundraising-cards[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<article\b[^>]*(?:data-square-donate|square-donate-card)[^>]*>[\s\S]*?<\/article>/gi, '')
    .replace(/<(section|div)\b[^>]*(?:data-fundraising-help)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(section|div|form)\b[^>]*(?:data-email-list-signup|email-list-signup)[^>]*>[\s\S]*?<\/\1>/gi, '');
}

function hideEmptyFundraisingBodyField(html = '') {
  return String(html || '').replace(
    /<([a-z0-9]+)\b([^>]*data-cms-field=["']body_text["'][^>]*)>([\s\S]*?)<\/\1>/i,
    (full, tag, attrs, inner) => {
      if (!fundraisingInnerIsBlank(inner)) {
        return `<${tag}${attrs}>${collapseEmptyFundraisingParagraphs(inner)}</${tag}>`;
      }
      const images = [];
      const imgRe = /<img\b[^>]*>/gi;
      let match;
      while ((match = imgRe.exec(inner))) images.push(match[0]);
      const kept = images.length
        ? images.map((img) => img.replace(/<img\b/i, '<img hidden')).join('')
        : '';
      const nextAttrs = /\bhidden\b/i.test(attrs) ? attrs : `${attrs} hidden`;
      return `<${tag}${nextAttrs}>${kept}</${tag}>`;
    },
  );
}

function replaceFundraisingBody(html, cardsHtml) {
  let next = stripLegacyFundraisingExtras(html);
  next = hideEmptyFundraisingBodyField(next);
  const list = `<h2 class="fundraising-list-title">Upcoming fundraisers</h2><div class="fundraising-card-list" data-fundraising-cards>${cardsHtml}</div>`;
  if (/data-cms-field=["']body_text["']/i.test(next)) {
    if (!/data-fundraising-cards/i.test(next)) {
      next = next.replace(
        /(<([a-z0-9]+)\b[^>]*data-cms-field=["']body_text["'][^>]*>[\s\S]*?<\/\2>)/i,
        `$1${list}`,
      );
    }
    next = next.replace(
      /<section\b[^>]*\bcontent\b[^>]*>/i,
      (open) => addHtmlClass(open, 'fundraising-cards'),
    );
    return next;
  }
  const block = `<section class="content fundraising-cards"><div class="wrap">${list}</div></section>`;
  if (/<\/section>/i.test(next)) return next.replace(/<\/section>/i, `</section>${block}`);
  return `${block}${next}`;
}

function fundraiserNeedsVolunteers(event, description = '') {
  const blob = `${event?.title || ''} ${event?.description || ''} ${description}`;
  return /volunteer|help needed|parents help|we need your help/i.test(blob);
}

function fundraiserCalendarHref(event = {}) {
  const date = String(event?.start_date || '').trim();
  return date ? `/calendar.html?date=${encodeURIComponent(date)}` : '/calendar.html';
}

export function applyFundraisingHeroIntro(html = '') {
  const replaceIfDefault = (full, open, inner, close) => (
    plainText(inner) === DEFAULT_FUNDRAISING_INTRO
      ? `${open}${escapeHtml(APPROVED_FUNDRAISING_INTRO)}${close}`
      : full
  );
  return String(html || '')
    .replace(/(<p\b[^>]*data-cms-field=["']intro["'][^>]*>)([\s\S]*?)(<\/p>)/i, replaceIfDefault)
    .replace(/(<h1\b[^>]*>\s*Fundraising\s*<\/h1>\s*<p\b(?![^>]*data-cms-field)[^>]*>)([\s\S]*?)(<\/p>)/i, replaceIfDefault);
}

function renderFundraiserPlaceholder(title, when = {}) {
  const month = String(when.month || '').slice(0, 3).toUpperCase();
  const day = String(when.day || '').replace(/^0/, '');
  const dateLabel = month && day ? `${month} ${day}` : 'SOON';
  return `<div class="ff-thumb" aria-hidden="true"><div class="fx-ph"><b>${escapeHtml(dateLabel)}</b><span>${escapeHtml(title)}</span></div></div>`;
}

export function renderFundraisingHelpRow() {
  return `<section class="content fundraising-help" data-fundraising-help>
  <div class="wrap">
    <h2 class="fundraising-help-title">Other ways to help</h2>
    <div class="fundraising-help-grid">
      <article class="fundraising-help-card is-donate" data-square-donate>
        <h3>Donate online</h3>
        <p>Give securely to support instruments, travel, meals, uniforms and student opportunities.</p>
        <button type="button" class="btn btn-gold" data-donate-open>Donate</button>
      </article>
      <article class="fundraising-help-card">
        <h3>Become a sponsor</h3>
        <p>Businesses can sponsor the band or donate goods and services, with a spot in our sponsor list.</p>
        <a class="btn btn-outline" href="/become-a-sponsor.html" data-sponsor-choice-open>Sponsor the band</a>
      </article>
      <article class="fundraising-help-card" data-email-list-signup data-email-list-topics="fundraising,calendar">
        <h3>Get fundraising emails</h3>
        <p>Hear about new fundraisers first. Reply STOP to any email to unsubscribe.</p>
        <button type="button" class="btn btn-outline" data-email-list-open>Subscribe</button>
      </article>
    </div>
  </div>
</section>`;
}

function sanitizePublicUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw.slice(0, 500);
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:') return url.toString().slice(0, 500);
  } catch {
    // ignore
  }
  return '';
}

function stripLeftoverFundraisingBodyCards(html = '') {
  return String(html || '').replace(
    /<article\b[^>]*\bclass="[^"]*\bcard\b[^"]*"[^>]*>[\s\S]*?<\/article>/gi,
    (full) => {
      if (/data-square-donate|square-donate-card|fundraising-card|feature-fund|fundraising-help/i.test(full)) {
        return full;
      }
      return '';
    },
  );
}

function renderFundraiserPrimaryButton({
  primaryButton,
  flyer,
  title,
  volunteers,
  calendarHref,
  primaryUrl = '',
} = {}) {
  const safeUrl = sanitizePublicUrl(primaryUrl);
  if (primaryButton === 'none') return '';
  if (primaryButton === 'view_flyer') {
    return flyer
      ? `<button type="button" class="btn btn-navy" data-photo-open data-photo-caption="${escapeAttr(title)}">View flyer</button>`
      : '';
  }
  if (primaryButton === 'volunteer') {
    return `<a class="btn btn-navy" href="${escapeAttr(safeUrl || '/boosters.html')}">Volunteer</a>`;
  }
  if (primaryButton === 'link') {
    return safeUrl ? `<a class="btn btn-navy" href="${escapeAttr(safeUrl)}">Learn more</a>` : '';
  }
  if (primaryButton === 'details') {
    return `<a class="btn btn-navy" href="${escapeAttr(safeUrl || calendarHref)}">View details</a>`;
  }
  if (flyer) {
    return `<button type="button" class="btn btn-navy" data-photo-open data-photo-caption="${escapeAttr(title)}">View flyer</button>`;
  }
  return `<a class="btn btn-navy" href="${escapeAttr(volunteers ? '/boosters.html' : calendarHref)}">${volunteers ? 'Volunteer' : 'View details'}</a>`;
}

export function cardToFundraisingEvent(card = {}) {
  return {
    title: card.title,
    description: card.description,
    location: card.location,
    start_date: card.event_date || card.start_date,
    start_time: card.start_time,
    end_time: card.end_time,
    all_day: card.start_time || card.end_time ? 0 : 1,
  };
}

export function renderFundraisingCardFromCms(card = {}) {
  const flyer = String(card.picture_mode || '') === 'image' ? sanitizePublicUrl(card.image_url) : '';
  return renderFundraisingCard(cardToFundraisingEvent(card), {
    flyer,
    flyerAlt: card.title,
    description: card.description,
    mustAttend: Boolean(Number(card.must_attend)),
    volunteersNeeded: Boolean(Number(card.volunteers_needed)),
    customLabel: card.custom_label,
    primaryButton: card.primary_button,
    primaryUrl: card.primary_url,
    showAddToCalendar: card.show_add_to_calendar == null ? true : Boolean(Number(card.show_add_to_calendar)),
  });
}

export function renderFundraisingCard(event, {
  flyer = '',
  flyerAlt = '',
  description = '',
  mustAttend = false,
  volunteersNeeded,
  customLabel = '',
  primaryButton,
  primaryUrl = '',
  showAddToCalendar = true,
} = {}) {
  const rawTitle = plainText(event?.title) || plainText(flyerAlt) || 'Current Fundraiser';
  const title = fundraiserDisplayTitle(rawTitle) || rawTitle;
  const when = event ? formatHomeEventWhen(event) : { long: '', short: '', time: '', month: '', day: '' };
  const facts = fundraiserPlace(event, description);
  const sub = facts.description && !looksLikeCssOrStyleDump(facts.description) ? facts.description : '';
  const attend = mustAttend || /must\s+attend/i.test(`${event?.description || ''} ${description}`);
  const volunteers = volunteersNeeded != null
    ? Boolean(volunteersNeeded) && !attend
    : (!attend && fundraiserNeedsVolunteers(event, description));
  const whenLabel = when.long || when.short;
  const timeBit = fundraiserWhenTime(event);
  const whenValue = [whenLabel, timeBit].filter(Boolean).join(' · ');
  const factsHtml = (whenValue || facts.where)
    ? `<div class="ff-facts">${whenValue ? `<div><strong>When</strong><span>${escapeHtml(whenValue)}</span></div>` : ''}${facts.where ? `<div><strong>Where</strong><span>${escapeHtml(facts.where)}</span></div>` : ''}</div>`
    : '';
  const safeFlyer = sanitizePublicUrl(flyer);
  const media = safeFlyer
    ? `<button type="button" class="ff-thumb ff-media" data-photo-open aria-label="${escapeAttr(title)}" data-photo-caption="${escapeAttr(title)}"><img src="${escapeAttr(safeFlyer)}" alt="${escapeAttr(flyerAlt || `${title} flyer`)}"></button>`
    : renderFundraiserPlaceholder(title, when);
  const calendarHref = fundraiserCalendarHref(event);
  const primary = renderFundraiserPrimaryButton({
    primaryButton,
    flyer: safeFlyer,
    title,
    volunteers,
    calendarHref,
    primaryUrl,
  });
  const extra = plainText(customLabel);
  const pills = `<div class="pill-row"><span class="pill pill-gold">Fundraiser</span>${attend ? '<span class="pill pill-red">Band members must attend</span>' : ''}${volunteers ? '<span class="pill pill-blue">Volunteers needed</span>' : ''}${extra ? `<span class="pill">${escapeHtml(extra)}</span>` : ''}</div>`;
  const calendar = showAddToCalendar
    ? `<a class="btn btn-outline" href="${escapeAttr(calendarHref)}">Add to calendar</a>`
    : '';
  return `<article class="feature-fund fundraising-card${safeFlyer ? '' : ' no-flyer'}">
    ${media}
    <div class="ff-body">
      ${pills}
      <h3>${escapeHtml(title)}</h3>
      ${sub ? `<p class="ff-sub">${escapeHtml(sub)}</p>` : ''}
      ${factsHtml}
      <div class="btn-row">
        ${primary}
        ${calendar}
      </div>
    </div>
  </article>`;
}

export function decorateFundraisingPage(html, data = {}) {
  const source = applyFundraisingHeroIntro(collapseEmptyFundraisingParagraphs(String(html || '')));
  if (!source.trim()) return source;
  let cards = [];
  if (Array.isArray(data.cards)) {
    cards = data.cards.map((card) => renderFundraisingCardFromCms(card)).filter(Boolean);
  } else {
    const media = extractFundraisingMedia(source);
    const events = selectHomeSchedule(data.events || []).fundraisers;
    const count = Math.max(events.length, media.images.length, (events.length || media.images.length || media.description) ? 1 : 0);
    for (let index = 0; index < count; index += 1) {
      const event = events[index] || null;
      const flyer = media.images[index] || (index === 0 ? media.images[0] : null);
      const leftover = index === 0 ? media.description : '';
      if (!event && !flyer?.src && !leftover) continue;
      const rawAlt = flyer?.alt || '';
      cards.push(renderFundraisingCard(event, {
        flyer: flyer?.src || '',
        flyerAlt: /^\d+$/.test(rawAlt) ? '' : rawAlt,
        description: leftover,
        mustAttend: index === 0 && media.mustAttend,
      }));
    }
  }
  let next = source;
  if (cards.length) next = replaceFundraisingBody(next, cards.join(''));
  else next = hideEmptyFundraisingBodyField(stripLegacyFundraisingExtras(next));
  if (Array.isArray(data.cards)) next = stripLeftoverFundraisingBodyCards(next);
  if (!/\bdata-fundraising-help\b/.test(next)) {
    next = /<\/section>/i.test(next)
      ? next.replace(/<\/section>(?![\s\S]*<\/section>)/i, `</section>${renderFundraisingHelpRow()}`)
      : `${next}${renderFundraisingHelpRow()}`;
  }
  return next;
}

function replaceSlot(html, name, inner) {
  if (inner == null) return String(html || '');
  const source = String(html || '');
  const openRe = new RegExp(`<([a-z0-9]+)\\b[^>]*\\bdata-home-slot="${name}"[^>]*>`, 'i');
  const open = openRe.exec(source);
  if (!open) return source;
  const tag = open[1].toLowerCase();
  const contentStart = open.index + open[0].length;
  const token = new RegExp(`</?${tag}\\b[^>]*>`, 'gi');
  token.lastIndex = contentStart;
  let depth = 1;
  let match;
  while ((match = token.exec(source))) {
    if (match[0].startsWith('</')) depth -= 1;
    else depth += 1;
    if (depth === 0) {
      return `${source.slice(0, contentStart)}${inner}${source.slice(match.index)}`;
    }
  }
  return source;
}

export function stripHomeHeroLogoLockup(html) {
  return String(html || '').replace(/<div\b[^>]*\blogo-lockup\b[^>]*>[\s\S]*?<\/div>\s*/gi, '');
}

export function decorateHomeRedesign(html, data = {}) {
  let next = stripHomeHeroLogoLockup(html);
  if (!next.includes(HOME_REDESIGN_MARKER) && !next.includes('data-home-slot')) return next;
  const schedule = selectHomeSchedule(data.events || []);
  const deal = next.match(/data-home-deal[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '';
  const flyer = firstFundraisingImage(data.fundraisingHtml) || '/assets/home/mattress-flyer.jpg';
  if (schedule.nextFundraiser) {
    next = replaceSlot(next, 'next-fund', renderNextFundraiserCard(schedule.nextFundraiser, { dealHtml: deal }));
    next = replaceSlot(next, 'featured-fund', renderFeaturedFundraiser(schedule.nextFundraiser, { flyer, dealHtml: deal }));
  }
  const others = schedule.fundraisers.slice(1).map(renderOtherFundraiserCard).join('');
  if (others) next = replaceSlot(next, 'other-funds', others);
  if (schedule.display.length) {
    next = replaceSlot(next, 'events', schedule.display.map(renderHomeEventArticle).join(''));
  }
  const tiers = renderHomeSponsorTiers(data.tiers || {});
  if (tiers) next = replaceSlot(next, 'sponsor-tiers', tiers);
  const officers = renderHomeOfficers(
    (data.members || []).filter((member) => member?.name && !/^name tbd$/i.test(plainText(member.name))),
  );
  if (officers) next = replaceSlot(next, 'officers', officers);
  const sponsorList = Array.isArray(data.sponsors) ? data.sponsors : [];
  if (sponsorList.some((sponsor) => String(sponsor?.logo_url || '').trim())) {
    const thanks = renderHomeSponsorThanks(sponsorList);
    if (thanks) next = replaceSlot(next, 'sponsor-thanks', thanks);
  }
  const instagram = String(data.instagramHref || '').trim();
  if (instagram) {
    next = next.replace(/href="#instagram"/g, `href="${escapeAttr(instagram)}"`);
  } else {
    next = next.replace(/<a\b[^>]*href="#instagram"[^>]*>[\s\S]*?<\/a>/i, '');
  }
  return next;
}

export function upgradeHomeBody(html) {
  const source = String(html || '');
  if (!source.trim()) return buildHomeRedesignDocument();
  if (source.includes(HOME_REDESIGN_MARKER) || source.includes('data-home-slot="next-fund"')) {
    return stripHomeHeroLogoLockup(source);
  }
  const heroCard = source.match(/<aside\b[^>]*\bhero-card\b[\s\S]*?<\/aside>/i)?.[0] || DEFAULT_HERO_CARD;
  return buildHomeRedesignDocument({ heroCardHtml: heroCard });
}

export function plainHeroSubtitle(value) {
  return plainText(value);
}

export const COMING_SOON_PAGES = [
  {
    slug: 'coming-soon',
    path: '/coming-soon.html',
    title: 'Coming Soon',
    heading: 'Coming soon',
    intro: 'This page is on the way. Check back soon, or contact the band office.',
  },
  {
    slug: 'join',
    path: '/join.html',
    title: 'Join the Band',
    heading: 'Join the Band',
    intro: 'Interest forms, handbook, and fee details will live here. Until then, contact the band office and we will help you get started.',
  },
  {
    slug: 'volunteer',
    path: '/volunteer.html',
    title: 'Volunteer',
    heading: 'Volunteer',
    intro: 'Volunteer sign-up is coming soon. The Band Boosters can tell you where help is needed right now.',
  },
];

export function comingSoonPageHtml(page) {
  const heading = page.heading || page.title || 'Coming soon';
  const intro = page.intro || 'This page is on the way.';
  return `<section class="page-hero coming-soon-hero" data-cms-layout="standard"><div class="page-title"><div class="kicker" data-cms-field="kicker">Coming soon</div><h1 data-cms-field="heading">${escapeHtml(heading)}</h1><p data-cms-field="intro">${escapeHtml(intro)}</p></div></section><section class="content"><div class="wrap"><div class="card" data-cms-field="body_text"><p>East Forsyth High School band office: (336) 703-6735.</p><p><a class="btn primary" href="/contact.html">Contact the band</a></p></div></div></section>`;
}

export function injectComingSoonLogos(html, { logo = '/assets/efhs-logo.png', mark = '/assets/efhs-blue-regiment-mark.png' } = {}) {
  const source = String(html || '');
  if (!source.trim() || /coming-soon-logos/i.test(source)) return source;
  const logos = `<div class="coming-soon-logos"><img src="${escapeAttr(logo)}" alt="East Forsyth High School Eagles logo"><img src="${escapeAttr(mark)}" alt="East Forsyth Blue Regiment logo"></div>`;
  const openRe = /<div\b[^>]*>/gi;
  let replaced = false;
  const next = source.replace(openRe, (tag) => {
    if (replaced) return tag;
    const quoted = tag.match(/\bclass\s*=\s*(["'])([\s\S]*?)\1/i);
    const unquoted = quoted ? '' : (tag.match(/\bclass\s*=\s*([^\s>]+)/i)?.[1] || '');
    const className = String(quoted?.[2] || unquoted || '').replace(/["']/g, '');
    if (!/(^|\s)page-title(\s|$)/i.test(className)) return tag;
    replaced = true;
    return `${tag}${logos}`;
  });
  return replaced ? next : `${logos}${source}`;
}

export function buildHomeRedesignDocument({ heroCardHtml = DEFAULT_HERO_CARD } = {}) {
  return `<div class="home-redesign" ${HOME_REDESIGN_MARKER}>
<section class="hero">
  <div class="hero-photo" role="img" aria-label="The Blue Regiment on the field at a home game performance"></div>
  <div class="hero-glow"></div>
  <div class="wrap hero-inner">
    <div class="hero-copy">
      <div class="eyebrow">East Forsyth High School · Kernersville, NC</div>
      <h1 data-site-field="hero_title"><span>Sound. Spirit.</span> Eagle Pride.</h1>
      <p class="lead" data-site-field="hero_subtitle">${escapeHtml(APPROVED_HERO_SUBTITLE)}</p>
      <div class="hero-ctas">
        <a class="btn btn-gold btn-lg" href="/fundraising.html" data-donate-open>${HEART}Support the Band</a>
        <a class="btn btn-ghost-light btn-lg" href="/join.html">Join the Band ${ARROW}</a>
      </div>
    </div>
    <aside class="next-fund" data-home-slot="next-fund" data-home-dynamic>
      <div class="nf-flag">Save the date</div>
      <div class="nf-kicker">Next fundraiser</div>
      <h2>Mattress Fundraiser</h2>
      <div class="nf-date"><b>Sat, Oct 24</b><span>10 AM – 5 PM</span></div>
      <p class="nf-where">Mattress Warehouse of Kernersville<br>820 South Main Street, Kernersville, NC 27284</p>
      <p class="nf-deal" data-home-deal>Save <b>30%–70%</b> off retail pricing</p>
      <a class="btn btn-blue btn-block" href="/fundraising.html">Fundraiser details</a>
    </aside>
    ${heroCardHtml}
  </div>
  <svg class="hero-wave" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true"><path fill="#ffffff" d="M0 62c42-26 78 18 118 2 46-18 72 32 118 6 44-24 86 26 128 4 48-24 76 30 124 8 46-22 90 24 132 2 44-22 78 32 122 8 48-26 84 18 126 0 40-18 74 28 114 8 36-18 60 16 90 4 26-10 46 14 68 6V120H0z"/></svg>
</section>
<section class="quick">
  <div class="wrap quick-grid">
    <a class="quick-tile" href="/fundraising.html" data-donate-open><span class="qi qi-gold">${HEART}</span><span><b>Give online</b><small>Secure direct donation to the band</small></span>${CHEV}</a>
    <a class="quick-tile" href="/become-a-sponsor.html"><span class="qi qi-blue"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z"/></svg></span><span><b>Become a sponsor</b><small>Business packages from $250</small></span>${CHEV}</a>
    <a class="quick-tile" href="/join.html"><span class="qi qi-navy"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3v11.3A3.5 3.5 0 1 0 11 17.5V8h6V3H9z"/></svg></span><span><b>Join the band</b><small>New students &amp; families start here</small></span>${CHEV}</a>
    <a class="quick-tile" href="/volunteer.html"><span class="qi qi-red"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.7 0-6 1.3-6 3.5V19h12v-2.5C14 14.3 10.7 13 8 13zm8 0c-.4 0-.8 0-1.2.1 1.3.9 2.2 2 2.2 3.4V19h5v-2.5c0-2.2-3.3-3.5-6-3.5z"/></svg></span><span><b>Volunteer</b><small>Help the Band Boosters</small></span>${CHEV}</a>
  </div>
</section>
<section id="support" class="sec">
  <div class="wrap">
    <div class="sec-head">
      <div><div class="kicker">Support the Band</div><h2>Fuel the Blue Regiment</h2></div>
      <p>Our fundraising efforts help provide students with the equipment, experiences, and opportunities needed to continue growing as musicians. Discover how you can make a difference through giving, sponsorships, and participation.</p>
    </div>
    <article class="feature-fund" data-home-slot="featured-fund" data-home-dynamic>
      <div class="ff-media"><img src="/assets/home/mattress-flyer.jpg" alt="Mattress Fundraiser flyer — Save the Date, Saturday October 24th, 2026"></div>
      <div class="ff-body">
        <div class="pill-row"><span class="pill pill-gold">Featured fundraiser</span><span class="pill pill-red">Band members must attend</span></div>
        <h3>Mattress Fundraiser</h3>
        <p class="ff-sub">Support the East Forsyth High School Band, Color Guard/Flag Team at our live Mattress Fundraiser.</p>
        <dl class="ff-facts">
          <div><dt>When</dt><dd>Saturday, October 24th, 2026<br>10 AM – 5 PM</dd></div>
          <div><dt>Where</dt><dd>Mattress Warehouse of Kernersville<br>820 South Main Street, Kernersville, NC 27284</dd></div>
          <div class="ff-deal"><dt>The deal</dt><dd>Save <b>30%–70%</b> off retail pricing</dd></div>
        </dl>
        <div class="btn-row">
          <a class="btn btn-blue" href="/calendar.html">View on calendar</a>
          <a class="btn btn-outline" href="https://www.google.com/maps/search/?api=1&amp;query=820%20South%20Main%20Street%20Kernersville%20NC%2027284" target="_blank" rel="noopener noreferrer">Get directions</a>
          <a class="btn btn-link" href="/fundraising.html">Fundraising page ${ARROW}</a>
        </div>
      </div>
    </article>
    <div class="fund-grid">
      <div data-home-slot="other-funds" data-home-dynamic>
        <article class="fund-card photo-card" style="--img:url('/assets/home/home2-13.jpg')">
          <div class="fc-top"><span class="pill pill-light">Fundraiser · Nov 7</span></div>
          <div class="fc-body">
            <h3>Silent Auction</h3>
            <p>Students and parents help needed. Location TBD.</p>
            <a class="btn btn-gold btn-sm" href="/boosters.html">I can help</a>
          </div>
        </article>
      </div>
      <article class="fund-card donate-card">
        <span class="pill pill-onnavy">Donate</span>
        <h3>Direct Support</h3>
        <p>Give securely online to support instruments, travel, meals, uniforms, and student opportunities.</p>
        <a class="btn btn-gold btn-block" href="/fundraising.html" data-donate-open>Donate securely</a>
      </article>
      <article class="fund-card sponsor-card">
        <span class="pill pill-blue">Businesses</span>
        <h3>Sponsor / In-Kind</h3>
        <p>Partner with us and make a lasting impact on our students while showcasing your business's commitment to our community.</p>
        <p class="small-muted">Bronze $250 · Silver $500 · Gold $1000</p>
        <a class="btn btn-blue btn-block" href="/become-a-sponsor.html">See sponsor packages</a>
      </article>
    </div>
    <div class="impact">
      <div class="impact-label">Every gift helps provide</div>
      <ul>
        <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3v11.3A3.5 3.5 0 1 0 11 17.5V8h6V3H9z"/></svg>Instruments</li>
        <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16c0 .9.4 1.7 1 2.2V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.8c.6-.5 1-1.3 1-2.2V6c0-3.5-3.6-4-8-4S4 2.5 4 6v10zm3.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM18 11H6V6h12v5z"/></svg>Travel</li>
        <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.1 1.7 3.8 3.8 4V22h2.5v-9c2.1-.2 3.7-1.9 3.7-4V2h-2v7zm5-3v8h2.5v8H21V2c-2.8 0-5 2.2-5 4z"/></svg>Meals</li>
        <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3l-4 2-4-2-5 3 2 5 2-1v11h10V10l2 1 2-5-5-3z"/></svg>Uniforms</li>
        <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z"/></svg>Student opportunities</li>
      </ul>
      <a class="btn btn-outline-light btn-sm" href="#support" data-email-list-open>Get fundraising updates by email</a>
    </div>
  </div>
</section>
<section id="sponsor" class="sec soft">
  <div class="wrap">
    <div class="sec-head">
      <div><div class="kicker">Become a Sponsor</div><h2>Back Eagle Pride</h2></div>
      <p>Three clear ways to back Eagle Pride — from a website marquee feature to full game-day recognition. All our sponsorships are deeply appreciated and are recognized!</p>
    </div>
    <div class="tiers" data-home-slot="sponsor-tiers" data-home-dynamic>
      <article class="tier tier-bronze"><div class="tier-name">Bronze</div><div class="tier-price">$250</div><p class="tier-tag">Put your brand in front of families online.</p><ul><li>Logo featured on the website sponsor marquee</li><li>Logos on our handouts</li></ul><a class="btn btn-outline btn-block" href="/become-a-sponsor.html">Choose Bronze</a></article>
      <article class="tier tier-silver"><div class="tier-name">Silver</div><div class="tier-price">$500</div><p class="tier-tag">Stand out across the site experience.</p><ul><li>Logo featured on the website sponsor marquee</li><li>Homepage fly-in advert for your business</li><li>Logos on our handouts</li></ul><a class="btn btn-outline btn-block" href="/become-a-sponsor.html">Choose Silver</a></article>
      <article class="tier tier-gold"><div class="tier-ribbon">Top package</div><div class="tier-name">Gold</div><div class="tier-price">$1000</div><p class="tier-tag">Our top package for game-day and digital impact.</p><ul><li>Logo featured on the website sponsor marquee</li><li>Homepage splash screen for your business</li><li>Advertisement on our handout material and Game Day press box announcement</li><li>Sponsorship added to our annual apparel</li></ul><a class="btn btn-gold btn-block" href="/become-a-sponsor.html">Choose Gold</a></article>
    </div>
    <div class="thanks">
      <div class="thanks-label">Thank you to our sponsors</div>
      <div class="thanks-logos">
        <div data-home-slot="sponsor-thanks" data-home-dynamic class="thanks-logos-live">
          <figure class="sp sp-gold"><img src="/assets/home/aireserv.jpg" alt=""><figcaption><b>Our sponsors</b><span>Recognized on the site</span></figcaption></figure>
        </div>
        <a class="sp sp-empty" href="/become-a-sponsor.html"><span>+</span><div><b>Your business here</b><small>Sponsor/In-Kind inquiry</small></div></a>
      </div>
    </div>
  </div>
</section>
<section id="join" class="sec join">
  <div class="join-glow"></div>
  <div class="wrap">
    <div class="sec-head on-dark">
      <div><div class="kicker">For students &amp; new families</div><h2>Join the Blue Regiment</h2></div>
      <p>Explore our marching band, concert bands, percussion, color guard, jazz, and chamber ensembles — there's a place for every musician and performer at East Forsyth.</p>
    </div>
    <div class="join-top">
      <figure class="join-photo"><img src="/assets/home/band-2024-25.jpg" alt="East Forsyth High School Band group photo"><figcaption>East Forsyth High School Band</figcaption></figure>
      <div class="ensembles">
        <article class="ens" style="--img:url('/assets/home/perf-5.jpg')"><h3>Marching Band</h3><p>Football performances, competitions &amp; parades</p></article>
        <article class="ens" style="--img:url('/assets/home/woodwind-practice.jpg')"><h3>Concert Bands</h3><p>Rehearsals, assessments &amp; concerts</p></article>
        <article class="ens" style="--img:url('/assets/home/home2-17.jpg')"><h3>Color Guard</h3><p>Flags, clinics &amp; performances</p></article>
        <article class="ens" style="--img:url('/assets/home/percussion-practice.png')"><h3>Indoor Percussion / Winter</h3><p>Winter season opportunities</p></article>
      </div>
    </div>
    <div class="join-cols">
      <div class="expect">
        <h3>What to expect</h3>
        <ul class="checks">
          <li><b>Rehearsals</b> Mon, Tue &amp; Thu, 4:15–6:30 PM during marching season</li>
          <li><b>Friday game nights</b> — home and away football performances</li>
          <li><b>Community parades</b> — Winston-Salem Veteran's Day, Winston-Salem Christmas &amp; Kernersville Christmas parades</li>
          <li><b>Dedicated staff</b> — Band Director Xander Kuropas with brass, woodwind, percussion and color guard staff</li>
        </ul>
      </div>
      <div class="steps">
        <h3>How to get started</h3>
        <ol>
          <li><span>1</span><div><b>Say hello</b><p>Reach out to the band program with your questions — (336) 703-6735 or the contact form.</p></div></li>
          <li><span>2</span><div><b>Come see us perform</b><p>Catch the Blue Regiment at a Friday game night — check the calendar.</p></div></li>
          <li><span>3</span><div><b>Meet the boosters</b><p>Parents and guardians: join the Band Boosters and help the program move.</p></div></li>
        </ol>
        <div class="btn-row"><a class="btn btn-gold" href="/join.html">I'm interested in joining</a><a class="btn btn-ghost-light" href="/directors.html">Meet the directors</a></div>
      </div>
    </div>
  </div>
</section>
<section id="boosters" class="sec">
  <div class="wrap boosters">
    <div class="boost-copy">
      <div class="kicker">Band Boosters</div>
      <h2>Parents make the program move.</h2>
      <p>The East Forsyth Band Boosters are a dedicated group of parents, guardians, and supporters working together to provide resources, encouragement, and assistance to help our students succeed.</p>
      <div class="help-tags"><span>Volunteer signups</span><span>Concessions</span><span>Uniforms</span><span>Meals</span><span>Transportation</span><span>Fundraising</span></div>
      <div class="btn-row"><a class="btn btn-blue" href="/volunteer.html">Volunteer interest</a><a class="btn btn-outline" href="/boosters.html">Booster info</a></div>
    </div>
    <div class="officers" data-home-slot="officers" data-home-dynamic>
      <div class="off"><img src="/assets/home/booster-president.jpg" alt="Jamie Olsen"><div><b>Jamie Olsen</b><span>Booster President</span></div></div>
      <div class="off"><img src="/assets/home/booster-vp.jpg" alt="Shirl Johnson"><div><b>Shirl Johnson</b><span>Vice President</span></div></div>
      <div class="off"><i>AM</i><div><b>Aimee McDaniel</b><span>Treasurer</span></div></div>
      <div class="off"><i>CK</i><div><b>Camilla Kerley</b><span>Secretary</span></div></div>
    </div>
  </div>
</section>
<section id="events" class="sec soft">
  <div class="wrap">
    <div class="sec-head">
      <div><div class="kicker">Upcoming</div><h2>On the calendar</h2></div>
      <div class="btn-row"><a class="btn btn-outline btn-sm" href="/subscribe">Add to Apple / Android calendar</a><a class="btn btn-blue btn-sm" href="/calendar.html">Full calendar</a></div>
    </div>
    <div class="events" data-home-slot="events" data-home-dynamic>
      <article class="ev"><div class="db">Oct<b>09</b></div><div><h3>Game Night</h3><p>Away Game at Parkland · Student Section Theme: Western Night</p></div><span class="ev-tag">Game</span></article>
      <article class="ev ev-deadline"><div class="db">Oct<b>09</b></div><div><h3>Band Photos</h3><p>Taken after dinner, before departure · 4–5 PM</p></div><span class="ev-tag">IMPORTANT</span></article>
      <article class="ev ev-fund"><div class="db">Oct<b>24</b></div><div><h3>Fundraiser / Mattress Sale</h3><p>Mattress Warehouse, 820 S Main St, Kernersville · Students must attend</p></div><span class="ev-tag">Fundraiser</span></article>
    </div>
    <p class="note">Band Practice: Mon, Tue &amp; Thu, 4:15–6:30 PM. No practice on published no-school days. Dates come from the Schedule Board.</p>
  </div>
</section>
<section id="gallery" class="sec">
  <div class="wrap">
    <div class="sec-head">
      <div><div class="kicker">Photos</div><h2>The Blue Regiment in action</h2></div>
      <div class="btn-row"><a class="btn btn-outline btn-sm" href="#instagram">Follow @efblueregiment</a><a class="btn btn-blue btn-sm" href="/gallery.html">View full gallery</a></div>
    </div>
    <div class="mosaic gallery" data-photo-gallery data-limit="8" data-sort="recent" data-keep-fallback="1">
      <figure class="gallery-item m-a"><img src="/assets/home/home1-1.jpg" alt="First Home Game"><figcaption>First Home Game!</figcaption></figure>
      <figure class="gallery-item m-b"><img src="/assets/home/perf-6.jpg" alt="Home Game Performance"><figcaption>Home Game Performance</figcaption></figure>
      <figure class="gallery-item m-c"><img src="/assets/home/glenn-1.jpg" alt="Away game at Glenn High School"><figcaption>Away game at Glenn</figcaption></figure>
      <figure class="gallery-item m-d"><img src="/assets/home/home1-5.jpg" alt="First Home Game"><figcaption>First Home Game!</figcaption></figure>
      <figure class="gallery-item m-e"><img src="/assets/home/home1-4.jpg" alt="First Home Game"><figcaption>First Home Game!</figcaption></figure>
      <figure class="gallery-item m-f"><img src="/assets/home/brass-practice.jpg" alt="Brass practice"><figcaption>Brass practice</figcaption></figure>
      <figure class="gallery-item m-g"><img src="/assets/home/march-on.jpg" alt="March on!"><figcaption>March on!</figcaption></figure>
      <figure class="gallery-item m-h"><img src="/assets/home/glenn-8.jpg" alt="Away game at Glenn High School"><figcaption>Away game at Glenn</figcaption></figure>
    </div>
  </div>
</section>
<section class="final">
  <div class="final-photo" role="img" aria-label="The Blue Regiment under the stadium lights"></div>
  <div class="wrap final-inner">
    <div class="final-logos"><img src="/assets/efhs-logo.png" alt="East Forsyth High School Eagles logo"><img src="/assets/efhs-blue-regiment-mark.png" alt="East Forsyth Blue Regiment logo"></div>
    <h2>Be part of the sound.</h2>
    <p>Give, sponsor, volunteer, or march with us — every bit of support strengthens the Blue Regiment tradition.</p>
    <div class="btn-row center"><a class="btn btn-gold btn-lg" href="/fundraising.html" data-donate-open>Support the Band</a><a class="btn btn-ghost-light btn-lg" href="/join.html">Join the Band</a></div>
  </div>
</section>
<section class="home-launch-note" data-cms-home-cards>
  <div class="wrap">
    <article class="card" data-cms-block="home-launch"><span class="tag" data-cms-field="launch_tag">Launch note</span><h3 data-cms-field="launch_heading">Early Release</h3><p data-cms-field="launch_body">Because some official names, dates, director bios, forms, and contact details were not provided yet, those areas are clearly vacant of information.</p><p class="draft" data-cms-field="launch_footer"></p></article>
  </div>
</section>
</div>`;
}

export function renderHomeStickySupport() {
  return `<div class="sticky-support"><a class="ss-join" href="/join.html">Join the Band</a><a class="ss-give" href="/fundraising.html" data-donate-open>${HEART}Support the Band</a></div>`;
}
