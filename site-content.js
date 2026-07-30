function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
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
    const limit = Number(container.dataset.limit || events.length || 0);
    const visibleEvents = events.slice(0, limit);
    if (!visibleEvents.length) return;
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
}

loadPublicContent();
