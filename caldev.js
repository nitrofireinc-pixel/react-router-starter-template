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
    view: 'rundown',
    cursor: startOfMonth(new Date()),
    selectedId: null,
    loading: true,
    error: '',
    didAutoOpen: false,
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

  function isCompactLayout() {
    try {
      return window.matchMedia('(max-width: 900px)').matches;
    } catch {
      return false;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function visibleEvents() {
    return state.events;
  }

  function todayIso() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const read = (type) => parts.find((part) => part.type === type)?.value;
    return `${read('year')}-${read('month')}-${read('day')}`;
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

  function nextIsoDay(iso) {
    const [year, month, day] = String(iso).split('-').map(Number);
    return isoDate(new Date(year, month - 1, day + 1));
  }

  function findNextDayIsoWithEvents(fromIso = todayIso()) {
    const dates = new Set();
    for (const event of state.events) {
      const start = String(event.start_date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
      const end = /^\d{4}-\d{2}-\d{2}$/.test(String(event.end_date || '')) && event.end_date >= start
        ? event.end_date
        : start;
      let iso = start < fromIso ? fromIso : start;
      while (iso <= end) {
        dates.add(iso);
        iso = nextIsoDay(iso);
      }
    }
    return [...dates].sort()[0] || null;
  }

  function landingEventCopy(event) {
    const bits = [eventTimeLabel(event)];
    if (event.who) bits.push(event.who);
    if (event.location) bits.push(event.location);
    const head = bits.filter(Boolean).join(' · ');
    const body = String(event.description || '').trim();
    return [head, body].filter(Boolean).join('\n\n');
  }

  function autoOpenLandingEvents() {
    if (state.didAutoOpen) return;
    if (typeof showCalendarDayToast !== 'function') {
      state.didAutoOpen = true;
      return;
    }
    const iso = findNextDayIsoWithEvents();
    const dayEvents = iso ? eventsOnDate(iso) : [];
    state.didAutoOpen = true;
    if (!dayEvents.length) return;
    window.setTimeout(() => {
      showCalendarDayToast(formatLongDate(iso), dayEvents.map((event) => ({
        title: event.title,
        description: landingEventCopy(event),
      })));
    }, 80);
  }

  async function loadEvents() {
    state.loading = true;
    state.error = '';
    render();
    try {
      const response = await fetch('/api/caldev/events', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Could not load Schedule Board events');
      state.events = await response.json();
    } catch (error) {
      state.error = error?.message || 'Could not load events';
      state.events = [];
    } finally {
      state.loading = false;
      render();
      autoOpenLandingEvents();
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
        <div class="caldev-toolbar-start">
          <h2 class="caldev-range-title">${escapeHtml(label)}</h2>
          <div class="caldev-toolbar-nav">
            <button type="button" class="caldev-icon-btn" data-caldev-shift="-1" aria-label="Previous">‹</button>
            <button type="button" class="btn outline caldev-today-btn" data-caldev-today>Today</button>
            <button type="button" class="caldev-icon-btn" data-caldev-shift="1" aria-label="Next">›</button>
          </div>
        </div>
        <div class="caldev-toolbar-end">
          <div class="caldev-view-switch" role="group" aria-label="Schedule views">
            ${['month', 'week', 'rundown'].map((view) => `
              <button type="button" class="caldev-view-btn${state.view === view ? ' is-active' : ''}" data-caldev-view="${view}">
                ${view === 'rundown' ? 'Rundown' : view[0].toUpperCase() + view.slice(1)}
              </button>
            `).join('')}
          </div>
        </div>
      </div>
      <p class="caldev-hint">View only on the public site. Super Admins edit this board in the CMS Schedule Board tab. Meetings also appear on Boosters.</p>
    `;
  }

  function renderLegend() {
    return `
      <div class="caldev-legend" aria-label="Event color legend">
        <span class="caldev-legend-label">Legend</span>
        <ul class="caldev-legend-list">
          ${TRACKS.map((track) => {
            const ink = track.ink || '#fff';
            return `
              <li class="caldev-legend-item">
                <span class="caldev-track-swatch" style="--caldev-track:${track.color};--caldev-track-ink:${ink}" aria-hidden="true"></span>
                <span>${escapeHtml(track.label)}</span>
              </li>
            `;
          }).join('')}
        </ul>
      </div>
    `;
  }

  function eventChip(event) {
    const track = TRACK_MAP[event.track] || TRACK_MAP.other;
    return `<button type="button" class="caldev-event-chip" style="--caldev-track:${track.color}"
      data-caldev-open="${event.id}" title="${escapeHtml(event.title)}">${escapeHtml(event.title)}</button>`;
  }

  function renderMonth() {
    const year = state.cursor.getFullYear();
    const month = state.cursor.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const dim = new Date(year, month + 1, 0).getDate();
    const today = todayIso();
    const compact = isCompactLayout();
    const cells = [];
    for (let i = 0; i < firstDow; i += 1) cells.push('<div class="caldev-day is-spacer" aria-hidden="true"></div>');
    for (let day = 1; day <= dim; day += 1) {
      const date = new Date(year, month, day);
      const iso = isoDate(date);
      const all = eventsOnDate(iso);
      const dayEvents = all.slice(0, compact ? 8 : 4);
      const extra = Math.max(0, all.length - dayEvents.length);
      cells.push(`
        <div class="caldev-day${iso === today ? ' is-today' : ''}${dayEvents.length ? ' has-events' : ''}">
          <div class="caldev-day-head"><span>${day}</span></div>
          <div class="caldev-day-events">
            ${dayEvents.map((event) => eventChip(event)).join('')}
            ${extra ? `<span class="caldev-more">+${extra} more</span>` : ''}
          </div>
        </div>
      `);
    }
    return `
      <div class="caldev-month${compact ? ' is-compact' : ''}">
        <div class="caldev-weekday-row">${WEEKDAYS.map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="caldev-month-grid">${cells.join('')}</div>
      </div>
    `;
  }

  function renderWeek() {
    const start = startOfWeek(state.cursor);
    const today = todayIso();
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return `
      <div class="caldev-week">
        ${days.map((date) => {
          const iso = isoDate(date);
          const dayEvents = iso < today ? [] : eventsOnDate(iso);
          return `
            <div class="caldev-week-col${iso === today ? ' is-today' : ''}">
              <header>
                <span>${WEEKDAYS[date.getDay()]}</span>
                <strong>${date.getDate()}</strong>
              </header>
              <div class="caldev-week-events">
                ${dayEvents.length
                  ? dayEvents.map((event) => {
                    const track = TRACK_MAP[event.track] || TRACK_MAP.other;
                    return `
                      <button type="button" class="caldev-week-event" style="--caldev-track:${track.color}" data-caldev-open="${event.id}">
                        <small>${escapeHtml(eventTimeLabel(event))}</small>
                        <strong>${escapeHtml(event.title)}</strong>
                      </button>
                    `;
                  }).join('')
                  : '<p class="draft">No Event Today!</p>'}
              </div>
            </div>
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
      .filter((event) => event.start_date >= todayIso())
      .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date))
        || String(a.start_time || '').localeCompare(String(b.start_time || '')));

    const groups = new Map();
    for (const event of dated) {
      if (!groups.has(event.start_date)) groups.set(event.start_date, []);
      groups.get(event.start_date).push(event);
    }

    if (!groups.size) {
      return '<div class="caldev-rundown"><p class="draft">No upcoming events in this month.</p></div>';
    }

    return `
      <div class="caldev-rundown">
        ${[...groups.entries()].map(([date, events]) => `
          <div class="caldev-rundown-day">
            <h3>${escapeHtml(formatLongDate(date))}</h3>
            <ul>
              ${events.map((event) => `
                <li>
                  <button type="button" class="caldev-rundown-item" data-caldev-open="${event.id}">
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
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderDetail() {
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
        </div>
      </div>
    `;
  }

  function render() {
    const root = document.querySelector('#caldev-app');
    if (!root) return;
    const board = state.view === 'week' ? renderWeek() : state.view === 'rundown' ? renderRundown() : renderMonth();
    root.classList.toggle('is-compact', isCompactLayout());
    root.innerHTML = `
      ${renderToolbar()}
      ${renderLegend()}
      <div class="caldev-board">
        ${state.loading ? '<p class="draft">Loading schedule…</p>' : ''}
        ${state.error ? `<p class="draft">${escapeHtml(state.error)}</p>` : ''}
        ${!state.loading && !state.error ? board : ''}
      </div>
      ${renderDetail()}
    `;
    document.body.classList.toggle('caldev-scroll-lock', Boolean(state.selectedId));
    bind(root);
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
    root.querySelectorAll('[data-caldev-open]').forEach((button) => {
      button.addEventListener('click', () => {
        state.selectedId = Number(button.dataset.caldevOpen);
        render();
      });
    });
    root.querySelectorAll('[data-caldev-close]').forEach((node) => {
      node.addEventListener('click', () => {
        state.selectedId = null;
        render();
      });
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.selectedId != null) {
      state.selectedId = null;
      render();
    }
  });

  window.addEventListener('resize', () => {
    const root = document.querySelector('#caldev-app');
    if (!root || state.loading) return;
    const compact = isCompactLayout();
    if (root.classList.contains('is-compact') !== compact) render();
  });

  if (document.querySelector('#caldev-app')) loadEvents();
})();
