(() => {
  const TRACKS = [
    { id: 'game', label: 'Games', color: '#E71321' },
    { id: 'rehearsal', label: 'Rehearsals', color: '#014990' },
    { id: 'meeting', label: 'Meetings', color: '#002142' },
    { id: 'deadline', label: 'Deadlines', color: '#FDD703', ink: '#002142' },
    { id: 'trip', label: 'Trips', color: '#7c3aed' },
    { id: 'other', label: 'Other', color: '#5b6472' },
  ];
  const TRACK_MAP = Object.fromEntries(TRACKS.map((t) => [t.id, t]));
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const state = {
    events: [],
    view: 'month',
    cursor: startOfMonth(new Date()),
    hiddenTracks: new Set(),
    selectedId: null,
    draft: null, // create/edit form model
    mode: 'view', // view | edit | create
    canEdit: false,
    loading: true,
    saving: false,
    error: '',
    notice: '',
    draggingId: null,
  };

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function addMonths(date, delta) {
    return new Date(date.getFullYear(), date.getMonth() + delta, 1);
  }

  function addDays(date, delta) {
    const next = new Date(date);
    next.setDate(next.getDate() + delta);
    return next;
  }

  function startOfWeek(date) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() - next.getDay());
    return next;
  }

  function isoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function parseIso(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const [y, m, d] = String(value).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function emptyDraft(overrides = {}) {
    return {
      id: null,
      title: '',
      who: '',
      location: '',
      description: '',
      track: 'other',
      start_date: isoDate(new Date()),
      end_date: '',
      start_time: '',
      end_time: '',
      all_day: true,
      ...overrides,
    };
  }

  function eventToDraft(event) {
    return emptyDraft({
      id: event.id,
      title: event.title || '',
      who: event.who || '',
      location: event.location || '',
      description: event.description || '',
      track: event.track || 'other',
      start_date: event.start_date || '',
      end_date: event.end_date || '',
      start_time: event.start_time || '',
      end_time: event.end_time || '',
      all_day: Boolean(Number(event.all_day)) || !event.start_time,
    });
  }

  function visibleEvents() {
    return state.events.filter((event) => !state.hiddenTracks.has(event.track || 'other'));
  }

  function eventsOnDate(iso) {
    return visibleEvents().filter((event) => {
      if (!event.start_date) return false;
      if (event.end_date && event.end_date >= event.start_date) {
        return iso >= event.start_date && iso <= event.end_date;
      }
      return event.start_date === iso;
    }).sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || ''))
      || String(a.title || '').localeCompare(String(b.title || '')));
  }

  function undatedEvents() {
    return visibleEvents().filter((event) => !event.start_date);
  }

  function selectedEvent() {
    return state.events.find((event) => Number(event.id) === Number(state.selectedId)) || null;
  }

  function trackChip(trackId) {
    const track = TRACK_MAP[trackId] || TRACK_MAP.other;
    const ink = track.ink || '#fff';
    return `<span class="caldev-track-pill" style="--caldev-track:${track.color};--caldev-track-ink:${ink}">${escapeHtml(track.label)}</span>`;
  }

  function eventTimeLabel(event) {
    if (event.all_day || !event.start_time) return 'All day';
    if (event.end_time) return `${event.start_time}–${event.end_time}`;
    return event.start_time;
  }

  function formatLongDate(iso) {
    const date = parseIso(iso);
    if (!date) return 'Date TBD';
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  function shiftDatePreservingSpan(event, nextStart) {
    const currentStart = String(event?.start_date || '');
    const currentEnd = String(event?.end_date || '');
    let end_date = '';
    if (currentStart && currentEnd && currentEnd >= currentStart) {
      const a = parseIso(currentStart);
      const b = parseIso(currentEnd);
      const n = parseIso(nextStart);
      if (a && b && n) {
        const span = Math.round((b - a) / 86400000);
        end_date = isoDate(addDays(n, span));
      }
    }
    return { start_date: nextStart, end_date };
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || payload.error || 'Request failed');
    return payload;
  }

  async function refreshSession() {
    try {
      const session = await api('/api/session');
      state.canEdit = Boolean(session?.logged_in && session?.is_super_admin);
    } catch {
      state.canEdit = false;
    }
  }

  async function loadEvents({ quiet = false } = {}) {
    if (!quiet) {
      state.loading = true;
      state.error = '';
      render();
    }
    try {
      state.events = await api('/api/caldev/events');
    } catch (error) {
      state.error = error?.message || 'Could not load events';
      state.events = [];
    } finally {
      state.loading = false;
      render();
    }
  }

  function openCreate(dateIso = '') {
    if (!state.canEdit) return;
    state.mode = 'create';
    state.selectedId = null;
    state.draft = emptyDraft({ start_date: dateIso || isoDate(state.cursor) });
    render();
  }

  function openView(id) {
    state.selectedId = Number(id);
    state.mode = 'view';
    state.draft = null;
    render();
  }

  function openEdit(event) {
    if (!state.canEdit || !event) return;
    state.selectedId = event.id;
    state.mode = 'edit';
    state.draft = eventToDraft(event);
    render();
  }

  function closePanel() {
    state.selectedId = null;
    state.mode = 'view';
    state.draft = null;
    render();
  }

  async function saveDraft() {
    if (!state.canEdit || !state.draft || state.saving) return;
    const draft = state.draft;
    if (!String(draft.title || '').trim()) {
      state.notice = 'Add a title to save.';
      render();
      return;
    }
    state.saving = true;
    state.notice = '';
    render();
    const payload = {
      title: draft.title,
      who: draft.who,
      location: draft.location,
      description: draft.description,
      track: draft.track,
      start_date: draft.start_date,
      end_date: draft.end_date,
      start_time: draft.all_day ? '' : draft.start_time,
      end_time: draft.all_day ? '' : draft.end_time,
      all_day: draft.all_day,
    };
    try {
      let saved;
      if (draft.id) {
        saved = await api(`/api/admin/caldev/events/${draft.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        saved = await api('/api/admin/caldev/events', { method: 'POST', body: JSON.stringify(payload) });
      }
      await loadEvents({ quiet: true });
      state.selectedId = saved.id;
      state.mode = 'view';
      state.draft = null;
      state.notice = 'Saved.';
    } catch (error) {
      state.notice = error.message || 'Could not save.';
    } finally {
      state.saving = false;
      render();
    }
  }

  async function deleteSelected() {
    const event = selectedEvent();
    if (!state.canEdit || !event) return;
    if (!confirm(`Delete “${event.title}”?`)) return;
    state.saving = true;
    render();
    try {
      await api(`/api/admin/caldev/events/${event.id}`, { method: 'DELETE' });
      state.selectedId = null;
      state.mode = 'view';
      state.draft = null;
      state.notice = 'Deleted.';
      await loadEvents({ quiet: true });
    } catch (error) {
      state.notice = error.message || 'Could not delete.';
    } finally {
      state.saving = false;
      render();
    }
  }

  async function rescheduleEvent(id, nextDate) {
    if (!state.canEdit || !nextDate) return;
    const event = state.events.find((item) => Number(item.id) === Number(id));
    if (!event || event.start_date === nextDate) return;
    const shifted = shiftDatePreservingSpan(event, nextDate);
    // Optimistic UI
    event.start_date = shifted.start_date;
    event.end_date = shifted.end_date;
    render();
    try {
      await api(`/api/admin/caldev/events/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...event,
          start_date: shifted.start_date,
          end_date: shifted.end_date,
        }),
      });
      state.notice = `Moved to ${formatLongDate(nextDate)}.`;
      await loadEvents({ quiet: true });
    } catch (error) {
      state.notice = error.message || 'Could not reschedule.';
      await loadEvents({ quiet: true });
    }
  }

  function renderToolbar() {
    const label = state.view === 'week'
      ? (() => {
        const start = startOfWeek(state.cursor);
        const end = addDays(start, 6);
        return `${MONTHS[start.getMonth()]} ${start.getDate()} – ${MONTHS[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
      })()
      : `${MONTHS[state.cursor.getMonth()]} ${state.cursor.getFullYear()}`;

    return `
      <div class="caldev-toolbar">
        <div class="caldev-toolbar-nav">
          <button type="button" class="caldev-icon-btn" data-caldev-shift="-1" aria-label="Previous">‹</button>
          <button type="button" class="btn outline caldev-today-btn" data-caldev-today>Today</button>
          <button type="button" class="caldev-icon-btn" data-caldev-shift="1" aria-label="Next">›</button>
          <h2 class="caldev-range-title">${escapeHtml(label)}</h2>
        </div>
        <div class="caldev-toolbar-end">
          <div class="caldev-view-switch" role="group" aria-label="Schedule views">
            ${['month', 'week', 'rundown'].map((view) => `
              <button type="button" class="caldev-view-btn${state.view === view ? ' is-active' : ''}" data-caldev-view="${view}">
                ${view === 'rundown' ? 'Rundown' : view[0].toUpperCase() + view.slice(1)}
              </button>
            `).join('')}
          </div>
          ${state.canEdit ? '<button type="button" class="btn primary" data-caldev-create>New event</button>' : ''}
        </div>
      </div>
      <p class="caldev-hint">${state.canEdit
        ? 'Tip: drag an event onto another day to reschedule. Click a day to add. Click an event to edit.'
        : 'View only. Super Admins can edit and drag events after logging into the CMS.'}</p>
      ${state.notice ? `<p class="caldev-notice" role="status">${escapeHtml(state.notice)}</p>` : ''}
    `;
  }

  function renderFilters() {
    return `
      <aside class="caldev-filters" aria-label="Program tracks">
        <h3>Tracks</h3>
        <p class="caldev-filters-note">Show only the lanes you need.</p>
        <ul class="caldev-track-list">
          ${TRACKS.map((track) => {
            const checked = !state.hiddenTracks.has(track.id);
            const ink = track.ink || '#fff';
            return `
              <li>
                <label class="caldev-track-toggle">
                  <input type="checkbox" data-caldev-track="${track.id}" ${checked ? 'checked' : ''}>
                  <span class="caldev-track-swatch" style="--caldev-track:${track.color};--caldev-track-ink:${ink}"></span>
                  <span>${escapeHtml(track.label)}</span>
                </label>
              </li>
            `;
          }).join('')}
        </ul>
        <div class="caldev-undated">
          <h4>Needs a date</h4>
          ${undatedEvents().length
            ? undatedEvents().map((event) => `
                <button type="button" class="caldev-undated-item" data-caldev-open="${event.id}"
                  ${state.canEdit ? `draggable="true" data-caldev-drag="${event.id}"` : ''}>
                  ${trackChip(event.track)}
                  <strong>${escapeHtml(event.title)}</strong>
                </button>
              `).join('')
            : '<p class="draft">None</p>'}
        </div>
      </aside>
    `;
  }

  function eventChip(event, extraClass = '') {
    const track = TRACK_MAP[event.track] || TRACK_MAP.other;
    const dragAttrs = state.canEdit
      ? `draggable="true" data-caldev-drag="${event.id}"`
      : '';
    return `<button type="button" class="caldev-event-chip ${extraClass}" style="--caldev-track:${track.color}"
      data-caldev-open="${event.id}" ${dragAttrs} title="${escapeHtml(event.title)}">${escapeHtml(event.title)}</button>`;
  }

  function renderMonth() {
    const year = state.cursor.getFullYear();
    const month = state.cursor.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const dim = new Date(year, month + 1, 0).getDate();
    const todayIso = isoDate(new Date());
    const cells = [];
    for (let i = 0; i < firstDow; i += 1) cells.push('<div class="caldev-day is-spacer" aria-hidden="true"></div>');
    for (let day = 1; day <= dim; day += 1) {
      const date = new Date(year, month, day);
      const iso = isoDate(date);
      const dayEvents = eventsOnDate(iso).slice(0, 4);
      const extra = Math.max(0, eventsOnDate(iso).length - dayEvents.length);
      cells.push(`
        <div class="caldev-day${iso === todayIso ? ' is-today' : ''}${dayEvents.length ? ' has-events' : ''}"
          data-caldev-drop="${iso}" data-caldev-day="${iso}">
          <div class="caldev-day-head">
            <span>${day}</span>
            ${state.canEdit ? `<button type="button" class="caldev-day-add" data-caldev-create-day="${iso}" aria-label="Add event on ${iso}">+</button>` : ''}
          </div>
          <div class="caldev-day-events">
            ${dayEvents.map((event) => eventChip(event)).join('')}
            ${extra ? `<span class="caldev-more">+${extra} more</span>` : ''}
          </div>
        </div>
      `);
    }
    return `
      <div class="caldev-month">
        <div class="caldev-weekday-row">${WEEKDAYS.map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="caldev-month-grid">${cells.join('')}</div>
      </div>
    `;
  }

  function renderWeek() {
    const start = startOfWeek(state.cursor);
    const todayIso = isoDate(new Date());
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return `
      <div class="caldev-week">
        ${days.map((date) => {
          const iso = isoDate(date);
          const dayEvents = eventsOnDate(iso);
          return `
            <section class="caldev-week-col${iso === todayIso ? ' is-today' : ''}" data-caldev-drop="${iso}" data-caldev-day="${iso}">
              <header>
                <span>${WEEKDAYS[date.getDay()]}</span>
                <strong>${date.getDate()}</strong>
                ${state.canEdit ? `<button type="button" class="caldev-day-add" data-caldev-create-day="${iso}" aria-label="Add event">+</button>` : ''}
              </header>
              <div class="caldev-week-events">
                ${dayEvents.length
                  ? dayEvents.map((event) => {
                    const track = TRACK_MAP[event.track] || TRACK_MAP.other;
                    const dragAttrs = state.canEdit ? `draggable="true" data-caldev-drag="${event.id}"` : '';
                    return `
                      <button type="button" class="caldev-week-event" style="--caldev-track:${track.color}"
                        data-caldev-open="${event.id}" ${dragAttrs}>
                        <small>${escapeHtml(eventTimeLabel(event))}</small>
                        <strong>${escapeHtml(event.title)}</strong>
                      </button>
                    `;
                  }).join('')
                  : '<p class="draft">Open</p>'}
              </div>
            </section>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderRundown() {
    const start = startOfMonth(state.cursor);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const startIso = isoDate(start);
    const endIso = isoDate(end);
    const dated = visibleEvents()
      .filter((event) => event.start_date && event.start_date >= startIso && event.start_date <= endIso)
      .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date))
        || String(a.start_time || '').localeCompare(String(b.start_time || '')));

    const groups = new Map();
    for (const event of dated) {
      if (!groups.has(event.start_date)) groups.set(event.start_date, []);
      groups.get(event.start_date).push(event);
    }

    if (!groups.size) {
      return '<div class="caldev-rundown"><p class="draft">No dated events in this month.</p></div>';
    }

    return `
      <div class="caldev-rundown">
        ${[...groups.entries()].map(([date, events]) => `
          <section class="caldev-rundown-day" data-caldev-drop="${date}">
            <h3>${escapeHtml(formatLongDate(date))}</h3>
            <ul>
              ${events.map((event) => `
                <li>
                  <button type="button" class="caldev-rundown-item" data-caldev-open="${event.id}"
                    ${state.canEdit ? `draggable="true" data-caldev-drag="${event.id}"` : ''}>
                    ${trackChip(event.track)}
                    <span class="caldev-rundown-copy">
                      <strong>${escapeHtml(event.title)}</strong>
                      <small>${escapeHtml(eventTimeLabel(event))}${event.who ? ` · ${escapeHtml(event.who)}` : ''}${event.location ? ` · ${escapeHtml(event.location)}` : ''}</small>
                      ${event.description ? `<span>${escapeHtml(event.description)}</span>` : ''}
                    </span>
                  </button>
                </li>
              `).join('')}
            </ul>
          </section>
        `).join('')}
      </div>
    `;
  }

  function renderEditorFields(draft) {
    return `
      <label class="caldev-field">Title
        <input name="title" maxlength="200" required value="${escapeHtml(draft.title)}" placeholder="Event name">
      </label>
      <label class="caldev-field">Track
        <select name="track">
          ${TRACKS.map((track) => `<option value="${track.id}" ${draft.track === track.id ? 'selected' : ''}>${escapeHtml(track.label)}</option>`).join('')}
        </select>
      </label>
      <label class="caldev-field">Who
        <input name="who" maxlength="200" value="${escapeHtml(draft.who)}" placeholder="Who is involved">
      </label>
      <label class="caldev-field">Where
        <input name="location" maxlength="200" value="${escapeHtml(draft.location)}" placeholder="Location">
      </label>
      <label class="caldev-field">Start date
        <input name="start_date" type="date" value="${escapeHtml(draft.start_date)}">
      </label>
      <label class="caldev-field">End date
        <input name="end_date" type="date" value="${escapeHtml(draft.end_date)}">
      </label>
      <label class="caldev-check"><input name="all_day" type="checkbox" ${draft.all_day ? 'checked' : ''}> All day</label>
      <div class="caldev-time-row${draft.all_day ? ' is-disabled' : ''}">
        <label class="caldev-field">Start time
          <input name="start_time" type="time" value="${escapeHtml(draft.start_time)}" ${draft.all_day ? 'disabled' : ''}>
        </label>
        <label class="caldev-field">End time
          <input name="end_time" type="time" value="${escapeHtml(draft.end_time)}" ${draft.all_day ? 'disabled' : ''}>
        </label>
      </div>
      <label class="caldev-field full">Details
        <textarea name="description" rows="5" placeholder="Notes, call times, what to bring…">${escapeHtml(draft.description)}</textarea>
      </label>
    `;
  }

  function renderPanel() {
    if (state.mode === 'create' || state.mode === 'edit') {
      const draft = state.draft || emptyDraft();
      return `
        <div class="caldev-detail is-editor" role="dialog" aria-modal="true" aria-labelledby="caldev-detail-title">
          <div class="caldev-detail-backdrop" data-caldev-close></div>
          <div class="caldev-detail-panel">
            <button type="button" class="sponsor-flyin-close" data-caldev-close aria-label="Close">×</button>
            <p class="caldev-detail-kicker">${state.mode === 'create' ? 'New event' : 'Edit event'}</p>
            <h3 id="caldev-detail-title">${state.mode === 'create' ? 'Add to Schedule Board' : 'Update event'}</h3>
            <form class="caldev-editor-form" data-caldev-editor>
              ${renderEditorFields(draft)}
              <div class="caldev-editor-actions">
                <button class="btn primary" type="submit" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Saving…' : 'Save'}</button>
                <button class="btn outline" type="button" data-caldev-close>Cancel</button>
                ${state.mode === 'edit' ? '<button class="btn outline caldev-danger" type="button" data-caldev-delete>Delete</button>' : ''}
              </div>
            </form>
          </div>
        </div>
      `;
    }

    const event = selectedEvent();
    if (!event) return '';
    return `
      <div class="caldev-detail" role="dialog" aria-modal="true" aria-labelledby="caldev-detail-title">
        <div class="caldev-detail-backdrop" data-caldev-close></div>
        <div class="caldev-detail-panel">
          <button type="button" class="sponsor-flyin-close" data-caldev-close aria-label="Close">×</button>
          ${trackChip(event.track)}
          <h3 id="caldev-detail-title">${escapeHtml(event.title)}</h3>
          <p class="caldev-detail-when">${escapeHtml(formatLongDate(event.start_date))} · ${escapeHtml(eventTimeLabel(event))}</p>
          ${event.who ? `<p class="caldev-detail-meta"><span>Who</span>${escapeHtml(event.who)}</p>` : ''}
          ${event.location ? `<p class="caldev-detail-meta"><span>Where</span>${escapeHtml(event.location)}</p>` : ''}
          ${event.description ? `<p class="caldev-detail-body">${escapeHtml(event.description)}</p>` : '<p class="draft">No details yet.</p>'}
          ${state.canEdit ? `
            <div class="caldev-editor-actions">
              <button type="button" class="btn primary" data-caldev-edit="${event.id}">Edit</button>
              <button type="button" class="btn outline caldev-danger" data-caldev-delete>Delete</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function render() {
    const root = document.querySelector('#caldev-app');
    if (!root) return;
    const board = state.view === 'week' ? renderWeek() : state.view === 'rundown' ? renderRundown() : renderMonth();
    root.innerHTML = `
      ${renderToolbar()}
      <div class="caldev-layout">
        ${renderFilters()}
        <div class="caldev-board${state.draggingId ? ' is-dragging' : ''}">
          ${state.loading ? '<p class="draft">Loading schedule…</p>' : ''}
          ${state.error ? `<p class="draft">${escapeHtml(state.error)}</p>` : ''}
          ${!state.loading && !state.error ? board : ''}
        </div>
      </div>
      ${renderPanel()}
    `;
    bind(root);
  }

  function readDraftFromForm(form) {
    const data = new FormData(form);
    return emptyDraft({
      id: state.draft?.id || null,
      title: String(data.get('title') || ''),
      who: String(data.get('who') || ''),
      location: String(data.get('location') || ''),
      description: String(data.get('description') || ''),
      track: String(data.get('track') || 'other'),
      start_date: String(data.get('start_date') || ''),
      end_date: String(data.get('end_date') || ''),
      start_time: String(data.get('start_time') || ''),
      end_time: String(data.get('end_time') || ''),
      all_day: form.elements.all_day?.checked !== false,
    });
  }

  function bind(root) {
    root.querySelectorAll('[data-caldev-view]').forEach((button) => {
      button.addEventListener('click', () => {
        state.view = button.dataset.caldevView;
        render();
      });
    });
    root.querySelectorAll('[data-caldev-shift]').forEach((button) => {
      button.addEventListener('click', () => {
        const delta = Number(button.dataset.caldevShift);
        if (state.view === 'week') state.cursor = addDays(state.cursor, delta * 7);
        else state.cursor = addMonths(state.cursor, delta);
        render();
      });
    });
    root.querySelector('[data-caldev-today]')?.addEventListener('click', () => {
      state.cursor = state.view === 'week' ? new Date() : startOfMonth(new Date());
      render();
    });
    root.querySelector('[data-caldev-create]')?.addEventListener('click', () => openCreate());
    root.querySelectorAll('[data-caldev-create-day]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        openCreate(button.dataset.caldevCreateDay);
      });
    });
    root.querySelectorAll('[data-caldev-track]').forEach((input) => {
      input.addEventListener('change', () => {
        const id = input.dataset.caldevTrack;
        if (input.checked) state.hiddenTracks.delete(id);
        else state.hiddenTracks.add(id);
        render();
      });
    });
    root.querySelectorAll('[data-caldev-open]').forEach((button) => {
      button.addEventListener('click', (event) => {
        if (state.draggingId) return;
        event.stopPropagation();
        openView(button.dataset.caldevOpen);
      });
    });
    root.querySelectorAll('[data-caldev-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const event = state.events.find((item) => Number(item.id) === Number(button.dataset.caldevEdit));
        openEdit(event);
      });
    });
    root.querySelectorAll('[data-caldev-close]').forEach((node) => {
      node.addEventListener('click', () => closePanel());
    });
    root.querySelectorAll('[data-caldev-delete]').forEach((button) => {
      button.addEventListener('click', () => deleteSelected());
    });
    root.querySelector('[data-caldev-editor]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      state.draft = readDraftFromForm(event.currentTarget);
      saveDraft();
    });
    root.querySelector('[data-caldev-editor] [name="all_day"]')?.addEventListener('change', (event) => {
      state.draft = readDraftFromForm(event.target.form);
      render();
    });

    // Drag and drop reschedule
    root.querySelectorAll('[data-caldev-drag]').forEach((node) => {
      node.addEventListener('dragstart', (event) => {
        if (!state.canEdit) return;
        state.draggingId = Number(node.dataset.caldevDrag);
        event.dataTransfer.setData('text/caldev-id', String(state.draggingId));
        event.dataTransfer.effectAllowed = 'move';
        node.classList.add('is-dragging');
        root.querySelector('.caldev-board')?.classList.add('is-dragging');
      });
      node.addEventListener('dragend', () => {
        state.draggingId = null;
        root.querySelectorAll('.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'));
        root.querySelector('.caldev-board')?.classList.remove('is-dragging');
        node.classList.remove('is-dragging');
      });
    });
    root.querySelectorAll('[data-caldev-drop]').forEach((zone) => {
      zone.addEventListener('dragover', (event) => {
        if (!state.canEdit || !state.draggingId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        zone.classList.add('is-drop-target');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('is-drop-target'));
      zone.addEventListener('drop', (event) => {
        if (!state.canEdit) return;
        event.preventDefault();
        zone.classList.remove('is-drop-target');
        const id = Number(event.dataTransfer.getData('text/caldev-id') || state.draggingId);
        const nextDate = zone.dataset.caldevDrop;
        state.draggingId = null;
        rescheduleEvent(id, nextDate);
      });
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (state.selectedId != null || state.mode === 'create' || state.mode === 'edit')) {
      closePanel();
    }
  });

  async function boot() {
    await refreshSession();
    await loadEvents();
  }

  if (document.querySelector('#caldev-app')) boot();
})();
