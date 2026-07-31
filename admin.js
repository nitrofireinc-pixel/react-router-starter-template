function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: options.body instanceof FormData ? { ...(options.headers || {}) } : { 'Content-Type': 'application/json', ...(options.headers || {}) },
    cache: 'no-store',
    ...options,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

const state = { me: null, pages: [], users: [], events: [], photos: [] };

function hasPermission(scope) {
  if (!state.me?.user) return false;
  if (state.me.user.role === 'admin') return true;
  return state.me.user.permissions.includes(scope) || state.me.user.permissions.includes('all');
}

function canEditPage(page) {
  return hasPermission('pages') || hasPermission(`page:${page.slug}`);
}

function fillForm(form, data) {
  for (const [key, value] of Object.entries(data || {})) {
    if (!form.elements[key]) continue;
    if (form.elements[key].type === 'checkbox') form.elements[key].checked = Boolean(value);
    else form.elements[key].value = value ?? '';
  }
}

function formPayload(form) {
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.active = Boolean(form.elements.active?.checked);
  return payload;
}

function textFromHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html || '';
  return template.content.textContent.replace(/\s+/g, ' ').trim();
}

function paragraphsFromNode(node) {
  if (!node) return '';
  const paragraphs = [...node.querySelectorAll('p')].map(p => p.textContent.trim()).filter(Boolean);
  return paragraphs.length ? paragraphs.join('\n\n') : node.textContent.replace(/\s+/g, ' ').trim();
}

function structuredPageFields(page) {
  const template = document.createElement('template');
  template.innerHTML = page.body_html || '';
  const root = template.content;
  const layout = root.querySelector('[data-cms-layout]')?.dataset.cmsLayout || (page.slug === 'calendar' ? 'calendar' : page.slug === 'contact' ? 'contact' : 'standard');
  const pageTitle = root.querySelector('.page-title');
  const bodyNode = root.querySelector('[data-cms-field="body_text"]') || (page.slug === 'calendar' ? null : root.querySelector('.content .card') || root.querySelector('.content .wrap'));
  const callout = root.querySelector('[data-cms-block="callout"], .notice');
  return {
    layout,
    kicker: root.querySelector('[data-cms-field="kicker"], .kicker')?.textContent.trim() || '',
    heading: root.querySelector('[data-cms-field="heading"], h1')?.textContent.trim() || page.title || '',
    intro: pageTitle?.querySelector('[data-cms-field="intro"], p')?.textContent.trim() || '',
    body_text: paragraphsFromNode(bodyNode) || (page.slug === 'calendar' ? 'Add calendar events from the Calendar tab. They will appear here automatically.' : textFromHtml(page.body_html)),
    callout_title: callout?.querySelector('[data-cms-field="callout_title"], h3')?.textContent.trim() || '',
    callout_text: paragraphsFromNode(callout?.querySelector('[data-cms-field="callout_text"]') || callout),
  };
}

function pagePayload(form) {
  const payload = formPayload(form);
  payload.nav_order = Number(payload.nav_order || 99);
  return payload;
}

function setSelectValue(select, value) {
  if (!select) return;
  if (value && ![...select.options].some(option => option.value === value)) {
    select.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`);
  }
  select.value = value || select.value;
}

function showAllowedPanels() {
  document.querySelector('#current-user').textContent = `${state.me.user.display_name || state.me.user.username} (${state.me.user.role})`;
  const panels = {
    pages: state.pages.some(canEditPage),
    site: hasPermission('site'),
    users: hasPermission('users'),
    events: hasPermission('events'),
    photos: hasPermission('photos'),
  };
  document.querySelectorAll('[data-tab]').forEach(button => {
    const allowed = panels[button.dataset.tab];
    button.hidden = !allowed;
    button.addEventListener('click', () => activateTab(button.dataset.tab));
  });
  Object.entries(panels).forEach(([name, allowed]) => {
    const panel = document.querySelector(`#tab-${name}`);
    if (panel) panel.hidden = !allowed;
  });
  activateTab(Object.keys(panels).find(key => panels[key]) || 'pages');
}

function activateTab(name) {
  document.querySelectorAll('.cms-panel').forEach(panel => panel.hidden = true);
  document.querySelector(`#tab-${name}`)?.removeAttribute('hidden');
  document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === name));
}

async function loadMe() {
  state.me = await jsonFetch('/api/admin/me');
  state.pages = state.me.pages;
  renderPagePermissionBoxes();
  showAllowedPanels();
}

async function loadSite() {
  if (!hasPermission('site')) return;
  const data = await jsonFetch('/api/site');
  fillForm(document.querySelector('#site-form'), data);
}

async function loadPages() {
  if (!state.pages.some(canEditPage)) return;
  state.pages = await jsonFetch('/api/admin/pages');
  renderPages();
  renderPagePermissionBoxes();
}

function renderPages() {
  const list = document.querySelector('#pages-list');
  list.innerHTML = state.pages.map(page => `
    <article class="admin-row">
      <div><b>${escapeHtml(page.title)}</b><span>${escapeHtml(page.path)} · permission: page:${escapeHtml(page.slug)}</span><small>${page.active ? 'Active' : 'Hidden'} · nav order ${page.nav_order}</small></div>
      <div class="row-actions"><button data-edit-page="${page.slug}">Edit</button>${hasPermission('pages') && !page.is_home ? `<button data-delete-page="${page.slug}">Delete</button>` : ''}</div>
    </article>
  `).join('');
  list.querySelectorAll('[data-edit-page]').forEach(button => button.addEventListener('click', () => {
    const page = state.pages.find(item => item.slug === button.dataset.editPage);
    const form = document.querySelector('#page-form');
    fillForm(form, { ...page, ...structuredPageFields(page), original_slug: page.slug });
    form.querySelector('[data-page-editor-title]').textContent = `Editing ${page.title}`;
    form.querySelector('[data-calendar-hint]').hidden = page.slug !== 'calendar';
    form.querySelector('[data-home-hint]').hidden = !page.is_home;
    form.elements.active.checked = Boolean(page.active);
    activateTab('pages');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  list.querySelectorAll('[data-delete-page]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Delete this page?')) return;
    await jsonFetch(`/api/admin/pages/${button.dataset.deletePage}`, { method: 'DELETE' });
    await refreshAll();
  }));
}

function renderPagePermissionBoxes() {
  const box = document.querySelector('#page-permission-boxes');
  if (!box) return;
  box.innerHTML = state.pages.map(page => `<label class="checkline"><input type="checkbox" name="permissions" value="page:${escapeHtml(page.slug)}"> ${escapeHtml(page.title)} (${escapeHtml(page.slug)})</label>`).join('');
}

async function loadUsers() {
  if (!hasPermission('users')) return;
  state.users = await jsonFetch('/api/admin/users');
  const list = document.querySelector('#users-list');
  list.innerHTML = state.users.map(user => `
    <article class="admin-row">
      <div><b>${escapeHtml(user.username)}</b><span>${escapeHtml(user.display_name || '')} · ${escapeHtml(user.role)}</span><small>${user.active ? 'Active' : 'Disabled'} · ${escapeHtml(user.permissions.join(', ') || 'no permissions')}</small></div>
      <div class="row-actions"><button data-edit-user="${user.id}">Edit</button>${user.id !== state.me.user.id ? `<button data-delete-user="${user.id}">Delete</button>` : ''}</div>
    </article>
  `).join('');
  list.querySelectorAll('[data-edit-user]').forEach(button => button.addEventListener('click', () => {
    const user = state.users.find(item => item.id === Number(button.dataset.editUser));
    const form = document.querySelector('#user-form');
    fillForm(form, { ...user, password: '' });
    form.querySelectorAll('input[name="permissions"]').forEach(input => input.checked = user.permissions.includes(input.value));
    form.elements.active.checked = Boolean(user.active);
    activateTab('users');
  }));
  list.querySelectorAll('[data-delete-user]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Delete this user?')) return;
    await jsonFetch(`/api/admin/users/${button.dataset.deleteUser}`, { method: 'DELETE' });
    await loadUsers();
  }));
}

async function loadEvents() {
  if (!hasPermission('events')) return;
  state.events = await jsonFetch('/api/events');
  const list = document.querySelector('#events-list');
  list.innerHTML = state.events.map(event => `
    <article class="admin-row">
      <div><b>${escapeHtml(event.date_label)} ${escapeHtml(event.date_detail)}</b><span>${escapeHtml(event.title)}</span><small>${escapeHtml(event.description)}</small></div>
      <div class="row-actions"><button data-edit-event="${event.id}">Edit</button><button data-delete-event="${event.id}">Delete</button></div>
    </article>
  `).join('');
  list.querySelectorAll('[data-edit-event]').forEach(button => button.addEventListener('click', () => {
    const event = state.events.find(item => item.id === Number(button.dataset.editEvent));
    const form = document.querySelector('#event-form');
    fillForm(form, event);
    setSelectValue(form.elements.date_label, event.date_label);
    setSelectValue(form.elements.date_detail, event.date_detail);
    activateTab('events');
  }));
  list.querySelectorAll('[data-delete-event]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Delete this event?')) return;
    await jsonFetch(`/api/admin/events/${button.dataset.deleteEvent}`, { method: 'DELETE' });
    await loadEvents();
  }));
}

async function loadPhotos() {
  if (!hasPermission('photos')) return;
  state.photos = await jsonFetch('/api/photos');
  const list = document.querySelector('#photos-list');
  list.innerHTML = state.photos.map(photo => `
    <article class="admin-row photo-row">
      <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.alt_text)}">
      <div><b>${escapeHtml(photo.caption || photo.original_name)}</b><span>${escapeHtml(photo.alt_text)}</span></div>
      <div class="row-actions"><button data-delete-photo="${photo.id}">Delete</button></div>
    </article>
  `).join('');
  list.querySelectorAll('[data-delete-photo]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Delete this photo?')) return;
    await jsonFetch(`/api/admin/photos/${button.dataset.deletePhoto}`, { method: 'DELETE' });
    await loadPhotos();
  }));
}

async function refreshAll() {
  await loadMe();
  await Promise.all([loadSite(), loadPages(), loadUsers(), loadEvents(), loadPhotos()]);
}

document.querySelector('#site-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  await jsonFetch('/api/admin/site', { method: 'POST', body: JSON.stringify(formPayload(form)) });
  document.querySelector('#site-status').textContent = 'Saved. Refresh the public site to see changes.';
});

document.querySelector('#logo-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector('#logo-status');
  status.textContent = 'Uploading...';
  const result = await jsonFetch('/api/admin/logo', { method: 'POST', body: new FormData(form) });
  form.reset();
  fillForm(document.querySelector('#site-form'), result.site);
  status.textContent = 'Logo uploaded and saved.';
});

document.querySelector('#page-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = pagePayload(form);
  const original = payload.original_slug;
  delete payload.original_slug;
  await jsonFetch(original ? `/api/admin/pages/${original}` : '/api/admin/pages', { method: original ? 'PUT' : 'POST', body: JSON.stringify(payload) });
  document.querySelector('#page-status').textContent = 'Page saved from text fields. No HTML editing needed.';
  await refreshAll();
});

document.querySelector('#new-page').addEventListener('click', () => {
  const form = document.querySelector('#page-form');
  form.reset();
  form.elements.original_slug.value = '';
  form.elements.layout.value = 'standard';
  form.elements.kicker.value = 'New page';
  form.elements.heading.value = 'New Page';
  form.elements.intro.value = 'Short introduction for this page.';
  form.elements.body_text.value = 'Add the page information here. Use blank lines to make separate paragraphs.';
  form.elements.callout_title.value = '';
  form.elements.callout_text.value = '';
  form.elements.active.checked = true;
  form.querySelector('[data-page-editor-title]').textContent = 'Create a new page';
  form.querySelector('[data-calendar-hint]').hidden = true;
  form.querySelector('[data-home-hint]').hidden = true;
});

document.querySelector('#user-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formPayload(form);
  payload.permissions = [...form.querySelectorAll('input[name="permissions"]:checked')].map(input => input.value);
  const id = payload.id;
  delete payload.id;
  await jsonFetch(id ? `/api/admin/users/${id}` : '/api/admin/users', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
  document.querySelector('#user-status').textContent = 'User saved.';
  form.reset();
  form.elements.active.checked = true;
  await loadUsers();
});

document.querySelector('#new-user').addEventListener('click', () => {
  const form = document.querySelector('#user-form');
  form.reset();
  form.elements.active.checked = true;
  form.querySelectorAll('input[name="permissions"]').forEach(input => input.checked = false);
});

document.querySelector('#event-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = formPayload(form);
  payload.sort_order = Number(payload.sort_order || 0);
  const id = payload.id;
  delete payload.id;
  await jsonFetch(id ? `/api/admin/events/${id}` : '/api/admin/events', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
  form.reset();
  await loadEvents();
});

document.querySelector('#new-event').addEventListener('click', () => {
  const form = document.querySelector('#event-form');
  form.reset();
  form.elements.date_label.value = 'Aug';
  form.elements.date_detail.value = '01';
});

document.querySelector('#photo-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector('#photo-status');
  status.textContent = 'Uploading...';
  try {
    await jsonFetch('/api/admin/photos', { method: 'POST', body: new FormData(form) });
    form.reset();
    await loadPhotos();
    status.textContent = 'Photo uploaded. Refresh the public homepage to see it.';
  } catch (error) {
    status.textContent = 'Photo upload failed. Try a JPG, PNG, WEBP, or GIF under 1.5 MB.';
    console.error(error);
  }
});

refreshAll().catch(error => {
  console.error(error);
  document.body.insertAdjacentHTML('afterbegin', `<div class="admin-card error">CMS failed to load: ${escapeHtml(error.message)}</div>`);
});
