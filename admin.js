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

const state = { me: null, pages: [], users: [], events: [], photos: [], sponsors: [], site: null };

function hasPermission(scope) {
  if (!state.me?.user) return false;
  if (state.me.user.role === 'admin') return true;
  return state.me.user.permissions.includes(scope) || state.me.user.permissions.includes('all');
}

function canEditPage(pageOrSlug) {
  const slug = typeof pageOrSlug === 'string' ? pageOrSlug : pageOrSlug.slug;
  return hasPermission('pages') || hasPermission(`page:${slug}`);
}

function canEditSponsors() {
  return hasPermission('sponsors') || canEditPage('sponsors');
}

function fillForm(form, data) {
  if (!form) return;
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
  const pageTitle = root.querySelector('.page-title');
  const bodyNode = root.querySelector('[data-cms-field="body_text"]') || (page.slug === 'calendar' ? null : root.querySelector('.content .card') || root.querySelector('.content .wrap'));
  const callout = root.querySelector('[data-cms-block="callout"], .notice');
  return {
    layout: root.querySelector('[data-cms-layout]')?.dataset.cmsLayout || (page.slug === 'calendar' ? 'calendar' : page.slug === 'contact' ? 'contact' : 'standard'),
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

function escapeAttr(value) {
  return escapeHtml(value);
}

function paragraphsFromText(value) {
  return String(value || '')
    .split(/\n\s*\n/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function layoutChipLabel(layout) {
  return ({
    standard: 'Standard layout',
    calendar: 'Calendar layout',
    contact: 'Contact layout',
  })[layout] || 'Standard layout';
}

const PAGE_FIELD_LABELS = {
  kicker: 'Small label',
  heading: 'Heading',
  intro: 'Intro',
  body_text: 'Body content',
  callout_title: 'Callout title',
  callout_text: 'Callout text',
};

function editableField(name, tag, value, placeholder = '', extraClass = '') {
  const classes = ['cms-edit-field', extraClass].filter(Boolean).join(' ');
  const content = escapeHtml(value || '');
  const label = PAGE_FIELD_LABELS[name] || name;
  return `<${tag} class="${classes}" data-cms-field="${escapeAttr(name)}" data-edit-label="${escapeAttr(label)}" contenteditable="true" role="textbox" spellcheck="true" aria-label="${escapeAttr(label)}" data-placeholder="${escapeAttr(placeholder)}">${content}</${tag}>`;
}

function editableRichField(name, value, placeholder = '') {
  const html = paragraphsFromText(value) || '<p></p>';
  const label = PAGE_FIELD_LABELS[name] || name;
  return `<div class="cms-edit-field cms-edit-rich" data-cms-field="${escapeAttr(name)}" data-edit-label="${escapeAttr(label)}" contenteditable="true" role="textbox" spellcheck="true" aria-label="${escapeAttr(label)}" data-placeholder="${escapeAttr(placeholder)}">${html}</div>`;
}

function buildEditablePagePreview(payload = {}) {
  const layout = String(payload.layout || 'standard');
  const kicker = String(payload.kicker || 'Page');
  const heading = String(payload.heading || payload.title || 'Untitled Page');
  const intro = String(payload.intro || '');
  const body = String(payload.body_text || '');
  const calloutTitle = String(payload.callout_title || '').trim();
  const calloutText = String(payload.callout_text || '').trim();
  const showCallout = Boolean(calloutTitle || calloutText);
  const callout = showCallout
    ? `<aside class="notice cms-edit-block" data-cms-block="callout"><div class="cms-edit-block-bar"><span>Callout</span><button type="button" class="cms-edit-remove" data-remove-callout>Remove</button></div>${editableField('callout_title', 'h3', calloutTitle || 'Note', 'Callout title')}${editableRichField('callout_text', calloutText, 'Callout details')}</aside>`
    : `<button type="button" class="cms-add-callout" data-add-callout>+ Add callout block</button>`;
  const hero = `<section class="page-hero" data-cms-layout="${escapeAttr(layout)}"><div class="page-title">${editableField('kicker', 'div', kicker, 'Small label', 'kicker')}${editableField('heading', 'h1', heading, 'Page heading')}${editableField('intro', 'p', intro, 'Short intro sentence')}</div></section>`;
  const eventsPlaceholder = layout === 'calendar'
    ? '<div class="timeline cms-events-placeholder" data-events><article class="event"><div class="datebox">Aug<span>01</span></div><div><h3>Events appear here</h3><p>Manage real calendar items in the Calendar Events tab.</p></div></article></div>'
    : '';

  if (layout === 'calendar') {
    return `${hero}<section class="content soft"><div class="wrap">${editableRichField('body_text', body || 'Add calendar instructions here.', 'Page instructions')}${eventsPlaceholder}${callout}</div></section>`;
  }
  if (layout === 'contact') {
    return `${hero}<section class="content"><div class="wrap grid two"><article class="card">${editableRichField('body_text', body || 'Add contact details here.', 'Main contact content')}</article>${showCallout ? callout : '<article class="card accent-card cms-edit-block"><div class="cms-edit-block-bar"><span>Accent card</span><button type="button" class="cms-edit-remove" data-add-callout>Replace with callout</button></div><h3>Contact details</h3><p>Add a callout to customize this side panel.</p></article>'}</div></section>`;
  }
  return `${hero}<section class="content"><div class="wrap"><div class="card">${editableRichField('body_text', body || 'Add the page information here.', 'Main page content')}</div>${callout}</div></section>`;
}

const pageEditor = { rebuilding: false, bound: false };

function showPageEditorChrome(active) {
  document.querySelector('#page-form')?.toggleAttribute('hidden', !active);
  document.querySelector('#page-preview')?.toggleAttribute('hidden', !active);
  document.querySelector('[data-page-preview-empty]')?.toggleAttribute('hidden', active);
}

function syncFieldFromPreview(field) {
  const form = document.querySelector('#page-form');
  if (!form || !field?.dataset.cmsField) return;
  const name = field.dataset.cmsField;
  const control = form.elements[name];
  if (!control) return;
  const value = field.classList.contains('cms-edit-rich')
    ? paragraphsFromNode(field)
    : field.textContent.replace(/\s+/g, ' ').trim();
  if (control.value !== value) control.value = value;
}

function syncPreviewFromForm() {
  if (pageEditor.rebuilding) return;
  const form = document.querySelector('#page-form');
  const preview = document.querySelector('#page-preview');
  if (!form || !preview || form.hidden) return;
  pageEditor.rebuilding = true;
  try {
    const payload = pagePayload(form);
    preview.innerHTML = buildEditablePagePreview(payload);
    const chip = document.querySelector('[data-page-layout-chip]');
    if (chip) chip.textContent = layoutChipLabel(payload.layout);
    bindPagePreviewInteractions(preview);
  } finally {
    pageEditor.rebuilding = false;
  }
}

function bindPagePreviewInteractions(preview) {
  preview.querySelectorAll('[data-cms-field]').forEach(field => {
    field.addEventListener('input', () => syncFieldFromPreview(field));
    field.addEventListener('blur', () => syncFieldFromPreview(field));
    field.addEventListener('focus', () => {
      preview.querySelectorAll('.cms-edit-field.is-focused').forEach(node => node.classList.remove('is-focused'));
      field.classList.add('is-focused');
    });
    field.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || field.classList.contains('cms-edit-rich')) return;
      event.preventDefault();
      field.blur();
    });
  });
  preview.querySelectorAll('[data-add-callout]').forEach(button => {
    button.addEventListener('click', () => {
      const form = document.querySelector('#page-form');
      if (!form.elements.callout_title.value) form.elements.callout_title.value = 'Note';
      if (!form.elements.callout_text.value) form.elements.callout_text.value = 'Add an important note for families here.';
      syncPreviewFromForm();
      preview.querySelector('[data-cms-field="callout_title"]')?.focus();
    });
  });
  preview.querySelectorAll('[data-remove-callout]').forEach(button => {
    button.addEventListener('click', () => {
      const form = document.querySelector('#page-form');
      form.elements.callout_title.value = '';
      form.elements.callout_text.value = '';
      syncPreviewFromForm();
    });
  });
}

function bindPageVisualEditor() {
  if (pageEditor.bound) return;
  const form = document.querySelector('#page-form');
  const preview = document.querySelector('#page-preview');
  if (!form || !preview) return;
  pageEditor.bound = true;

  form.addEventListener('input', event => {
    if (pageEditor.rebuilding) return;
    const name = event.target?.name;
    if (!name) return;
    if (['layout', 'title'].includes(name)) {
      syncPreviewFromForm();
      return;
    }
    if (['kicker', 'heading', 'intro', 'body_text', 'callout_title', 'callout_text'].includes(name)) {
      const field = preview.querySelector(`[data-cms-field="${name}"]`);
      if (!field) {
        syncPreviewFromForm();
        return;
      }
      if (field.classList.contains('cms-edit-rich')) {
        field.innerHTML = paragraphsFromText(event.target.value) || '<p></p>';
      } else {
        field.textContent = event.target.value;
      }
    }
  });

  form.addEventListener('change', event => {
    if (event.target?.name === 'layout') syncPreviewFromForm();
  });

  preview.addEventListener('paste', event => {
    const field = event.target.closest?.('[data-cms-field]');
    if (!field) return;
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    if (field.classList.contains('cms-edit-rich')) {
      document.execCommand('insertText', false, text);
    } else {
      document.execCommand('insertText', false, text.replace(/\s+/g, ' '));
    }
  });

  document.querySelector('#add-page-callout')?.addEventListener('click', () => {
    const title = form.elements.callout_title;
    const text = form.elements.callout_text;
    if (!title.value) title.value = 'Note';
    if (!text.value) text.value = 'Add an important note for families here.';
    syncPreviewFromForm();
    preview.querySelector('[data-cms-field="callout_title"]')?.focus();
  });
}

function setSelectValue(select, value) {
  if (!select) return;
  if (value && ![...select.options].some(option => option.value === value)) {
    select.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`);
  }
  select.value = value || select.value;
}

function setAdminNavOpen(open) {
  const toggle = document.querySelector('.admin-nav-toggle');
  const menu = document.querySelector('#admin-mobile-menu');
  if (!toggle || !menu) return;
  toggle.setAttribute('aria-expanded', String(open));
  menu.hidden = !open;
  document.querySelector('.admin-mobile-bar')?.classList.toggle('open', open);
}

function closeAdminNav() {
  setAdminNavOpen(false);
}

function renderMobileAdminMenu() {
  const menu = document.querySelector('#admin-mobile-menu');
  const sourceButtons = [...document.querySelectorAll('.admin-menu button')].filter(button => !button.hidden);
  if (!menu) return;
  menu.innerHTML = sourceButtons.map((button, index) => {
    const label = button.textContent.trim();
    const tab = button.dataset.tab || '';
    const shortcut = button.dataset.editShortcut || '';
    return `<button type="button" data-mobile-index="${index}" data-tab="${escapeHtml(tab)}" data-edit-shortcut="${escapeHtml(shortcut)}">${escapeHtml(label)}</button>`;
  }).join('');
  menu.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.mobileIndex);
      const source = sourceButtons[index];
      closeAdminNav();
      source?.click();
    });
  });
}

function activateTab(name) {
  document.querySelectorAll('.cms-panel').forEach(panel => panel.hidden = true);
  document.querySelector(`#tab-${name}`)?.removeAttribute('hidden');
  document.querySelectorAll('.admin-menu button').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === name && !button.dataset.editShortcut);
  });
  closeAdminNav();
}

function activatePageShortcut(slug) {
  document.querySelectorAll('.admin-menu button').forEach(button => button.classList.toggle('active', button.dataset.editShortcut === slug));
  closeAdminNav();
}

async function ensureFullPagesLoaded() {
  if (!state.pages.some(page => page.body_html !== undefined)) await loadPages();
}

function pageLabel(slug) {
  return ({ home: 'Home', directors: 'Directors & Staff', resources: 'Student Resources' }[slug]) || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function showAllowedPanels() {
  const displayName = state.me.user.display_name || state.me.user.username;
  document.querySelector('#current-user').innerHTML = `<b>${escapeHtml(displayName)}</b><span>${state.me.user.role === 'admin' ? 'Super Admin' : 'Editor'}</span>`;

  const panels = {
    dashboard: true,
    pages: state.pages.some(canEditPage),
    sponsors: canEditSponsors(),
    site: hasPermission('site'),
    users: hasPermission('users'),
    events: hasPermission('events') || canEditPage('calendar'),
    photos: hasPermission('photos'),
  };
  document.querySelectorAll('.admin-menu > [data-tab]').forEach(button => {
    const allowed = button.dataset.tab === 'dashboard' || panels[button.dataset.tab];
    button.hidden = !allowed;
    button.onclick = () => activateTab(button.dataset.tab);
  });
  document.querySelectorAll('[data-edit-shortcut]').forEach(button => {
    const slug = button.dataset.editShortcut;
    button.hidden = !state.pages.find(page => page.slug === slug && canEditPage(page));
    button.onclick = () => editPage(slug);
  });
  const newPageButton = document.querySelector('#new-page');
  if (newPageButton) newPageButton.hidden = true;
  const editCalendarPage = document.querySelector('#edit-calendar-page');
  if (editCalendarPage) {
    editCalendarPage.hidden = !canEditPage('calendar');
    editCalendarPage.onclick = () => editPage('calendar');
  }
  const newEventButton = document.querySelector('#new-event');
  const eventForm = document.querySelector('#event-form');
  const eventsList = document.querySelector('#events-list');
  if (newEventButton) newEventButton.hidden = !hasPermission('events');
  if (eventForm) eventForm.hidden = !hasPermission('events');
  if (eventsList) eventsList.hidden = !hasPermission('events');
  Object.entries(panels).forEach(([name, allowed]) => {
    const panel = document.querySelector(`#tab-${name}`);
    if (panel) panel.hidden = !allowed;
  });
  renderMobileAdminMenu();
  bindAdminNavToggle();
  renderDashboard();
  activateTab('dashboard');
}

function bindAdminNavToggle() {
  const toggle = document.querySelector('.admin-nav-toggle');
  if (!toggle || toggle.dataset.bound === '1') return;
  toggle.dataset.bound = '1';
  toggle.addEventListener('click', event => {
    event.stopPropagation();
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    if (open) renderMobileAdminMenu();
    setAdminNavOpen(open);
  });
  document.addEventListener('click', event => {
    const bar = document.querySelector('.admin-mobile-bar');
    if (!bar || bar.hidden || !bar.classList.contains('open')) return;
    if (!bar.contains(event.target)) closeAdminNav();
  });
}

async function loadMe() {
  state.me = await jsonFetch('/api/admin/me');
  state.pages = state.me.pages;
  renderPagePermissionBoxes();
  showAllowedPanels();
}

async function loadSite() {
  if (!hasPermission('site')) return;
  state.site = await jsonFetch('/api/site');
  fillForm(document.querySelector('#site-form'), state.site);
}

async function loadPages() {
  if (!state.pages.some(canEditPage)) return;
  state.pages = await jsonFetch('/api/admin/pages');
  document.querySelectorAll('[data-edit-shortcut]').forEach(button => {
    const slug = button.dataset.editShortcut;
    button.hidden = !state.pages.find(page => page.slug === slug && canEditPage(page));
  });
  renderMobileAdminMenu();
  renderPagePermissionBoxes();
}

function renderDashboard() {
  const dashboard = document.querySelector('#dashboard-cards');
  if (!dashboard) return;
  const displayName = state.me.user.display_name || state.me.user.username;
  const welcome = document.querySelector('#dashboard-welcome');
  if (welcome) welcome.textContent = `Welcome back, ${displayName}`;

  // Page edit shortcuts live in the left nav, so omit page cards here. Remaining cards respect assigned permissions.
  const cards = [
    canEditSponsors() && ['Sponsors', 'Add, edit, and reorder sponsor logos, names, and addresses.', 'sponsors', 'Community'],
    hasPermission('users') && ['User Management', 'Create editor accounts and assign page-level permissions.', 'users', 'Administration'],
    hasPermission('events') && ['Calendar Events', 'Manage event text and date blocks.', 'events', 'Program'],
  ].filter(Boolean);

  dashboard.innerHTML = cards.length
    ? cards.map(([title, text, target, kicker]) => `<button class="dash-card" type="button" data-dash-target="${target}"><span>${kicker}</span><b>${title}</b><small>${text}</small></button>`).join('')
    : '<p class="draft">No dashboard tools are available for your account. Use the page shortcuts in the left navigation.</p>';
  dashboard.querySelectorAll('[data-dash-target]').forEach(button => button.addEventListener('click', () => {
    activateTab(button.dataset.dashTarget);
  }));
}

function editPage(slug) {
  return (async () => {
    await ensureFullPagesLoaded();
    const page = state.pages.find(item => item.slug === slug);
    if (!page) return;
    const form = document.querySelector('#page-form');
    fillForm(form, { ...page, ...structuredPageFields(page), original_slug: page.slug });
    document.querySelector('[data-page-editor-title]').textContent = `Edit ${page.title}`;
    form.querySelector('[data-calendar-hint]').hidden = page.slug !== 'calendar';
    form.querySelector('[data-home-hint]').hidden = !page.is_home;
    form.elements.active.checked = Boolean(page.active);
    showPageEditorChrome(true);
    syncPreviewFromForm();
    activateTab('pages');
    activatePageShortcut(slug);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  })().catch(error => {
    console.error(error);
    showPageEditorChrome(true);
    document.querySelector('#page-status').textContent = `Could not open ${pageLabel(slug)}: ${error.message}`;
  });
}

function renderPagePermissionBoxes() {
  const box = document.querySelector('#page-permission-boxes');
  if (!box) return;
  box.innerHTML = state.pages.map(page => `<label class="checkline"><input type="checkbox" name="permissions" value="page:${escapeHtml(page.slug)}"> ${escapeHtml(page.title)}</label>`).join('');
}

async function loadSponsors() {
  if (!canEditSponsors()) return;
  state.sponsors = await jsonFetch('/api/admin/sponsors');
  renderSponsors();
}

function sponsorPreviewCard(sponsor, index = 0) {
  const featured = index === 0 ? ' sponsor-featured' : '';
  const mark = sponsor.logo_url ? `<span class="sponsor-logo"><img src="${escapeHtml(sponsor.logo_url)}" alt="${escapeHtml(sponsor.name)} logo"></span>` : `<span class="sponsor-mark">${escapeHtml(sponsor.mark_text || '★')}</span>`;
  return `<article class="sponsor-card${featured}">${mark}<div><span class="sponsor-level">${escapeHtml(sponsor.level || 'Sponsor')}</span><h3>${escapeHtml(sponsor.name)}</h3><p>${escapeHtml(sponsor.address || '')}</p></div></article>`;
}

function renderSponsors() {
  const list = document.querySelector('#sponsors-list');
  const ordered = [...state.sponsors].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  list.innerHTML = ordered.map((sponsor, index) => `
    <article class="admin-row sponsor-admin-row">
      <span class="drag-handle">☰</span>
      <div class="mini-logo">${sponsor.logo_url ? `<img src="${escapeHtml(sponsor.logo_url)}" alt="">` : escapeHtml(sponsor.mark_text || '★')}</div>
      <div><b>${escapeHtml(sponsor.name)}</b><span>${escapeHtml(sponsor.address || 'No address')}</span><small>${escapeHtml(sponsor.level || 'Sponsor')} · order ${sponsor.sort_order} · ${sponsor.active ? 'Active' : 'Hidden'}</small></div>
      <div class="row-actions"><button data-move-sponsor="${sponsor.id}" data-direction="up" ${index === 0 ? 'disabled' : ''}>↑</button><button data-move-sponsor="${sponsor.id}" data-direction="down" ${index === ordered.length - 1 ? 'disabled' : ''}>↓</button><button data-edit-sponsor="${sponsor.id}">Edit</button><button data-delete-sponsor="${sponsor.id}">Delete</button></div>
    </article>
  `).join('');
  document.querySelector('#sponsor-preview').innerHTML = ordered.filter(s => s.active).map(sponsorPreviewCard).join('') || '<p class="draft">No active sponsors yet.</p>';
  list.querySelectorAll('[data-edit-sponsor]').forEach(button => button.addEventListener('click', () => {
    const sponsor = state.sponsors.find(item => item.id === Number(button.dataset.editSponsor));
    const form = document.querySelector('#sponsor-form');
    fillForm(form, sponsor);
    form.elements.active.checked = Boolean(sponsor.active);
  }));
  list.querySelectorAll('[data-delete-sponsor]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Delete this sponsor?')) return;
    await jsonFetch(`/api/admin/sponsors/${button.dataset.deleteSponsor}`, { method: 'DELETE' });
    await loadSponsors();
  }));
  list.querySelectorAll('[data-move-sponsor]').forEach(button => button.addEventListener('click', async () => moveSponsor(Number(button.dataset.moveSponsor), button.dataset.direction)));
}

async function moveSponsor(id, direction) {
  const ordered = [...state.sponsors].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const index = ordered.findIndex(sponsor => sponsor.id === id);
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) return;
  const current = ordered[index];
  const swap = ordered[swapIndex];
  await jsonFetch(`/api/admin/sponsors/${current.id}`, { method: 'PUT', body: JSON.stringify({ ...current, sort_order: swap.sort_order }) });
  await jsonFetch(`/api/admin/sponsors/${swap.id}`, { method: 'PUT', body: JSON.stringify({ ...swap, sort_order: current.sort_order }) });
  await loadSponsors();
}

async function loadUsers() {
  if (!hasPermission('users')) return;
  state.users = await jsonFetch('/api/admin/users');
  const list = document.querySelector('#users-list');
  list.innerHTML = state.users.map(user => `
    <article class="admin-row">
      <div><b>${escapeHtml(user.display_name || user.username)}</b><span>${escapeHtml(user.username)} · ${user.role === 'admin' ? 'SUPER ADMIN' : 'EDITOR'}</span><small>${user.active ? 'Active' : 'Disabled'} · ${escapeHtml(user.permissions.join(', ') || 'no permissions')}</small></div>
      <div class="row-actions"><button data-edit-user="${user.id}">Edit</button>${user.id !== state.me.user.id ? `<button data-delete-user="${user.id}">Delete</button>` : ''}</div>
    </article>
  `).join('');
  list.querySelectorAll('[data-edit-user]').forEach(button => button.addEventListener('click', () => {
    const user = state.users.find(item => item.id === Number(button.dataset.editUser));
    const form = document.querySelector('#user-form');
    fillForm(form, { ...user, password: '' });
    form.querySelectorAll('input[name="permissions"]').forEach(input => input.checked = user.permissions.includes(input.value));
    form.elements.active.checked = Boolean(user.active);
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
  await Promise.all([loadSite(), loadPages(), loadSponsors(), loadUsers(), loadEvents(), loadPhotos()]);
}

function bindForms() {
  document.querySelector('#site-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    await jsonFetch('/api/admin/site', { method: 'POST', body: JSON.stringify(formPayload(form)) });
    document.querySelector('#site-status').textContent = 'Saved. Refresh the public site to see changes.';
  });

  document.querySelector('#logo-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector('#logo-status');
    status.textContent = 'Uploading...';
    const result = await jsonFetch('/api/admin/logo', { method: 'POST', body: new FormData(form) });
    form.reset();
    fillForm(document.querySelector('#site-form'), result.site);
    status.textContent = 'Logo uploaded and saved.';
  });

  document.querySelector('#page-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    document.querySelector('#page-preview')?.querySelectorAll('[data-cms-field]').forEach(syncFieldFromPreview);
    const payload = pagePayload(form);
    const original = payload.original_slug;
    const status = document.querySelector('#page-status');
    delete payload.original_slug;
    status.textContent = 'Saving…';
    try {
      await jsonFetch(original ? `/api/admin/pages/${original}` : '/api/admin/pages', { method: original ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      status.textContent = 'Page saved. Public site updated.';
      await refreshAll();
      if (payload.slug) await editPage(payload.slug);
    } catch (error) {
      status.textContent = `Could not save page: ${error.message}`;
    }
  });

  document.querySelector('#new-page')?.addEventListener('click', () => {
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
    document.querySelector('[data-page-editor-title]').textContent = 'Create a new page';
    showPageEditorChrome(true);
    syncPreviewFromForm();
    activateTab('pages');
  });

  document.querySelector('#sponsor-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = formPayload(form);
    payload.sort_order = Number(payload.sort_order || state.sponsors.length + 1);
    const id = payload.id;
    delete payload.id;
    await jsonFetch(id ? `/api/admin/sponsors/${id}` : '/api/admin/sponsors', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    document.querySelector('#sponsor-status').textContent = 'Sponsor saved. The public Sponsors page updates automatically.';
    form.reset();
    form.elements.active.checked = true;
    await loadSponsors();
  });

  document.querySelector('#new-sponsor')?.addEventListener('click', () => {
    const form = document.querySelector('#sponsor-form');
    form.reset();
    form.elements.active.checked = true;
    form.elements.level.value = 'Community Sponsor';
    form.elements.sort_order.value = state.sponsors.length + 1;
  });

  document.querySelector('#user-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector('#user-status');
    const payload = formPayload(form);
    payload.username = String(payload.username || '').trim();
    payload.display_name = String(payload.display_name || '').trim();
    payload.password = String(payload.password || '');
    if (!payload.username) {
      status.textContent = 'Username is required.';
      return;
    }
    if (!payload.display_name) {
      status.textContent = 'Display name is required.';
      return;
    }
    const id = payload.id;
    if (!id && !payload.password) {
      status.textContent = 'Password is required for new users.';
      return;
    }
    if (payload.password && payload.password.length < 8) {
      status.textContent = 'Password must be at least 8 characters.';
      return;
    }
    payload.permissions = [...form.querySelectorAll('input[name="permissions"]:checked')].map(input => input.value);
    delete payload.id;
    if (!payload.password) delete payload.password;
    status.textContent = 'Saving…';
    try {
      await jsonFetch(id ? `/api/admin/users/${id}` : '/api/admin/users', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      status.textContent = 'User saved.';
      form.reset();
      form.elements.active.checked = true;
      form.querySelectorAll('input[name="permissions"]').forEach(input => { input.checked = false; });
      await loadUsers();
    } catch (error) {
      let message = 'Could not save user.';
      try {
        const parsed = JSON.parse(String(error.message || ''));
        if (parsed?.detail) message = parsed.detail;
      } catch {
        if (error?.message) message = error.message;
      }
      status.textContent = message;
    }
  });

  document.querySelector('#new-user')?.addEventListener('click', () => {
    const form = document.querySelector('#user-form');
    form.reset();
    form.elements.active.checked = true;
    form.querySelectorAll('input[name="permissions"]').forEach(input => input.checked = false);
  });

  document.querySelector('#event-form')?.addEventListener('submit', async event => {
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

  document.querySelector('#new-event')?.addEventListener('click', () => {
    const form = document.querySelector('#event-form');
    form.reset();
    form.elements.date_label.value = 'Aug';
    form.elements.date_detail.value = '01';
  });

  document.querySelector('#photo-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.querySelector('#photo-status');
    status.textContent = 'Uploading...';
    try {
      await jsonFetch('/api/admin/photos', { method: 'POST', body: new FormData(form) });
      form.reset();
      await loadPhotos();
      status.textContent = 'Photo uploaded.';
    } catch (error) {
      status.textContent = 'Photo upload failed. Try a JPG, PNG, WEBP, or GIF under 1.5 MB.';
      console.error(error);
    }
  });
}

bindPageVisualEditor();
bindForms();
refreshAll().catch(error => {
  console.error(error);
  document.body.insertAdjacentHTML('afterbegin', `<div class="admin-card error">CMS failed to load: ${escapeHtml(error.message)}</div>`);
});

/* page-visual-editor: 20260801-16 */
