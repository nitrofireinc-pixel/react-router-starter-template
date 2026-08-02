function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
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

function showHomepageSponsorAd(sponsor) {
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
          <span class="sponsor-flyin-kicker">Community Partner</span>
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

  window.setTimeout(() => {
    if (document.body.contains(root)) dismissSponsorAd(root);
  }, 9000);
}

async function maybeShowHomepageSponsorAd() {
  if (!isHomePage()) return;
  try {
    const sponsors = await fetch('/api/sponsors', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : []));
    const eligible = (Array.isArray(sponsors) ? sponsors : []).filter((sponsor) => (
      Number(sponsor.active) !== 0 && Number(sponsor.homepage_ad) === 1
    ));
    if (!eligible.length) return;
    const picked = pickRandomSponsor(eligible);
    if (picked) showHomepageSponsorAd(picked);
  } catch {
    // Bypass the ad entirely if sponsors cannot be loaded.
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
      const value = site[element.dataset.siteField];
      if (value) element.textContent = value;
    });
    if (site.title) document.title = document.title.replace('East Forsyth Band', site.title);
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
        <div><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(event.description)}</p></div>
      </article>
    `).join('');
  });

  ensureBoosterMeetingsContainers();
  const boosterMeetings = (Array.isArray(events) ? events : []).filter((event) => Number(event.show_on_boosters) === 1);
  document.querySelectorAll('[data-booster-meetings]').forEach((container) => {
    if (!boosterMeetings.length) {
      container.innerHTML = '<p class="draft">No upcoming booster meetings are scheduled yet.</p>';
      return;
    }
    container.innerHTML = boosterMeetings.map((event) => `
      <article class="event">
        <div class="datebox">${escapeHtml(event.date_label)} <span>${escapeHtml(event.date_detail)}</span></div>
        <div><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(event.description)}</p></div>
      </article>
    `).join('');
  });

  document.querySelectorAll('[data-photo-gallery]').forEach(container => {
    if (!photos.length) return;
    container.innerHTML = photos.map(photo => `
      <figure class="gallery-item"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.alt_text)}"><figcaption>${escapeHtml(photo.caption || photo.alt_text)}</figcaption></figure>
    `).join('');
  });

  bindSponsorMapCards();
  await Promise.all([maybeShowHomepageSponsorAd(), loadContactForms()]);
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
