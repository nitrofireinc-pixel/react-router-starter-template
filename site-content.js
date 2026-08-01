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

  document.querySelectorAll('[data-photo-gallery]').forEach(container => {
    if (!photos.length) return;
    container.innerHTML = photos.map(photo => `
      <figure class="gallery-item"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.alt_text)}"><figcaption>${escapeHtml(photo.caption || photo.alt_text)}</figcaption></figure>
    `).join('');
  });

  await maybeShowHomepageSponsorAd();
}

loadPublicContent();
