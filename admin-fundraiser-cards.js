(function () {
  const PHONE_MAX = 767;
  if (window.matchMedia(`(max-width: ${PHONE_MAX}px)`).matches) {
    window.efhsAdminNav?.init?.();
    return;
  }
  window.efhsAdminNav?.init?.();

  const canPublish = document.body.dataset.canPublish === '1';
  const listEl = document.querySelector('[data-fc-list]');
  const rejectedWrap = document.querySelector('[data-fc-rejected]');
  const rejectedList = document.querySelector('[data-fc-rejected-list]');
  const editor = document.querySelector('[data-fc-editor]');
  const preview = document.querySelector('[data-fc-preview]');
  const note = document.querySelector('[data-fc-note]');
  const statusLine = document.querySelector('[data-fc-status-line]');
  const galleryDialog = document.querySelector('[data-fc-gallery-dialog]');
  const galleryGrid = document.querySelector('[data-fc-gallery-grid]');
  const fileInput = document.querySelector('[data-fc-file]');
  let cards = [];
  let selectedId = Number(new URLSearchParams(location.search).get('id') || 0) || null;
  let previewTimer = 0;

  function field(name) {
    return editor?.elements?.[name] || editor?.querySelector(`[name="${name}"]`);
  }

  function pillFor(card) {
    if (card.status === 'rejected') return '<span class="fc-pill fc-pill-rej">Rejected</span>';
    if (card.status === 'draft') return '<span class="fc-pill fc-pill-draft">Draft – needs approval</span>';
    if (card.status === 'hidden') return '<span class="fc-pill fc-pill-hide">Hidden</span>';
    if (card.calendar_changed) return '<span class="fc-pill fc-pill-changed">Calendar changed</span>';
    return '<span class="fc-pill fc-pill-show">Showing</span>';
  }

  function thumb(card) {
    if (card.picture_mode === 'image' && card.image_url) {
      return `<div class="fc-thumb"><img src="${escapeAttr(card.image_url)}" alt=""></div>`;
    }
    const match = String(card.event_date || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const label = match ? `${months[Number(match[1]) - 1] || ''} ${Number(match[2])}` : 'SOON';
    return `<div class="fc-tile">${escapeHtml(label)}</div>`;
  }

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

  function rowHtml(card, { reject = false } = {}) {
    return `<article class="fc-card-row${Number(card.id) === Number(selectedId) ? ' is-active' : ''}" data-id="${card.id}" ${reject ? '' : 'draggable="true"'}>
      <span class="fc-drag" aria-hidden="true">${reject ? '' : '⋮⋮'}</span>
      ${thumb(card)}
      <div class="fc-card-copy">
        <strong>${escapeHtml(card.title)}</strong>
        <small>${escapeHtml(card.event_date || 'No date')}</small>
        <div class="fc-pills">${pillFor(card)}</div>
      </div>
      <div class="fc-row-actions">
        <button type="button" data-fc-open="${card.id}">Edit</button>
        ${reject ? `<button type="button" data-fc-restore="${card.id}">Restore to draft</button>` : ''}
        ${!reject && canPublish && card.status !== 'hidden' ? `<button type="button" data-fc-hide-row="${card.id}">Hide</button>` : ''}
        ${!reject && canPublish ? `<button type="button" data-fc-delete-row="${card.id}">Delete</button>` : ''}
      </div>
    </article>`;
  }

  function renderList() {
    const active = cards.filter((card) => card.status !== 'rejected');
    const rejected = cards.filter((card) => card.status === 'rejected');
    if (listEl) listEl.innerHTML = active.map((card) => rowHtml(card)).join('') || '<p>No fundraiser cards yet.</p>';
    if (rejectedWrap && rejectedList) {
      rejectedWrap.hidden = !rejected.length;
      rejectedList.innerHTML = rejected.map((card) => rowHtml(card, { reject: true })).join('');
    }
    bindList();
  }

  function bindList() {
    document.querySelectorAll('[data-fc-open]').forEach((button) => {
      button.onclick = () => selectCard(Number(button.dataset.fcOpen));
    });
    document.querySelectorAll('[data-fc-restore]').forEach((button) => {
      button.onclick = () => postAction(Number(button.dataset.fcRestore), 'restore');
    });
    document.querySelectorAll('[data-fc-hide-row]').forEach((button) => {
      button.onclick = () => postAction(Number(button.dataset.fcHideRow), 'hide');
    });
    document.querySelectorAll('[data-fc-delete-row]').forEach((button) => {
      button.onclick = () => deleteCard(Number(button.dataset.fcDeleteRow));
    });
    if (!listEl) return;
    listEl.querySelectorAll('.fc-card-row').forEach((row) => {
      row.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', row.dataset.id);
        row.classList.add('is-dragging');
      });
      row.addEventListener('dragend', () => row.classList.remove('is-dragging'));
      row.addEventListener('dragover', (event) => event.preventDefault());
      row.addEventListener('drop', async (event) => {
        event.preventDefault();
        const from = Number(event.dataTransfer.getData('text/plain'));
        const to = Number(row.dataset.id);
        if (!from || from === to) return;
        const active = cards.filter((card) => card.status !== 'rejected');
        const ids = active.map((card) => card.id);
        const fromAt = ids.indexOf(from);
        const toAt = ids.indexOf(to);
        if (fromAt < 0 || toAt < 0) return;
        ids.splice(toAt, 0, ids.splice(fromAt, 1)[0]);
        await api('/api/admin/fundraiser-cards/reorder', { method: 'POST', body: { ids } });
        await load();
      });
    });
  }

  async function api(path, { method = 'GET', body } = {}) {
    const options = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      options.headers['content-type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(path, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'Request failed');
    return payload;
  }

  async function load() {
    const data = await api('/api/admin/fundraiser-cards');
    cards = data.cards || [];
    if (!selectedId && cards.length) selectedId = cards[0].id;
    renderList();
    if (selectedId) selectCard(selectedId, { silent: true });
    else if (editor) editor.hidden = true;
  }

  function fillEditor(card) {
    if (!editor) return;
    editor.hidden = false;
    field('id').value = card.id || '';
    field('title').value = card.title || '';
    field('description').value = card.description || '';
    field('event_date').value = card.event_date || '';
    field('location').value = card.location || '';
    field('start_time').value = card.start_time || '';
    field('end_time').value = card.end_time || '';
    editor.querySelectorAll('[name="picture_mode"]').forEach((input) => {
      input.checked = input.value === (card.picture_mode || 'date_tile');
    });
    field('image_url').value = card.image_url || '';
    field('must_attend').checked = Boolean(Number(card.must_attend));
    field('volunteers_needed').checked = Boolean(Number(card.volunteers_needed));
    field('custom_label').value = card.custom_label || '';
    field('primary_button').value = card.primary_button || 'details';
    field('primary_url').value = card.primary_url || '';
    field('show_add_to_calendar').checked = card.show_add_to_calendar == null ? true : Boolean(Number(card.show_add_to_calendar));
    field('auto_hide_after_date').checked = card.auto_hide_after_date == null ? true : Boolean(Number(card.auto_hide_after_date));
    toggleImageActions();
    const title = document.querySelector('[data-fc-editor-title]');
    if (title) title.textContent = card.id ? 'Edit fundraiser' : 'Add fundraiser';
    if (statusLine) statusLine.textContent = card.status ? `Status: ${card.status}` : 'New draft';
    editor.querySelector('[data-fc-approve]').hidden = !(canPublish && card.status === 'draft');
    editor.querySelector('[data-fc-reject]').hidden = !(canPublish && (card.status === 'draft' || card.status === 'approved'));
    editor.querySelector('[data-fc-hide]').hidden = !(canPublish && card.status === 'approved');
    editor.querySelector('[data-fc-unhide]').hidden = !(canPublish && card.status === 'hidden');
    editor.querySelector('[data-fc-delete]').hidden = !(canPublish && card.id);
    if (note) {
      note.textContent = canPublish
        ? ''
        : 'You can create and edit cards. A Super Admin, Pages editor, or Fundraising layout editor must approve, hide, reject, or delete.';
    }
    refreshPreview();
  }

  function selectCard(id, { silent = false } = {}) {
    const card = cards.find((item) => Number(item.id) === Number(id));
    if (!card) return;
    selectedId = Number(id);
    if (!silent) renderList();
    fillEditor(card);
  }

  function formPayload() {
    const picture = editor.querySelector('[name="picture_mode"]:checked')?.value || 'date_tile';
    return {
      title: field('title').value,
      description: field('description').value,
      event_date: field('event_date').value,
      location: field('location').value,
      start_time: field('start_time').value,
      end_time: field('end_time').value,
      picture_mode: picture,
      image_url: field('image_url').value,
      must_attend: field('must_attend').checked,
      volunteers_needed: field('volunteers_needed').checked,
      custom_label: field('custom_label').value,
      primary_button: field('primary_button').value,
      primary_url: field('primary_url').value,
      show_add_to_calendar: field('show_add_to_calendar').checked,
      auto_hide_after_date: field('auto_hide_after_date').checked,
    };
  }

  async function refreshPreview() {
    if (!preview) return;
    try {
      const data = await api('/api/admin/fundraiser-cards/preview', { method: 'POST', body: formPayload() });
      preview.innerHTML = data.html || '<p class="fc-preview-empty">Nothing to preview yet.</p>';
    } catch {
      preview.innerHTML = '<p class="fc-preview-empty">Preview unavailable.</p>';
    }
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, 250);
  }

  function toggleImageActions() {
    const mode = editor.querySelector('[name="picture_mode"]:checked')?.value;
    const actions = document.querySelector('[data-fc-image-actions]');
    if (actions) actions.hidden = mode !== 'image';
  }

  async function saveCard(event) {
    event.preventDefault();
    const id = field('id').value;
    const payload = formPayload();
    const saved = id
      ? await api(`/api/admin/fundraiser-cards/${id}`, { method: 'PUT', body: payload })
      : await api('/api/admin/fundraiser-cards', { method: 'POST', body: payload });
    selectedId = saved.id;
    if (note) note.textContent = 'Saved.';
    await load();
  }

  async function postAction(id, action) {
    const saved = await api(`/api/admin/fundraiser-cards/${id}/${action}`, { method: 'POST' });
    selectedId = saved.id;
    await load();
  }

  async function deleteCard(id) {
    if (!window.confirm('Delete this fundraiser card? This cannot be undone.')) return;
    await api(`/api/admin/fundraiser-cards/${id}`, { method: 'DELETE' });
    selectedId = null;
    await load();
  }

  async function uploadFile(file) {
    const body = new FormData();
    body.append('file', file);
    body.append('alt_text', field('title').value || 'Fundraiser flyer');
    body.append('caption', field('title').value || '');
    const response = await fetch('/api/admin/photos', { method: 'POST', body, credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'Upload failed');
    field('image_url').value = payload.url || '';
    editor.querySelector('[name="picture_mode"][value="image"]').checked = true;
    toggleImageActions();
    refreshPreview();
  }

  async function openGallery() {
    const response = await fetch('/api/photos', { credentials: 'same-origin' });
    const photos = await response.json().catch(() => []);
    galleryGrid.innerHTML = (Array.isArray(photos) ? photos : []).map((photo) => (
      `<button type="button" data-url="${escapeAttr(photo.url || photo.filename || '')}">
        <img src="${escapeAttr(photo.url || '')}" alt="${escapeAttr(photo.alt_text || '')}">
      </button>`
    )).join('') || '<p>No gallery photos yet.</p>';
    galleryGrid.querySelectorAll('button[data-url]').forEach((button) => {
      button.onclick = () => {
        field('image_url').value = button.dataset.url;
        editor.querySelector('[name="picture_mode"][value="image"]').checked = true;
        toggleImageActions();
        refreshPreview();
        galleryDialog.close();
      };
    });
    galleryDialog.showModal();
  }

  document.querySelector('[data-fc-add]')?.addEventListener('click', () => {
    selectedId = null;
    fillEditor({
      status: 'draft',
      picture_mode: 'date_tile',
      show_add_to_calendar: 1,
      auto_hide_after_date: 1,
      primary_button: 'details',
    });
    renderList();
  });
  editor?.addEventListener('submit', (event) => {
    saveCard(event).catch((error) => { if (note) note.textContent = error.message; });
  });
  editor?.addEventListener('input', schedulePreview);
  editor?.addEventListener('change', () => {
    toggleImageActions();
    schedulePreview();
  });
  document.querySelector('[data-fc-approve]')?.addEventListener('click', () => {
    postAction(field('id').value, 'approve').catch((error) => { if (note) note.textContent = error.message; });
  });
  document.querySelector('[data-fc-reject]')?.addEventListener('click', () => {
    postAction(field('id').value, 'reject').catch((error) => { if (note) note.textContent = error.message; });
  });
  document.querySelector('[data-fc-hide]')?.addEventListener('click', () => {
    postAction(field('id').value, 'hide').catch((error) => { if (note) note.textContent = error.message; });
  });
  document.querySelector('[data-fc-unhide]')?.addEventListener('click', () => {
    postAction(field('id').value, 'approve').catch((error) => { if (note) note.textContent = error.message; });
  });
  document.querySelector('[data-fc-delete]')?.addEventListener('click', () => {
    deleteCard(field('id').value).catch((error) => { if (note) note.textContent = error.message; });
  });
  document.querySelector('[data-fc-replace]')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) uploadFile(file).catch((error) => { if (note) note.textContent = error.message; });
    fileInput.value = '';
  });
  document.querySelector('[data-fc-gallery]')?.addEventListener('click', () => {
    openGallery().catch((error) => { if (note) note.textContent = error.message; });
  });
  document.querySelector('[data-fc-sync]')?.addEventListener('click', async () => {
    try {
      const result = await api('/api/admin/fundraiser-cards/sync', { method: 'POST' });
      if (note) note.textContent = `Calendar check: ${result.created || 0} new draft(s), ${result.emails || 0} email(s).`;
      await load();
    } catch (error) {
      if (note) note.textContent = error.message;
    }
  });
  document.querySelector('[data-fc-alert-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = event.target.alert_emails.value;
    try {
      await api('/api/admin/fundraiser-cards/settings', { method: 'PUT', body: { alert_emails: value } });
      if (note) note.textContent = 'Alert emails saved.';
    } catch (error) {
      if (note) note.textContent = error.message;
    }
  });

  load().catch((error) => {
    if (listEl) listEl.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  });
})();
