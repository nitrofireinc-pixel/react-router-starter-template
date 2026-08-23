/* global BadgeCreator, document, Image, URL */
(function badgeCreatorAdmin(global) {
  const state = {
    badges: [],
    photoObjectUrl: '',
    photoImage: null,
    renderTimer: null,
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function canAccessBadgeCreator() {
    if (typeof global.canAccessBadgeCreator === 'function') return global.canAccessBadgeCreator();
    return false;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function badgeInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase() || '?';
  }

  function formValues() {
    const form = $('#badge-creator-form');
    if (!form) return {};
    return {
      id: form.badge_id.value.trim(),
      name: form.member_name.value.trim(),
      role: form.role.value,
      schoolYear: form.school_year.value,
      photoUrl: form.photo_url.value.trim(),
    };
  }

  function populateYearOptions() {
    const select = $('#badge-creator-form select[name="school_year"]');
    if (!select) return;
    const current = select.value;
    const years = BadgeCreator.schoolYearOptions(10);
    select.innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join('');
    select.value = years.includes(current) ? current : years[0];
  }

  function populateRoleOptions() {
    const select = $('#badge-creator-form select[name="role"]');
    if (!select || select.options.length) return;
    select.innerHTML = BadgeCreator.BADGE_ROLES.map((role) => `<option value="${role}">${role}</option>`).join('');
  }

  function setStatus(message) {
    const status = $('#badge-creator-status');
    if (status) status.textContent = message || '';
  }

  function revokePhotoObjectUrl() {
    if (state.photoObjectUrl) {
      URL.revokeObjectURL(state.photoObjectUrl);
      state.photoObjectUrl = '';
    }
  }

  async function updatePreview() {
    const canvas = $('#badge-creator-preview');
    if (!canvas || !canAccessBadgeCreator()) return;
    const values = formValues();
    const options = {
      name: values.name || 'Member Name',
      role: values.role,
      schoolYear: values.schoolYear,
      photoUrl: state.photoImage ? '' : values.photoUrl,
      photo: state.photoImage || null,
    };
    try {
      await BadgeCreator.renderBadge(canvas, options);
      const wrap = canvas.closest('.badge-creator-preview-wrap');
      if (wrap) {
        wrap.classList.toggle('is-committee-member', values.role === 'Committee Member');
      }
    } catch (error) {
      console.error(error);
      setStatus(`Preview error: ${error.message}`);
    }
  }

  function schedulePreview() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(() => {
      updatePreview().catch((error) => setStatus(error.message));
    }, 120);
  }

  function resetForm(message = 'Create a new badge or load a saved badge to replace a lost one.') {
    const form = $('#badge-creator-form');
    if (!form) return;
    form.reset();
    form.badge_id.value = '';
    form.photo_url.value = '';
    revokePhotoObjectUrl();
    state.photoImage = null;
    populateYearOptions();
    populateRoleOptions();
    const fileInput = form.photo_file;
    if (fileInput) fileInput.value = '';
    setStatus(message);
    schedulePreview();
  }

  function fillForm(badge) {
    const form = $('#badge-creator-form');
    if (!form || !badge) return;
    form.badge_id.value = String(badge.id || '');
    form.member_name.value = badge.member_name || '';
    form.role.value = badge.role || 'Committee Member';
    form.school_year.value = badge.school_year || BadgeCreator.schoolYearOptions(10)[0];
    form.photo_url.value = badge.photo_url || '';
    revokePhotoObjectUrl();
    state.photoImage = null;
    const fileInput = form.photo_file;
    if (fileInput) fileInput.value = '';
    setStatus(`Editing badge for ${badge.member_name || 'member'}. Save to update or replace.`);
    schedulePreview();
  }

  async function downloadCurrentBadge(filenameHint) {
    await updatePreview();
    const canvas = $('#badge-creator-preview');
    const values = formValues();
    const blob = await BadgeCreator.exportBadgePng(canvas);
    const base = filenameHint || `${values.name || 'badge'}-${values.schoolYear || 'year'}`;
    BadgeCreator.downloadBlob(blob, `${base}.png`);
  }

  async function printCurrentBadge(titleHint) {
    await updatePreview();
    const canvas = $('#badge-creator-preview');
    const values = formValues();
    const title = titleHint || `${values.name || 'Badge'} · ${values.schoolYear || ''}`.trim();
    setStatus('Opening print dialog…');
    try {
      await BadgeCreator.printBadge(canvas, title);
      setStatus('Print dialog opened. Choose your badge printer or Save as PDF.');
    } catch (error) {
      setStatus(`Could not print badge: ${error.message}`);
    }
  }

  function renderSavedBadges() {
    const list = $('#badge-creator-list');
    if (!list) return;
    if (!state.badges.length) {
      list.innerHTML = '<p class="draft">No saved badges yet.</p>';
      return;
    }
    list.innerHTML = state.badges.map((badge) => `
      <article class="admin-row badge-creator-row">
        <div class="mini-logo staff-mini-photo">${badge.photo_url ? `<img src="${escapeHtml(badge.photo_url)}" alt="">` : escapeHtml(badgeInitials(badge.member_name))}</div>
        <div>
          <b>${escapeHtml(badge.member_name)}</b>
          <span>${escapeHtml(badge.role)} · ${escapeHtml(badge.school_year)}</span>
          <small>Updated ${escapeHtml((badge.updated_at || '').slice(0, 10) || 'recently')}</small>
        </div>
        <div class="row-actions">
          <button type="button" data-edit-badge="${badge.id}">Edit</button>
          <button type="button" data-download-badge="${badge.id}">Download</button>
          <button type="button" data-print-badge="${badge.id}">Print</button>
          <button type="button" data-delete-badge="${badge.id}">Delete</button>
        </div>
      </article>
    `).join('');

    list.querySelectorAll('[data-edit-badge]').forEach((button) => {
      button.addEventListener('click', () => {
        const badge = state.badges.find((item) => item.id === Number(button.dataset.editBadge));
        if (badge) fillForm(badge);
      });
    });

    list.querySelectorAll('[data-delete-badge]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('Delete this saved badge?')) return;
        await global.jsonFetch(`/api/admin/badges/${button.dataset.deleteBadge}`, { method: 'DELETE' });
        await loadBadges();
        setStatus('Badge deleted.');
      });
    });

    list.querySelectorAll('[data-download-badge]').forEach((button) => {
      button.addEventListener('click', async () => {
        const badge = state.badges.find((item) => item.id === Number(button.dataset.downloadBadge));
        if (!badge) return;
        fillForm(badge);
        await downloadCurrentBadge(`${badge.member_name || 'badge'}-${badge.school_year}`);
      });
    });

    list.querySelectorAll('[data-print-badge]').forEach((button) => {
      button.addEventListener('click', async () => {
        const badge = state.badges.find((item) => item.id === Number(button.dataset.printBadge));
        if (!badge) return;
        fillForm(badge);
        await printCurrentBadge(`${badge.member_name || 'Badge'} · ${badge.school_year || ''}`);
      });
    });
  }

  async function loadBadges() {
    if (!canAccessBadgeCreator()) return;
    state.badges = await global.jsonFetch('/api/admin/badges');
    renderSavedBadges();
  }

  async function uploadPhotoIfNeeded(form, name) {
    const file = form.photo_file?.files?.[0];
    if (!file) return form.photo_url.value.trim();
    const prepared = await global.prepareImageFileForUpload(file, 'badge photo');
    const stored = await global.uploadPreparedGalleryPhoto({
      file: prepared,
      altText: name || 'Badge photo',
      caption: 'Badge Creator',
      sortOrder: -600,
    });
    form.photo_url.value = stored.url;
    return stored.url;
  }

  function bindForm() {
    const form = $('#badge-creator-form');
    if (!form || form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';

    populateRoleOptions();
    populateYearOptions();

    form.addEventListener('input', schedulePreview);
    form.addEventListener('change', async (event) => {
      if (event.target.name === 'photo_file') {
        const file = event.target.files?.[0];
        revokePhotoObjectUrl();
        state.photoImage = null;
        if (file) {
          state.photoObjectUrl = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () => {
            state.photoImage = img;
            schedulePreview();
          };
          img.src = state.photoObjectUrl;
        } else {
          schedulePreview();
        }
        return;
      }
      schedulePreview();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!canAccessBadgeCreator()) return;
      const values = formValues();
      if (!values.name) {
        setStatus('Name is required.');
        form.member_name.focus();
        return;
      }
      setStatus('Saving badge…');
      try {
        const photoUrl = await uploadPhotoIfNeeded(form, values.name);
        const payload = {
          member_name: values.name,
          role: values.role,
          school_year: values.schoolYear,
          photo_url: photoUrl,
        };
        const saved = await global.jsonFetch(
          values.id ? `/api/admin/badges/${values.id}` : '/api/admin/badges',
          { method: values.id ? 'PUT' : 'POST', body: JSON.stringify(payload) },
        );
        fillForm(saved);
        await loadBadges();
        setStatus(values.id ? 'Badge updated.' : 'Badge saved for future use.');
      } catch (error) {
        setStatus(`Could not save badge: ${error.message}`);
      }
    });

    $('#badge-creator-new')?.addEventListener('click', () => resetForm());
    $('#badge-creator-download')?.addEventListener('click', async () => {
      const values = formValues();
      try {
        await downloadCurrentBadge(`${values.name || 'badge'}-${values.schoolYear}`);
        setStatus('PNG downloaded.');
      } catch (error) {
        setStatus(`Could not download badge: ${error.message}`);
      }
    });
    $('#badge-creator-print')?.addEventListener('click', async () => {
      await printCurrentBadge();
    });
  }

  async function initBadgeCreatorPanel() {
    if (!canAccessBadgeCreator()) return;
    bindForm();
    await BadgeCreator.preloadBrandAssets();
    await loadBadges();
    await updatePreview();
  }

  global.initBadgeCreatorPanel = initBadgeCreatorPanel;
  global.loadBadges = loadBadges;
}(window));
