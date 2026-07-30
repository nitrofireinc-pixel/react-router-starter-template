function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    cache: 'no-store',
    ...options,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function fillForm(form, data) {
  for (const [key, value] of Object.entries(data)) {
    if (form.elements[key]) form.elements[key].value = value ?? '';
  }
}

async function loadSite() {
  const data = await jsonFetch('/api/site');
  fillForm(document.querySelector('#site-form'), data);
}

async function loadEvents() {
  const events = await jsonFetch('/api/events');
  const list = document.querySelector('#events-list');
  list.innerHTML = events.map(event => `
    <article class="admin-row">
      <div><b>${escapeHtml(event.date_label)} ${escapeHtml(event.date_detail)}</b><span>${escapeHtml(event.title)}</span><small>${escapeHtml(event.description)}</small></div>
      <div class="row-actions"><button data-edit-event="${event.id}">Edit</button><button data-delete-event="${event.id}">Delete</button></div>
    </article>
  `).join('');
  list.querySelectorAll('[data-edit-event]').forEach(button => {
    button.addEventListener('click', () => {
      const event = events.find(item => item.id === Number(button.dataset.editEvent));
      fillForm(document.querySelector('#event-form'), event);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
  list.querySelectorAll('[data-delete-event]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!confirm('Delete this event?')) return;
      await fetch(`/api/admin/events/${button.dataset.deleteEvent}`, { method: 'DELETE' });
      await loadEvents();
    });
  });
}

async function loadPhotos() {
  const photos = await jsonFetch('/api/photos');
  const list = document.querySelector('#photos-list');
  list.innerHTML = photos.map(photo => `
    <article class="admin-row photo-row">
      <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.alt_text)}">
      <div><b>${escapeHtml(photo.caption || photo.original_name)}</b><span>${escapeHtml(photo.alt_text)}</span></div>
      <div class="row-actions"><button data-delete-photo="${photo.id}">Delete</button></div>
    </article>
  `).join('');
  list.querySelectorAll('[data-delete-photo]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!confirm('Delete this photo?')) return;
      await fetch(`/api/admin/photos/${button.dataset.deletePhoto}`, { method: 'DELETE' });
      await loadPhotos();
    });
  });
}

document.querySelector('#site-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  await jsonFetch('/api/admin/site', { method: 'POST', body: JSON.stringify(payload) });
  document.querySelector('#site-status').textContent = 'Saved.';
});

document.querySelector('#password-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  const status = document.querySelector('#password-status');
  try {
    await jsonFetch('/api/admin/password', { method: 'POST', body: JSON.stringify(payload) });
    form.reset();
    status.textContent = 'Password updated.';
  } catch (error) {
    status.textContent = 'Password update failed. Check your current password.';
  }
});

document.querySelector('#event-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.sort_order = Number(payload.sort_order || 0);
  const id = payload.id;
  delete payload.id;
  await jsonFetch(id ? `/api/admin/events/${id}` : '/api/admin/events', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(payload),
  });
  form.reset();
  await loadEvents();
});

document.querySelector('#new-event').addEventListener('click', () => document.querySelector('#event-form').reset());

document.querySelector('#photo-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  let status = document.querySelector('#photo-status');
  if (!status) {
    status = document.createElement('p');
    status.id = 'photo-status';
    status.className = 'status';
    form.appendChild(status);
  }
  status.textContent = 'Uploading...';
  try {
    const response = await fetch('/api/admin/photos', { method: 'POST', body: new FormData(form), cache: 'no-store' });
    if (!response.ok) throw new Error(await response.text());
    form.reset();
    await loadPhotos();
    status.textContent = 'Photo uploaded. Refresh the public homepage to see it.';
  } catch (error) {
    status.textContent = 'Photo upload failed. Try a JPG, PNG, WEBP, or GIF under 1 MB.';
    console.error(error);
  }
});

loadSite();
loadEvents();
loadPhotos();
