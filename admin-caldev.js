/* Schedule Board CMS editor — Super Admin only. Public /caldev stays view-only. */
(function () {
  "use strict";

  const TRACKS = [
    { id: "game", label: "Games", color: "#E71321" },
    { id: "rehearsal", label: "Rehearsals", color: "#014990" },
    { id: "meeting", label: "Meetings", color: "#002142" },
    { id: "deadline", label: "Deadlines", color: "#FDD703", ink: "#002142" },
    { id: "trip", label: "Trips", color: "#7c3aed" },
    { id: "other", label: "Other", color: "#5b6472" },
  ];

  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  let root = null;
  let events = [];
  let view = "month";
  let cursor = startOfMonth(new Date());
  let activeTracks = new Set(TRACKS.map((t) => t.id));
  let selectedId = null;
  let draggingId = null;
  let moveModeId = null;
  let toastTimer = null;
  let saveBusy = false;
  let bound = false;
  let mounted = false;

  function pad(n) {
    return String(n).padStart(2, "0");
  }
  function toDateKey(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function parseDateKey(key) {
    const [y, m, d] = String(key || "").split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  function addMonths(d, n) {
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
  }
  function startOfWeek(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - x.getDay());
    return x;
  }
  function addDays(d, n) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function isToday(d) {
    return sameDay(d, new Date());
  }
  function trackMeta(id) {
    return TRACKS.find((t) => t.id === id) || TRACKS[TRACKS.length - 1];
  }
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function eventDayKey(ev) {
    return String(ev.start_date || "").slice(0, 10);
  }
  function eventTimeLabel(ev) {
    if (ev.all_day || !ev.start_time) return "All day";
    if (ev.end_time) return `${ev.start_time}–${ev.end_time}`;
    return ev.start_time;
  }
  function shiftEventToDate(ev, targetDateKey) {
    const currentStart = String(ev.start_date || "");
    const currentEnd = String(ev.end_date || "");
    let end_date = "";
    if (currentStart && currentEnd && currentEnd >= currentStart) {
      const startMs = Date.parse(`${currentStart}T00:00:00Z`);
      const endMs = Date.parse(`${currentEnd}T00:00:00Z`);
      const nextMs = Date.parse(`${targetDateKey}T00:00:00Z`);
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && Number.isFinite(nextMs)) {
        const spanDays = Math.round((endMs - startMs) / 86400000);
        const shifted = new Date(nextMs + spanDays * 86400000);
        end_date = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
      }
    }
    return { ...ev, start_date: targetDateKey, end_date };
  }
  function sortEvents(list) {
    return [...list].sort((a, b) => {
      const ak = eventDayKey(a);
      const bk = eventDayKey(b);
      if (ak !== bk) {
        if (!ak) return 1;
        if (!bk) return -1;
        return ak < bk ? -1 : 1;
      }
      if (!!a.all_day !== !!b.all_day) return a.all_day ? -1 : 1;
      return String(a.start_time || "").localeCompare(String(b.start_time || ""))
        || String(a.title || "").localeCompare(String(b.title || ""));
    });
  }
  function filteredEvents() {
    return sortEvents(events.filter((ev) => activeTracks.has(ev.track || "other")));
  }
  function eventsForDay(dateKey) {
    return filteredEvents().filter((ev) => {
      const start = eventDayKey(ev);
      if (!start) return false;
      const end = String(ev.end_date || "").slice(0, 10);
      if (end && end >= start) return dateKey >= start && dateKey <= end;
      return start === dateKey;
    });
  }
  function undatedEvents() {
    return filteredEvents().filter((ev) => !eventDayKey(ev));
  }
  function monthTitle() {
    return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  }
  function weekTitle() {
    const start = startOfWeek(cursor);
    const end = addDays(start, 6);
    if (start.getMonth() === end.getMonth()) {
      return `${MONTHS[start.getMonth()]} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
    }
    return `${MONTHS[start.getMonth()].slice(0, 3)} ${start.getDate()} – ${MONTHS[end.getMonth()].slice(0, 3)} ${end.getDate()}, ${end.getFullYear()}`;
  }
  function titleForView() {
    return view === "week" ? weekTitle() : monthTitle();
  }
  function isCompact() {
    return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 820px)").matches;
  }

  function showToast(message, isError) {
    const el = root?.querySelector("[data-cms-caldev-toast]");
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    el.classList.toggle("is-error", !!isError);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 2800);
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || data.error || `Request failed (${res.status})`);
    return data;
  }

  async function loadEvents() {
    const data = await api("/api/admin/caldev/events");
    events = Array.isArray(data.events) ? data.events : [];
  }

  async function createEvent(payload) {
    return api("/api/admin/caldev/events", { method: "POST", body: JSON.stringify(payload) });
  }

  async function updateEvent(id, payload) {
    return api(`/api/admin/caldev/events/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  async function deleteEvent(id) {
    await api(`/api/admin/caldev/events/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  function payloadFromEvent(ev) {
    return {
      title: ev.title || "",
      description: ev.description || "",
      location: ev.location || "",
      who: ev.who || "",
      start_date: ev.start_date || "",
      end_date: ev.end_date || "",
      start_time: ev.start_time || "",
      end_time: ev.end_time || "",
      all_day: !!Number(ev.all_day) || !ev.start_time,
      track: ev.track || "other",
    };
  }

  async function persistMove(id, targetDateKey) {
    const current = events.find((e) => String(e.id) === String(id));
    if (!current) return;
    const next = shiftEventToDate(current, targetDateKey);
    const idx = events.findIndex((e) => String(e.id) === String(id));
    if (idx >= 0) events[idx] = { ...events[idx], ...next };
    moveModeId = null;
    render();
    try {
      const saved = await updateEvent(id, payloadFromEvent(next));
      const i = events.findIndex((e) => String(e.id) === String(id));
      if (i >= 0) events[i] = saved;
      showToast("Event moved");
      render();
    } catch (err) {
      showToast(err.message || "Move failed", true);
      await loadEvents();
      render();
    }
  }

  function blankForm(dateKey) {
    return {
      id: null,
      title: "",
      description: "",
      location: "",
      who: "",
      start_date: dateKey || toDateKey(new Date()),
      end_date: "",
      start_time: "16:00",
      end_time: "18:00",
      all_day: false,
      track: "rehearsal",
    };
  }

  function eventToForm(ev) {
    return {
      id: ev.id,
      title: ev.title || "",
      description: ev.description || "",
      location: ev.location || "",
      who: ev.who || "",
      start_date: eventDayKey(ev) || toDateKey(new Date()),
      end_date: String(ev.end_date || "").slice(0, 10),
      start_time: ev.start_time || "16:00",
      end_time: ev.end_time || "18:00",
      all_day: !!Number(ev.all_day) || !ev.start_time,
      track: ev.track || "other",
    };
  }

  function formFromDom() {
    const panel = root.querySelector("[data-cms-caldev-editor]");
    if (!panel) return null;
    const allDay = panel.querySelector('[name="all_day"]').checked;
    const track = panel.querySelector('[name="track"]').value || "other";
    return {
      id: panel.dataset.eventId || null,
      title: panel.querySelector('[name="title"]').value.trim(),
      description: panel.querySelector('[name="description"]').value.trim(),
      location: panel.querySelector('[name="location"]').value.trim(),
      who: panel.querySelector('[name="who"]').value.trim(),
      start_date: panel.querySelector('[name="start_date"]').value,
      end_date: panel.querySelector('[name="end_date"]').value,
      start_time: allDay ? "" : panel.querySelector('[name="start_time"]').value,
      end_time: allDay ? "" : panel.querySelector('[name="end_time"]').value,
      all_day: allDay,
      track,
    };
  }

  function openEditor(form) {
    selectedId = form.id || null;
    moveModeId = null;
    const panel = root.querySelector("[data-cms-caldev-editor]");
    const empty = root.querySelector("[data-cms-caldev-editor-empty]");
    if (!panel || !empty) return;
    empty.hidden = true;
    panel.hidden = false;
    panel.dataset.eventId = form.id ? String(form.id) : "";
    panel.querySelector('[name="title"]').value = form.title || "";
    panel.querySelector('[name="description"]').value = form.description || "";
    panel.querySelector('[name="location"]').value = form.location || "";
    panel.querySelector('[name="who"]').value = form.who || "";
    panel.querySelector('[name="start_date"]').value = form.start_date || "";
    panel.querySelector('[name="end_date"]').value = form.end_date || "";
    panel.querySelector('[name="start_time"]').value = form.start_time || "16:00";
    panel.querySelector('[name="end_time"]').value = form.end_time || "18:00";
    panel.querySelector('[name="all_day"]').checked = !!form.all_day;
    panel.querySelector('[name="track"]').value = form.track || "other";
    panel.querySelector("[data-cms-caldev-editor-title]").textContent = form.id ? "Edit event" : "New event";
    panel.querySelector("[data-cms-caldev-delete]").hidden = !form.id;
    panel.querySelector("[data-cms-caldev-move-btn]").hidden = !form.id || !isCompact();
    toggleTimeFields();
    panel.classList.add("is-open");
    if (isCompact()) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function closeEditor() {
    selectedId = null;
    moveModeId = null;
    const panel = root.querySelector("[data-cms-caldev-editor]");
    const empty = root.querySelector("[data-cms-caldev-editor-empty]");
    if (panel) {
      panel.hidden = true;
      panel.classList.remove("is-open");
      panel.dataset.eventId = "";
    }
    if (empty) empty.hidden = false;
    renderBoardOnly();
  }

  function toggleTimeFields() {
    const panel = root.querySelector("[data-cms-caldev-editor]");
    if (!panel) return;
    const on = panel.querySelector('[name="all_day"]').checked;
    panel.querySelectorAll("[data-cms-caldev-time-field]").forEach((el) => {
      el.hidden = on;
    });
  }

  async function saveEditor(ev) {
    ev.preventDefault();
    if (saveBusy) return;
    const payload = formFromDom();
    if (!payload || !payload.title) {
      showToast("Title is required", true);
      return;
    }
    saveBusy = true;
    try {
      if (payload.id) {
        const saved = await updateEvent(payload.id, payload);
        const idx = events.findIndex((e) => String(e.id) === String(payload.id));
        if (idx >= 0) events[idx] = saved;
        else events.push(saved);
        selectedId = saved.id;
        showToast("Event saved");
      } else {
        const created = await createEvent(payload);
        events.push(created);
        selectedId = created.id;
        showToast("Event created");
      }
      const current = events.find((e) => String(e.id) === String(selectedId));
      if (current) openEditor(eventToForm(current));
      renderBoardOnly();
    } catch (err) {
      showToast(err.message || "Save failed", true);
    } finally {
      saveBusy = false;
    }
  }

  async function removeSelected() {
    const panel = root.querySelector("[data-cms-caldev-editor]");
    const id = panel?.dataset.eventId;
    if (!id) return;
    if (!window.confirm("Delete this Schedule Board event? The live calendar is not affected.")) return;
    try {
      await deleteEvent(id);
      events = events.filter((e) => String(e.id) !== String(id));
      closeEditor();
      showToast("Event deleted");
      renderBoardOnly();
    } catch (err) {
      showToast(err.message || "Delete failed", true);
    }
  }

  function renderShell() {
    root.innerHTML = `
      <div class="cms-caldev" data-cms-caldev-app>
        <div class="cms-caldev-toast" data-cms-caldev-toast hidden></div>
        <div class="cms-caldev-toolbar">
          <div class="cms-caldev-nav">
            <button type="button" class="btn outline cms-caldev-icon-btn" data-cms-caldev-prev aria-label="Previous">‹</button>
            <button type="button" class="btn outline" data-cms-caldev-today>Today</button>
            <button type="button" class="btn outline cms-caldev-icon-btn" data-cms-caldev-next aria-label="Next">›</button>
            <h3 class="cms-caldev-title" data-cms-caldev-title></h3>
          </div>
          <div class="cms-caldev-actions">
            <div class="cms-caldev-seg" role="group" aria-label="View">
              <button type="button" data-cms-caldev-view="month">Month</button>
              <button type="button" data-cms-caldev-view="week">Week</button>
              <button type="button" data-cms-caldev-view="list">Rundown</button>
            </div>
            <button type="button" class="btn primary" data-cms-caldev-new>+ New event</button>
          </div>
        </div>
        <div class="cms-caldev-hint" data-cms-caldev-hint></div>
        <div class="cms-caldev-tracks" data-cms-caldev-tracks></div>
        <div class="cms-caldev-layout">
          <div class="cms-caldev-main" data-cms-caldev-main></div>
          <aside class="cms-caldev-side">
            <div class="cms-caldev-editor-empty" data-cms-caldev-editor-empty>
              <strong>Easy edit</strong>
              <p>Click an event to edit. On desktop, drag to another day. On mobile, tap Move, then tap a day.</p>
            </div>
            <form class="cms-caldev-editor" data-cms-caldev-editor hidden>
              <div class="cms-caldev-editor-head">
                <h4 data-cms-caldev-editor-title>Edit event</h4>
                <button type="button" class="btn outline cms-caldev-icon-btn" data-cms-caldev-close aria-label="Close">×</button>
              </div>
              <label>Title<input name="title" required maxlength="200" /></label>
              <label>Start date<input name="start_date" type="date" required /></label>
              <label>End date <span class="cms-caldev-optional">(optional)</span><input name="end_date" type="date" /></label>
              <label class="cms-caldev-check"><input name="all_day" type="checkbox" /> All day</label>
              <div class="cms-caldev-time-row" data-cms-caldev-time-field>
                <label>Start<input name="start_time" type="time" /></label>
                <label>End<input name="end_time" type="time" /></label>
              </div>
              <label>Track
                <select name="track">
                  ${TRACKS.map((t) => `<option value="${t.id}">${escapeHtml(t.label)}</option>`).join("")}
                </select>
              </label>
              <label>Who<input name="who" maxlength="200" /></label>
              <label>Location<input name="location" maxlength="200" /></label>
              <label>Details<textarea name="description" rows="4" maxlength="4000"></textarea></label>
              <div class="cms-caldev-editor-actions">
                <button type="submit" class="btn primary">Save</button>
                <button type="button" class="btn outline" data-cms-caldev-move-btn hidden>Move</button>
                <button type="button" class="btn outline cms-caldev-danger" data-cms-caldev-delete hidden>Delete</button>
              </div>
            </form>
            <div class="cms-caldev-undated" data-cms-caldev-undated></div>
          </aside>
        </div>
      </div>
    `;
  }

  function renderTracks() {
    const wrap = root.querySelector("[data-cms-caldev-tracks]");
    if (!wrap) return;
    wrap.innerHTML = TRACKS.map((t) => {
      const on = activeTracks.has(t.id);
      return `<button type="button" class="cms-caldev-track ${on ? "is-on" : ""}" data-cms-caldev-track="${t.id}" style="--track:${t.color}">
        <span class="cms-caldev-swatch"></span>${escapeHtml(t.label)}
      </button>`;
    }).join("");
  }

  function renderHint() {
    const el = root.querySelector("[data-cms-caldev-hint]");
    if (!el) return;
    if (moveModeId) {
      el.hidden = false;
      el.innerHTML = `<strong>Tap a day</strong> to move the event. <button type="button" class="btn outline" data-cms-caldev-cancel-move>Cancel</button>`;
      return;
    }
    el.hidden = false;
    el.textContent = isCompact()
      ? "Tap an event to edit. Use Move, then tap a day to reschedule."
      : "Drag events onto another day to reschedule. Click an event or empty day to edit.";
  }

  function renderUndated() {
    const wrap = root.querySelector("[data-cms-caldev-undated]");
    if (!wrap) return;
    const list = undatedEvents();
    if (!list.length) {
      wrap.innerHTML = "";
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    wrap.innerHTML = `<h4>Needs a date</h4>
      ${list.map((ev) => {
        const meta = trackMeta(ev.track);
        return `<button type="button" class="cms-caldev-undated-item ${String(selectedId) === String(ev.id) ? "is-selected" : ""} ${String(moveModeId) === String(ev.id) ? "is-moving" : ""}"
          data-cms-caldev-event="${escapeHtml(ev.id)}"
          draggable="${isCompact() ? "false" : "true"}"
          style="--track:${meta.color}">
          <strong>${escapeHtml(ev.title)}</strong>
          <span>${escapeHtml(meta.label)}</span>
        </button>`;
      }).join("")}`;
  }

  function eventChipHtml(ev) {
    const meta = trackMeta(ev.track);
    const time = eventTimeLabel(ev);
    const selected = String(selectedId) === String(ev.id);
    const moving = String(moveModeId) === String(ev.id);
    const draggable = !isCompact();
    return `<button type="button"
      class="cms-caldev-chip ${selected ? "is-selected" : ""} ${moving ? "is-moving" : ""}"
      data-cms-caldev-event="${escapeHtml(ev.id)}"
      draggable="${draggable ? "true" : "false"}"
      style="--track:${meta.color}"
      title="${escapeHtml(ev.title)}">
      <span class="cms-caldev-chip-time">${escapeHtml(time)}</span>
      <span class="cms-caldev-chip-title">${escapeHtml(ev.title)}</span>
    </button>`;
  }

  function bindDropTarget(el, dateKey) {
    el.addEventListener("dragover", (e) => {
      if (!draggingId || isCompact()) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      el.classList.add("is-drop-target");
    });
    el.addEventListener("dragleave", () => {
      el.classList.remove("is-drop-target");
    });
    el.addEventListener("drop", async (e) => {
      e.preventDefault();
      el.classList.remove("is-drop-target");
      const id = e.dataTransfer.getData("text/caldev-id") || draggingId;
      draggingId = null;
      if (!id) return;
      await persistMove(id, dateKey);
    });
    if (moveModeId) {
      el.classList.add("is-move-target");
      el.addEventListener("click", async (e) => {
        if (e.target.closest("[data-cms-caldev-event]")) return;
        e.preventDefault();
        e.stopPropagation();
        const id = moveModeId;
        await persistMove(id, dateKey);
      });
    }
  }

  function renderMonth() {
    const start = startOfWeek(startOfMonth(cursor));
    const weeks = [];
    let day = new Date(start);
    for (let w = 0; w < 6; w += 1) {
      const row = [];
      for (let i = 0; i < 7; i += 1) {
        row.push(new Date(day));
        day = addDays(day, 1);
      }
      weeks.push(row);
      if (day.getMonth() !== cursor.getMonth() && w >= 3) break;
    }
    const maxChips = isCompact() ? 3 : 4;
    return `<div class="cms-caldev-month">
      <div class="cms-caldev-dow">${DOW.map((d) => `<div>${d}</div>`).join("")}</div>
      <div class="cms-caldev-grid">
        ${weeks
          .map((week) =>
            week
              .map((d) => {
                const key = toDateKey(d);
                const inMonth = d.getMonth() === cursor.getMonth();
                const dayEvents = eventsForDay(key);
                const extra = Math.max(0, dayEvents.length - maxChips);
                return `<div class="cms-caldev-cell ${inMonth ? "" : "is-out"} ${isToday(d) ? "is-today" : ""} ${moveModeId ? "is-move-target" : ""}"
                  data-cms-caldev-day="${key}">
                  <div class="cms-caldev-cell-head">
                    <button type="button" class="cms-caldev-daynum" data-cms-caldev-new-day="${key}">${d.getDate()}</button>
                    <button type="button" class="cms-caldev-add" data-cms-caldev-new-day="${key}" aria-label="Add event">+</button>
                  </div>
                  <div class="cms-caldev-cell-events">
                    ${dayEvents.slice(0, maxChips).map((ev) => eventChipHtml(ev)).join("")}
                    ${extra ? `<div class="cms-caldev-more">+${extra} more</div>` : ""}
                  </div>
                </div>`;
              })
              .join("")
          )
          .join("")}
      </div>
    </div>`;
  }

  function renderWeek() {
    const start = startOfWeek(cursor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return `<div class="cms-caldev-week">
      ${days
        .map((d) => {
          const key = toDateKey(d);
          const dayEvents = eventsForDay(key);
          return `<section class="cms-caldev-week-col ${isToday(d) ? "is-today" : ""} ${moveModeId ? "is-move-target" : ""}" data-cms-caldev-day="${key}">
            <header>
              <span>${DOW[d.getDay()]}</span>
              <strong>${d.getDate()}</strong>
              <button type="button" class="cms-caldev-add" data-cms-caldev-new-day="${key}" aria-label="Add event">+</button>
            </header>
            <div class="cms-caldev-week-events">
              ${dayEvents.length
                ? dayEvents.map((ev) => eventChipHtml(ev)).join("")
                : `<button type="button" class="cms-caldev-ghost-add" data-cms-caldev-new-day="${key}">+ Add</button>`}
            </div>
          </section>`;
        })
        .join("")}
    </div>`;
  }

  function renderList() {
    const monthStart = toDateKey(startOfMonth(cursor));
    const monthEnd = toDateKey(addDays(addMonths(cursor, 1), -1));
    const list = filteredEvents().filter((ev) => {
      const key = eventDayKey(ev);
      return key && key >= monthStart && key <= monthEnd;
    });
    if (!list.length) {
      return `<div class="cms-caldev-empty">No events this month for the selected tracks.</div>`;
    }
    const groups = new Map();
    list.forEach((ev) => {
      const key = eventDayKey(ev);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(ev);
    });
    return `<div class="cms-caldev-list">
      ${[...groups.entries()]
        .map(([key, dayEvents]) => {
          const d = parseDateKey(key);
          return `<section class="cms-caldev-list-day ${moveModeId ? "is-move-target" : ""}" data-cms-caldev-day="${key}">
            <header>
              <div>
                <strong>${DOW_FULL[d.getDay()]}</strong>
                <span>${MONTHS[d.getMonth()]} ${d.getDate()}</span>
              </div>
              <button type="button" class="btn outline" data-cms-caldev-new-day="${key}">Add</button>
            </header>
            ${dayEvents
              .map((ev) => {
                const meta = trackMeta(ev.track);
                return `<button type="button" class="cms-caldev-list-item ${String(selectedId) === String(ev.id) ? "is-selected" : ""} ${String(moveModeId) === String(ev.id) ? "is-moving" : ""}"
                  data-cms-caldev-event="${escapeHtml(ev.id)}"
                  draggable="${isCompact() ? "false" : "true"}"
                  style="--track:${meta.color}">
                  <div class="cms-caldev-list-time">${escapeHtml(eventTimeLabel(ev))}</div>
                  <div>
                    <strong>${escapeHtml(ev.title)}</strong>
                    <div class="cms-caldev-list-meta">${escapeHtml(meta.label)}${ev.location ? ` · ${escapeHtml(ev.location)}` : ""}</div>
                  </div>
                </button>`;
              })
              .join("")}
          </section>`;
        })
        .join("")}
    </div>`;
  }

  function renderBoardOnly() {
    const title = root.querySelector("[data-cms-caldev-title]");
    if (title) title.textContent = titleForView();
    root.querySelectorAll("[data-cms-caldev-view]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-cms-caldev-view") === view);
    });
    renderTracks();
    renderHint();
    renderUndated();
    const main = root.querySelector("[data-cms-caldev-main]");
    if (!main) return;
    if (view === "week") main.innerHTML = renderWeek();
    else if (view === "list") main.innerHTML = renderList();
    else main.innerHTML = renderMonth();

    main.querySelectorAll("[data-cms-caldev-day]").forEach((el) => {
      bindDropTarget(el, el.getAttribute("data-cms-caldev-day"));
    });

    const moveBtn = root.querySelector("[data-cms-caldev-move-btn]");
    if (moveBtn) moveBtn.hidden = !selectedId || !isCompact();
  }

  function render() {
    renderBoardOnly();
  }

  function onDragStart(e) {
    if (isCompact()) return;
    const btn = e.target.closest("[data-cms-caldev-event]");
    if (!btn || !root.contains(btn)) return;
    draggingId = btn.getAttribute("data-cms-caldev-event");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/caldev-id", draggingId);
    e.dataTransfer.setData("text/plain", draggingId);
    btn.classList.add("is-dragging");
  }

  function onDragEnd(e) {
    const btn = e.target.closest("[data-cms-caldev-event]");
    if (btn) btn.classList.remove("is-dragging");
    draggingId = null;
    root.querySelectorAll(".is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
  }

  function bind() {
    if (bound) return;
    bound = true;

    root.addEventListener("click", (e) => {
      const trackBtn = e.target.closest("[data-cms-caldev-track]");
      if (trackBtn && root.contains(trackBtn)) {
        const id = trackBtn.getAttribute("data-cms-caldev-track");
        if (activeTracks.has(id)) {
          if (activeTracks.size > 1) activeTracks.delete(id);
        } else activeTracks.add(id);
        render();
        return;
      }

      if (e.target.closest("[data-cms-caldev-cancel-move]")) {
        moveModeId = null;
        render();
        return;
      }

      if (e.target.closest("[data-cms-caldev-prev]")) {
        cursor = view === "week" ? addDays(cursor, -7) : addMonths(cursor, -1);
        render();
        return;
      }
      if (e.target.closest("[data-cms-caldev-next]")) {
        cursor = view === "week" ? addDays(cursor, 7) : addMonths(cursor, 1);
        render();
        return;
      }
      if (e.target.closest("[data-cms-caldev-today]")) {
        cursor = view === "week" ? new Date() : startOfMonth(new Date());
        render();
        return;
      }

      const viewBtn = e.target.closest("[data-cms-caldev-view]");
      if (viewBtn && root.contains(viewBtn)) {
        view = viewBtn.getAttribute("data-cms-caldev-view");
        render();
        return;
      }

      if (e.target.closest("[data-cms-caldev-new]")) {
        openEditor(blankForm(toDateKey(new Date())));
        renderBoardOnly();
        return;
      }

      const newDay = e.target.closest("[data-cms-caldev-new-day]");
      if (newDay && root.contains(newDay) && !moveModeId) {
        openEditor(blankForm(newDay.getAttribute("data-cms-caldev-new-day")));
        renderBoardOnly();
        return;
      }

      if (e.target.closest("[data-cms-caldev-close]")) {
        closeEditor();
        return;
      }
      if (e.target.closest("[data-cms-caldev-delete]")) {
        removeSelected();
        return;
      }
      if (e.target.closest("[data-cms-caldev-move-btn]")) {
        const panel = root.querySelector("[data-cms-caldev-editor]");
        moveModeId = panel?.dataset.eventId || null;
        if (isCompact() && panel) panel.classList.remove("is-open");
        render();
        showToast("Tap a day to move this event");
        return;
      }

      const evBtn = e.target.closest("[data-cms-caldev-event]");
      if (evBtn && root.contains(evBtn)) {
        if (moveModeId) return;
        const ev = events.find((x) => String(x.id) === String(evBtn.getAttribute("data-cms-caldev-event")));
        if (ev) {
          openEditor(eventToForm(ev));
          renderBoardOnly();
        }
      }
    });

    root.addEventListener("change", (e) => {
      if (e.target.matches('[name="all_day"]')) toggleTimeFields();
    });

    root.addEventListener("submit", (e) => {
      if (e.target.matches("[data-cms-caldev-editor]")) saveEditor(e);
    });

    root.addEventListener("dragstart", onDragStart);
    root.addEventListener("dragend", onDragEnd);

    window.addEventListener("resize", () => {
      if (!root?.isConnected) return;
      renderBoardOnly();
    });
  }

  async function mount(el) {
    if (!el) return;
    root = el;
    if (!mounted) {
      renderShell();
      bind();
      mounted = true;
    }
    try {
      await loadEvents();
      render();
    } catch (err) {
      showToast(err.message || "Could not load Schedule Board", true);
      render();
    }
  }

  async function reload() {
    if (!root) return;
    try {
      await loadEvents();
      render();
    } catch (err) {
      showToast(err.message || "Could not refresh Schedule Board", true);
    }
  }

  window.CaldevCmsBoard = { mount, reload };
})();
