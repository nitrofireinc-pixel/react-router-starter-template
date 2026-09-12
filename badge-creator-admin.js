/* global BadgeCreator, document, Image, URL */
(function badgeCreatorAdmin(global) {
  const state = {
    badges: [],
    selectedIds: [],
    photoObjectUrl: '',
    photoImage: null,
    renderTimer: null,
    photoCrop: BadgeCreator.normalizePhotoCrop(),
    layout: null,
    drag: null,
    resize: null,
  };

  const MAX_PRINT_SELECTION = 3;

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
      photoCrop: currentPhotoCropFromForm(),
    };
  }

  function currentPhotoCropFromForm() {
    const form = $('#badge-creator-form');
    if (!form) return state.photoCrop;
    return BadgeCreator.normalizePhotoCrop({
      zoom: form.photo_zoom?.value ?? state.photoCrop.zoom,
      offsetX: form.photo_offset_x?.value ?? state.photoCrop.offsetX,
      offsetY: form.photo_offset_y?.value ?? state.photoCrop.offsetY,
    });
  }

  function writePhotoCropToForm(crop) {
    const form = $('#badge-creator-form');
    const normalized = BadgeCreator.normalizePhotoCrop(crop);
    state.photoCrop = normalized;
    if (!form) return;
    if (form.photo_zoom) form.photo_zoom.value = String(normalized.zoom);
    if (form.photo_offset_x) form.photo_offset_x.value = String(normalized.offsetX);
    if (form.photo_offset_y) form.photo_offset_y.value = String(normalized.offsetY);
    const slider = $('#badge-creator-photo-zoom');
    if (slider && document.activeElement !== slider) {
      slider.value = String(normalized.zoom);
    }
    const zoomLabel = $('#badge-creator-photo-zoom-label');
    if (zoomLabel) zoomLabel.textContent = `${normalized.zoom.toFixed(2)}×`;
  }

  function resetPhotoCrop() {
    writePhotoCropToForm({ zoom: 1, offsetX: 0, offsetY: 0 });
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

  function hasAdjustablePhoto() {
    return Boolean(state.photoImage || formValues().photoUrl);
  }

  function canvasPointFromClient(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
      scaleX: canvas.width / rect.width,
      scaleY: canvas.height / rect.height,
      rect,
    };
  }

  function pointInProfile(point, layout) {
    if (!point || !layout) return false;
    const dx = point.x - layout.profileCx;
    const dy = point.y - layout.profileCy;
    return (dx * dx) + (dy * dy) <= (layout.profileRadius * layout.profileRadius);
  }

  function syncPhotoHandle() {
    const canvas = $('#badge-creator-preview');
    const handle = $('#badge-creator-photo-handle');
    const stage = $('#badge-creator-photo-stage');
    const controls = $('#badge-creator-photo-controls');
    if (!canvas || !handle || !state.layout) {
      if (handle) handle.hidden = true;
      if (controls) controls.hidden = true;
      return;
    }
    const show = hasAdjustablePhoto();
    if (controls) controls.hidden = !show;
    if (!show) {
      handle.hidden = true;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const stageRect = (stage || canvas.parentElement).getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    const left = (rect.left - stageRect.left) + ((state.layout.profileCx - state.layout.profileRadius) * scaleX);
    const top = (rect.top - stageRect.top) + ((state.layout.profileCy - state.layout.profileRadius) * scaleY);
    const size = state.layout.profileSize * scaleX;
    handle.hidden = false;
    handle.style.left = `${left}px`;
    handle.style.top = `${top}px`;
    handle.style.width = `${size}px`;
    handle.style.height = `${size}px`;
  }

  async function updatePreview() {
    const canvas = $('#badge-creator-preview');
    if (!canvas || !canAccessBadgeCreator()) return;
    const values = formValues();
    const photoCrop = currentPhotoCropFromForm();
    const options = {
      name: values.name || 'Member Name',
      role: values.role,
      schoolYear: values.schoolYear,
      photoUrl: state.photoImage ? '' : values.photoUrl,
      photo: state.photoImage || null,
      photoCrop,
    };
    try {
      const result = await BadgeCreator.renderBadge(canvas, options);
      // Re-assert CSS display size: assigning canvas.width/height can reset layout sizing.
      canvas.style.width = '100%';
      canvas.style.maxWidth = '100%';
      canvas.style.height = 'auto';
      state.layout = result?.layout || BadgeCreator.getProfileLayout(values.role);
      if (result?.layout?.photoCrop) {
        writePhotoCropToForm(result.layout.photoCrop);
      }
      const wrap = canvas.closest('.badge-creator-preview-wrap');
      if (wrap) {
        const role = values.role;
        wrap.classList.toggle('is-committee-member', role === 'Committee Member');
        wrap.classList.toggle('is-officer-border', BadgeCreator.OFFICER_ROLES.includes(role));
        wrap.classList.toggle('is-gold-border', BadgeCreator.DIRECTOR_ROLES.includes(role));
        wrap.classList.toggle('has-photo', hasAdjustablePhoto());
      }
      syncPhotoHandle();
    } catch (error) {
      console.error(error);
      setStatus(`Preview error: ${error.message}`);
    }
  }

  function schedulePreview() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(() => {
      updatePreview().catch((error) => setStatus(error.message));
    }, 40);
  }

  function applyPhotoPan(deltaBadgeX, deltaBadgeY) {
    if (!state.layout) return;
    const radius = state.layout.profileRadius || 1;
    writePhotoCropToForm({
      ...state.photoCrop,
      offsetX: state.photoCrop.offsetX + (deltaBadgeX / radius),
      offsetY: state.photoCrop.offsetY + (deltaBadgeY / radius),
    });
    schedulePreview();
  }

  function applyPhotoZoom(nextZoom, anchorBadgePoint = null) {
    const before = state.photoCrop;
    const zoom = BadgeCreator.normalizePhotoCrop({ ...before, zoom: nextZoom }).zoom;
    if (zoom === before.zoom) {
      writePhotoCropToForm({ ...before, zoom });
      return;
    }
    // Keep the face under the pointer roughly stable while zooming.
    if (anchorBadgePoint && state.layout) {
      const ratio = zoom / before.zoom;
      const dx = (anchorBadgePoint.x - state.layout.profileCx) / state.layout.profileRadius;
      const dy = (anchorBadgePoint.y - state.layout.profileCy) / state.layout.profileRadius;
      writePhotoCropToForm({
        zoom,
        offsetX: before.offsetX + dx * (1 - ratio),
        offsetY: before.offsetY + dy * (1 - ratio),
      });
    } else {
      writePhotoCropToForm({ ...before, zoom });
    }
    schedulePreview();
  }

  function resetForm(message = 'Create a new badge or load a saved badge to replace a lost one.') {
    const form = $('#badge-creator-form');
    if (!form) return;
    form.reset();
    form.badge_id.value = '';
    form.photo_url.value = '';
    revokePhotoObjectUrl();
    state.photoImage = null;
    resetPhotoCrop();
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
    writePhotoCropToForm({
      zoom: badge.photo_zoom,
      offsetX: badge.photo_offset_x,
      offsetY: badge.photo_offset_y,
    });
    const fileInput = form.photo_file;
    if (fileInput) fileInput.value = '';
    setStatus(`Editing badge for ${badge.member_name || 'member'}. Drag the photo to center it, then save.`);
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

  async function renderBadgeCanvas(badge) {
    const canvas = document.createElement('canvas');
    await BadgeCreator.renderBadge(canvas, {
      name: badge.member_name,
      role: badge.role,
      schoolYear: badge.school_year,
      photoUrl: badge.photo_url,
      photoCrop: {
        zoom: badge.photo_zoom,
        offsetX: badge.photo_offset_x,
        offsetY: badge.photo_offset_y,
      },
    });
    return canvas;
  }

  function selectedBadges() {
    const ids = new Set(state.selectedIds.map(Number));
    return state.badges.filter((badge) => ids.has(Number(badge.id)));
  }

  function syncPrintSelectedButton() {
    const button = $('#badge-creator-print-selected');
    const countLabel = $('#badge-creator-print-selected-count');
    const count = state.selectedIds.length;
    if (countLabel) countLabel.textContent = count ? `(${count})` : '';
    if (button) {
      button.disabled = count < 1;
      button.title = count === 3
        ? 'Print 3 badges on one landscape letter page'
        : count === 2
          ? 'Print 2 badges on one letter page'
          : count === 1
            ? 'Print 1 selected badge'
            : 'Select up to 3 badges to print on one page';
    }
  }

  function toggleBadgeSelection(badgeId, checked) {
    const id = Number(badgeId);
    if (!Number.isFinite(id)) return;
    const already = state.selectedIds.includes(id);
    if (checked && !already) {
      if (state.selectedIds.length >= MAX_PRINT_SELECTION) {
        setStatus(`Select at most ${MAX_PRINT_SELECTION} badges to print on one page.`);
        const box = document.querySelector(`[data-select-badge="${id}"]`);
        if (box) box.checked = false;
        return;
      }
      state.selectedIds.push(id);
    } else if (!checked && already) {
      state.selectedIds = state.selectedIds.filter((value) => value !== id);
    }
    syncPrintSelectedButton();
  }

  async function printSelectedBadges() {
    const badges = selectedBadges();
    if (!badges.length) {
      setStatus('Select 1–3 saved badges to print.');
      return;
    }
    if (badges.length > MAX_PRINT_SELECTION) {
      setStatus(`Select at most ${MAX_PRINT_SELECTION} badges to print on one page.`);
      return;
    }
    setStatus(`Preparing ${badges.length} badge${badges.length === 1 ? '' : 's'} for print…`);
    try {
      const canvases = [];
      for (const badge of badges) {
        canvases.push(await renderBadgeCanvas(badge));
      }
      const title = badges.length === 1
        ? `${badges[0].member_name || 'Badge'} · ${badges[0].school_year || ''}`.trim()
        : `Badges (${badges.length})`;
      await BadgeCreator.printBadges(canvases, title);
      const orient = badges.length === 3 ? ' landscape letter' : badges.length === 1 ? '' : ' letter';
      setStatus(`Print dialog opened for ${badges.length} badge${badges.length === 1 ? '' : 's'} on one${orient} page.`);
    } catch (error) {
      setStatus(`Could not print selected badges: ${error.message}`);
    }
  }

  function renderSavedBadges() {
    const list = $('#badge-creator-list');
    if (!list) return;
    const validIds = new Set(state.badges.map((badge) => Number(badge.id)));
    state.selectedIds = state.selectedIds.filter((id) => validIds.has(id));
    if (!state.badges.length) {
      list.innerHTML = '<p class="draft">No saved badges yet.</p>';
      syncPrintSelectedButton();
      return;
    }
    list.innerHTML = state.badges.map((badge) => {
      const id = Number(badge.id);
      const checked = state.selectedIds.includes(id) ? ' checked' : '';
      return `
      <article class="admin-row badge-creator-row">
        <label class="badge-creator-select">
          <input type="checkbox" data-select-badge="${id}"${checked} aria-label="Select ${escapeHtml(badge.member_name)} for print">
        </label>
        <div class="mini-logo staff-mini-photo">${badge.photo_url ? `<img src="${escapeHtml(badge.photo_url)}" alt="">` : escapeHtml(badgeInitials(badge.member_name))}</div>
        <div>
          <b>${escapeHtml(badge.member_name)}</b>
          <span>${escapeHtml(badge.role)} · ${escapeHtml(badge.school_year)}</span>
          <small>Updated ${escapeHtml((badge.updated_at || '').slice(0, 10) || 'recently')}</small>
        </div>
        <div class="row-actions">
          <button type="button" data-edit-badge="${id}">Edit</button>
          <button type="button" data-download-badge="${id}">Download</button>
          <button type="button" data-print-badge="${id}">Print</button>
          <button type="button" data-delete-badge="${id}">Delete</button>
        </div>
      </article>
    `;
    }).join('');

    list.querySelectorAll('[data-select-badge]').forEach((input) => {
      input.addEventListener('change', () => {
        toggleBadgeSelection(input.dataset.selectBadge, input.checked);
      });
    });

    list.querySelectorAll('[data-edit-badge]').forEach((button) => {
      button.addEventListener('click', () => {
        const badge = state.badges.find((item) => item.id === Number(button.dataset.editBadge));
        if (badge) fillForm(badge);
      });
    });

    list.querySelectorAll('[data-delete-badge]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('Delete this saved badge?')) return;
        const deletedId = Number(button.dataset.deleteBadge);
        await global.jsonFetch(`/api/admin/badges/${button.dataset.deleteBadge}`, { method: 'DELETE' });
        state.selectedIds = state.selectedIds.filter((id) => id !== deletedId);
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

    syncPrintSelectedButton();
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

  function bindPhotoAdjustControls() {
    const canvas = $('#badge-creator-preview');
    const handle = $('#badge-creator-photo-handle');
    const resizeKnob = $('#badge-creator-photo-resize');
    const slider = $('#badge-creator-photo-zoom');
    const resetBtn = $('#badge-creator-photo-reset');
    if (!canvas || canvas.dataset.photoAdjustBound === 'true') return;
    canvas.dataset.photoAdjustBound = 'true';

    const endDrag = () => {
      state.drag = null;
      state.resize = null;
      if (handle) handle.classList.remove('is-dragging', 'is-resizing');
    };

    const onPointerMove = (event) => {
      if (state.resize) {
        const point = canvasPointFromClient(canvas, event.clientX, event.clientY);
        if (!point || !state.layout) return;
        const dx = point.x - state.layout.profileCx;
        const dy = point.y - state.layout.profileCy;
        const dist = Math.sqrt((dx * dx) + (dy * dy));
        const startDist = state.resize.startDist || state.layout.profileRadius;
        const nextZoom = state.resize.startZoom * (dist / startDist);
        applyPhotoZoom(nextZoom);
        event.preventDefault();
        return;
      }
      if (!state.drag) return;
      const point = canvasPointFromClient(canvas, event.clientX, event.clientY);
      if (!point) return;
      const deltaX = point.x - state.drag.lastX;
      const deltaY = point.y - state.drag.lastY;
      state.drag.lastX = point.x;
      state.drag.lastY = point.y;
      applyPhotoPan(deltaX, deltaY);
      event.preventDefault();
    };

    const onPointerUp = () => endDrag();

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    const startPan = (event) => {
      if (!hasAdjustablePhoto()) return;
      const point = canvasPointFromClient(canvas, event.clientX, event.clientY);
      if (!pointInProfile(point, state.layout)) return;
      state.drag = { lastX: point.x, lastY: point.y };
      if (handle) handle.classList.add('is-dragging');
      event.preventDefault();
    };

    canvas.addEventListener('pointerdown', startPan);
    handle?.addEventListener('pointerdown', (event) => {
      if (event.target === resizeKnob) return;
      startPan(event);
    });

    resizeKnob?.addEventListener('pointerdown', (event) => {
      if (!hasAdjustablePhoto() || !state.layout) return;
      const point = canvasPointFromClient(canvas, event.clientX, event.clientY);
      if (!point) return;
      const dx = point.x - state.layout.profileCx;
      const dy = point.y - state.layout.profileCy;
      state.resize = {
        startZoom: state.photoCrop.zoom,
        startDist: Math.max(24, Math.sqrt((dx * dx) + (dy * dy))),
      };
      handle?.classList.add('is-resizing');
      event.preventDefault();
      event.stopPropagation();
    });

    canvas.addEventListener('wheel', (event) => {
      if (!hasAdjustablePhoto()) return;
      const point = canvasPointFromClient(canvas, event.clientX, event.clientY);
      if (!pointInProfile(point, state.layout)) return;
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.08 : 0.08;
      applyPhotoZoom(state.photoCrop.zoom + delta, point);
    }, { passive: false });

    slider?.addEventListener('input', () => {
      applyPhotoZoom(Number(slider.value) || 1);
    });

    resetBtn?.addEventListener('click', () => {
      resetPhotoCrop();
      schedulePreview();
      setStatus('Photo position reset.');
    });

    window.addEventListener('resize', () => syncPhotoHandle());
  }

  function bindForm() {
    const form = $('#badge-creator-form');
    if (!form || form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';

    populateRoleOptions();
    populateYearOptions();
    writePhotoCropToForm(state.photoCrop);
    bindPhotoAdjustControls();

    form.addEventListener('input', (event) => {
      if (event.target?.id === 'badge-creator-photo-zoom') return;
      schedulePreview();
    });
    form.addEventListener('change', async (event) => {
      if (event.target.name === 'photo_file') {
        const file = event.target.files?.[0];
        revokePhotoObjectUrl();
        state.photoImage = null;
        resetPhotoCrop();
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
        const crop = currentPhotoCropFromForm();
        const payload = {
          member_name: values.name,
          role: values.role,
          school_year: values.schoolYear,
          photo_url: photoUrl,
          photo_zoom: crop.zoom,
          photo_offset_x: crop.offsetX,
          photo_offset_y: crop.offsetY,
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
    $('#badge-creator-print-selected')?.addEventListener('click', async () => {
      await printSelectedBadges();
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
