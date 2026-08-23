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
  const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  let root = null;
  let events = [];
  let view = "month";
  let cursor = startOfMonth(new Date());
  let activeTracks = new Set(TRACKS.map((t) => t.id));
  let selectedId = null;
  let draggingId = null;
  let toastTimer = null;
  let saveBusy = false;
  let bound = false;
  let mounted = false;
  let exceptionDates = [];
  let lastTap = { id: null, at: 0 };
  let longPress = { timer: null, id: null, active: false, startX: 0, startY: 0 };

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
  function yearOptions() {
    const nowY = new Date().getFullYear();
    const cursorY = cursor.getFullYear();
    const start = Math.min(nowY - 3, cursorY);
    const end = Math.max(nowY + 2, cursorY);
    const years = [];
    for (let y = start; y <= end; y += 1) years.push(y);
    return years;
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
    if (eventDayKey(current) === targetDateKey) {
      renderBoardOnly();
      return;
    }
    const next = shiftEventToDate(current, targetDateKey);
    const idx = events.findIndex((e) => String(e.id) === String(id));
    if (idx >= 0) events[idx] = { ...events[idx], ...next };
    selectedId = id;
    render();
    try {
      const saved = await updateEvent(id, payloadFromEvent(next));
      const i = events.findIndex((e) => String(e.id) === String(id));
      if (i >= 0) events[i] = saved;
      showToast("Event rescheduled");
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
      start_time: "",
      end_time: "",
      all_day: true,
      track: "rehearsal",
      repeat: false,
      repeat_days: [],
      repeat_months: [],
      repeat_exceptions: [],
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
      start_time: ev.start_time || "",
      end_time: ev.end_time || "",
      all_day: !!Number(ev.all_day) || !ev.start_time,
      track: ev.track || "other",
      repeat: false,
      repeat_days: [],
      repeat_months: [],
      repeat_exceptions: [],
    };
  }

  function expandRepeatDates(startDate, days, months, exceptions, year) {
    const daySet = new Set((days || []).map(Number));
    const monthSet = new Set((months || []).map(Number));
    const skip = new Set((exceptions || []).map(String));
    if (!daySet.size || !monthSet.size) return [startDate].filter(Boolean);
    const out = [];
    for (const month of [...monthSet].sort((a, b) => a - b)) {
      const dim = new Date(year, month, 0).getDate();
      for (let day = 1; day <= dim; day += 1) {
        const d = new Date(year, month - 1, day);
        if (!daySet.has(d.getDay())) continue;
        const key = toDateKey(d);
        if (skip.has(key)) continue;
        out.push(key);
      }
    }
    return out.length ? out : [startDate].filter(Boolean);
  }

  function sanitizeDescHtml(html) {
    const allowed = /^(?:#text|B|STRONG|I|EM|U|BR|SPAN|DIV|P)$/i;
    const wrap = document.createElement("div");
    wrap.innerHTML = String(html || "");
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) return;
        if (child.nodeType !== 1 || !allowed.test(child.tagName)) {
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
          return;
        }
        if (child.tagName === "SPAN") {
          const color = String(child.style.color || "").trim();
          const size = String(child.style.fontSize || "").trim();
          child.removeAttribute("style");
          child.removeAttribute("class");
          const styles = [];
          if (color) styles.push(`color:${color}`);
          if (size) styles.push(`font-size:${size}`);
          if (styles.length) child.setAttribute("style", styles.join(";"));
          else {
            while (child.firstChild) node.insertBefore(child.firstChild, child);
            node.removeChild(child);
            return;
          }
        } else {
          child.removeAttribute("style");
          child.removeAttribute("class");
        }
        walk(child);
      });
    };
    walk(wrap);
    return wrap.innerHTML.trim();
  }

  function formFromDom() {
    const panel = root.querySelector("[data-cms-caldev-editor]");
    if (!panel) return null;
    const allDay = panel.querySelector('[name="all_day"]').checked;
    const repeat = panel.querySelector('[name="repeat_yes"]').checked;
    const track = panel.querySelector('[name="track"]').value || "other";
    const desc = sanitizeDescHtml(panel.querySelector("[data-cms-caldev-desc]")?.innerHTML || "");
    return {
      id: panel.dataset.eventId || null,
      title: panel.querySelector('[name="title"]').value.trim(),
      description: desc,
      location: panel.querySelector('[name="location"]').value.trim(),
      who: panel.dataset.who || "",
      start_date: panel.querySelector('[name="start_date"]').value,
      end_date: panel.querySelector('[name="end_date"]').value,
      start_time: allDay ? "" : panel.querySelector('[name="start_time"]').value,
      end_time: allDay ? "" : panel.querySelector('[name="end_time"]').value,
      all_day: allDay,
      track,
      repeat,
      repeat_days: [...panel.querySelectorAll('input[name="repeat_day"]:checked')].map((el) => Number(el.value)),
      repeat_months: [...panel.querySelectorAll('input[name="repeat_month"]:checked')].map((el) => Number(el.value)),
      repeat_exceptions: [...exceptionDates],
    };
  }

  function renderExceptions() {
    const list = root.querySelector("[data-cms-caldev-exceptions]");
    if (!list) return;
    const dates = [...exceptionDates].sort();
    list.innerHTML = dates.length
      ? dates.map((date) => `<li><span>${escapeHtml(date)}</span><button type="button" data-cms-caldev-remove-exception="${escapeHtml(date)}">Remove</button></li>`).join("")
      : '<li class="draft">No skipped dates yet.</li>';
  }

  function syncRepeatUi() {
    const panel = root.querySelector("[data-cms-caldev-editor]");
    if (!panel) return;
    const on = panel.querySelector('[name="repeat_yes"]').checked;
    const options = panel.querySelector("[data-cms-caldev-repeat-options]");
    if (options) options.hidden = !on;
    panel.querySelector('[name="repeat_no"]').checked = !on;
  }

  function toggleTimeFields() {
    const panel = root.querySelector("[data-cms-caldev-editor]");
    if (!panel) return;
    const on = panel.querySelector('[name="all_day"]').checked;
    panel.querySelectorAll("[data-cms-caldev-time-field]").forEach((el) => {
      el.hidden = on;
    });
  }

  function openEditor(form) {
    selectedId = form.id || null;
    exceptionDates = Array.isArray(form.repeat_exceptions) ? [...form.repeat_exceptions] : [];
    const overlay = root.querySelector("[data-cms-caldev-editor-overlay]");
    const panel = root.querySelector("[data-cms-caldev-editor]");
    if (!overlay || !panel) return;
    overlay.hidden = false;
    panel.hidden = false;
    panel.dataset.eventId = form.id ? String(form.id) : "";
    panel.querySelector("[data-cms-caldev-editor-title]").textContent = form.id ? "Edit Event" : "Create Event";
    panel.querySelector('[name="title"]').value = form.title || "";
    panel.querySelector('[name="start_date"]').value = form.start_date || "";
    panel.querySelector('[name="end_date"]').value = form.end_date || "";
    panel.querySelector('[name="start_time"]').value = form.start_time || "16:00";
    panel.querySelector('[name="end_time"]').value = form.end_time || "18:00";
    panel.querySelector('[name="all_day"]').checked = !!form.all_day;
    panel.querySelector('[name="track"]').value = form.track || "other";
    panel.dataset.who = form.who || "";
    panel.querySelector('[name="location"]').value = form.location || "";
    panel.querySelector("[data-cms-caldev-desc]").innerHTML = form.description || "";
    panel.querySelector('[name="repeat_yes"]').checked = !!form.repeat;
    panel.querySelector('[name="repeat_no"]').checked = !form.repeat;
    const yesRadio = panel.querySelector('[data-cms-caldev-repeat-yes]');
    const noRadio = panel.querySelector('[data-cms-caldev-repeat-no]');
    if (yesRadio) yesRadio.checked = !!form.repeat;
    if (noRadio) noRadio.checked = !form.repeat;
    const daySet = new Set((form.repeat_days || []).map(Number));
    panel.querySelectorAll('input[name="repeat_day"]').forEach((input) => {
      input.checked = daySet.has(Number(input.value));
    });
    const monthSet = new Set((form.repeat_months || []).map(Number));
    panel.querySelectorAll('input[name="repeat_month"]').forEach((input) => {
      input.checked = monthSet.has(Number(input.value));
    });
    panel.querySelector("[data-cms-caldev-delete]").hidden = !form.id;
    panel.querySelector("[data-cms-caldev-repeat-wrap]").hidden = !!form.id;
    syncRepeatUi();
    toggleTimeFields();
    renderExceptions();
    document.body.classList.add("cms-caldev-editor-open");
    renderBoardOnly();
    setTimeout(() => panel.querySelector('[name="title"]')?.focus(), 30);
  }

  function closeEditor() {
    const overlay = root.querySelector("[data-cms-caldev-editor-overlay]");
    const panel = root.querySelector("[data-cms-caldev-editor]");
    if (overlay) overlay.hidden = true;
    if (panel) {
      panel.hidden = true;
      panel.dataset.eventId = "";
    }
    document.body.classList.remove("cms-caldev-editor-open");
    renderBoardOnly();
  }

  async function saveEditor(ev) {
    ev.preventDefault();
    if (saveBusy) return;
    const payload = formFromDom();
    if (!payload || !payload.title) {
      showToast("Title is required", true);
      return;
    }
    if (!payload.start_date && !payload.repeat) {
      showToast("Date is required", true);
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
      } else if (payload.repeat) {
        const year = payload.start_date
          ? Number(String(payload.start_date).slice(0, 4))
          : cursor.getFullYear();
        const dates = expandRepeatDates(
          payload.start_date,
          payload.repeat_days,
          payload.repeat_months,
          payload.repeat_exceptions,
          year,
        );
        if (!dates.length) {
          showToast("Choose at least one weekday and month for repeats", true);
          return;
        }
        let createdCount = 0;
        let last = null;
        for (const dateKey of dates) {
          last = await createEvent({
            ...payload,
            start_date: dateKey,
            end_date: "",
          });
          events.push(last);
          createdCount += 1;
        }
        selectedId = last?.id || null;
        showToast(`Created ${createdCount} repeated event${createdCount === 1 ? "" : "s"}`);
      } else {
        const created = await createEvent(payload);
        events.push(created);
        selectedId = created.id;
        showToast("Event created");
      }
      closeEditor();
      render();
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
      selectedId = null;
      closeEditor();
      showToast("Event deleted");
      render();
    } catch (err) {
      showToast(err.message || "Delete failed", true);
    }
  }

  function applyDescCommand(cmd, value) {
    const editor = root.querySelector("[data-cms-caldev-desc]");
    if (!editor) return;
    editor.focus();
    if (cmd === "foreColor" || cmd === "fontSize") {
      document.execCommand(cmd === "fontSize" ? "fontSize" : "foreColor", false, cmd === "fontSize" ? "3" : value);
      if (cmd === "fontSize") {
        editor.querySelectorAll('font[size="3"]').forEach((node) => {
          const span = document.createElement("span");
          span.style.fontSize = value;
          while (node.firstChild) span.appendChild(node.firstChild);
          node.replaceWith(span);
        });
      }
      return;
    }
    document.execCommand(cmd, false, null);
  }

  function renderShell() {
    root.innerHTML = `
      <div class="cms-caldev" data-cms-caldev-app>
        <div class="cms-caldev-toast" data-cms-caldev-toast hidden></div>
        <div class="cms-caldev-toolbar">
          <div class="cms-caldev-range" role="group" aria-label="Month and year">
            <label class="cms-caldev-range-field">
              <span class="sr-only">Month</span>
              <select data-cms-caldev-month aria-label="Month">
                ${MONTHS.map((label, idx) => `<option value="${idx}">${label}</option>`).join("")}
              </select>
            </label>
            <label class="cms-caldev-range-field">
              <span class="sr-only">Year</span>
              <select data-cms-caldev-year aria-label="Year"></select>
            </label>
          </div>
          <div class="cms-caldev-actions">
            <button type="button" class="btn primary" data-cms-caldev-new>+ New event</button>
          </div>
        </div>
        <div class="cms-caldev-hint" data-cms-caldev-hint></div>
        <div class="cms-caldev-tracks" data-cms-caldev-tracks></div>
        <div class="cms-caldev-layout cms-caldev-layout-solo">
          <div class="cms-caldev-main" data-cms-caldev-main></div>
        </div>
        <div class="cms-caldev-undated" data-cms-caldev-undated></div>

        <div class="cms-caldev-editor-overlay" data-cms-caldev-editor-overlay hidden>
          <button type="button" class="cms-caldev-editor-backdrop" data-cms-caldev-close aria-label="Close editor"></button>
          <form class="cms-caldev-editor-toast" data-cms-caldev-editor hidden>
            <div class="cms-caldev-editor-head">
              <h4 data-cms-caldev-editor-title>Create Event</h4>
              <button type="button" class="cms-caldev-close-btn" data-cms-caldev-close>Close</button>
            </div>

            <label class="cms-caldev-title-field">Title
              <input name="title" required maxlength="200" placeholder="Event title" />
            </label>

            <label>Date
              <input name="start_date" type="date" required />
            </label>
            <label>End date <span class="cms-caldev-optional">(optional)</span>
              <input name="end_date" type="date" />
            </label>

            <fieldset class="cms-caldev-repeat" data-cms-caldev-repeat-wrap>
              <legend>Repeat</legend>
              <div class="cms-caldev-repeat-toggle">
                <label class="cms-caldev-check"><input type="radio" name="repeat_choice" value="yes" data-cms-caldev-repeat-yes> <span>Yes</span></label>
                <label class="cms-caldev-check"><input type="radio" name="repeat_choice" value="no" checked data-cms-caldev-repeat-no> <span>No</span></label>
                <input type="checkbox" name="repeat_yes" hidden>
                <input type="checkbox" name="repeat_no" checked hidden>
              </div>
              <div class="cms-caldev-repeat-options" data-cms-caldev-repeat-options hidden>
                <p class="muted">Creates one Schedule Board event for each matching weekday in the selected months. Exceptions skip specific dates.</p>
                <div class="cms-caldev-repeat-grid">
                  <div>
                    <p class="cms-caldev-repeat-heading">Days</p>
                    <div class="cms-caldev-repeat-checks">
                      ${DOW.map((label, idx) => `<label class="cms-caldev-check"><input type="checkbox" name="repeat_day" value="${idx}"> ${label}</label>`).join("")}
                    </div>
                  </div>
                  <div>
                    <p class="cms-caldev-repeat-heading">Months</p>
                    <div class="cms-caldev-repeat-checks">
                      ${MONTH_SHORT.map((label, idx) => `<label class="cms-caldev-check"><input type="checkbox" name="repeat_month" value="${idx + 1}"> ${label}</label>`).join("")}
                    </div>
                  </div>
                </div>
                <label>Skip date
                  <span class="cms-caldev-exception-row">
                    <input type="date" data-cms-caldev-exception-input>
                    <button type="button" class="btn outline" data-cms-caldev-add-exception>Add exception</button>
                  </span>
                </label>
                <ul class="cms-caldev-exceptions" data-cms-caldev-exceptions></ul>
              </div>
            </fieldset>

            <label class="cms-caldev-check"><input name="all_day" type="checkbox" checked> All day</label>
            <div class="cms-caldev-time-row" data-cms-caldev-time-field hidden>
              <label>Start<input name="start_time" type="time" /></label>
              <label>End<input name="end_time" type="time" /></label>
            </div>

            <label>Who
              <select name="track">
                ${TRACKS.map((t) => `<option value="${t.id}">${escapeHtml(t.label)}</option>`).join("")}
              </select>
            </label>
            <label>Location<input name="location" maxlength="200" /></label>

            <label class="cms-caldev-desc-label">Description
              <div class="cms-caldev-desc-toolbar" data-cms-caldev-desc-toolbar>
                <button type="button" data-cms-caldev-desc-cmd="bold" title="Bold"><b>B</b></button>
                <button type="button" data-cms-caldev-desc-cmd="italic" title="Italic"><i>I</i></button>
                <button type="button" data-cms-caldev-desc-cmd="underline" title="Underline"><u>U</u></button>
                <label title="Color"><span>Color</span><input type="color" data-cms-caldev-desc-color value="#002142"></label>
                <label title="Size"><span>Size</span>
                  <select data-cms-caldev-desc-size>
                    <option value="">Normal</option>
                    <option value="14px">Small</option>
                    <option value="18px">Medium</option>
                    <option value="22px">Large</option>
                    <option value="28px">Extra large</option>
                  </select>
                </label>
              </div>
              <div class="cms-caldev-desc" contenteditable="true" role="textbox" aria-multiline="true" data-cms-caldev-desc data-placeholder="Event details"></div>
            </label>

            <div class="cms-caldev-editor-actions">
              <button type="submit" class="btn primary">Save</button>
              <button type="button" class="btn outline" data-cms-caldev-close>Cancel</button>
              <button type="button" class="btn outline cms-caldev-danger" data-cms-caldev-delete hidden>Delete</button>
            </div>
          </form>
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
    el.hidden = false;
    el.textContent = isCompact()
      ? "Tap once to select. Double-tap to edit. Press and hold, then drag to reschedule. Use + to add."
      : "Click once to select. Double-click to edit. Drag to reschedule. Use + to add an event.";
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
        return `<button type="button" class="cms-caldev-undated-item ${String(selectedId) === String(ev.id) ? "is-selected" : ""}"
          data-cms-caldev-event="${escapeHtml(ev.id)}"
          draggable="true"
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
    return `<button type="button"
      class="cms-caldev-chip ${selected ? "is-selected" : ""}"
      data-cms-caldev-event="${escapeHtml(ev.id)}"
      draggable="true"
      style="--track:${meta.color}"
      title="${escapeHtml(ev.title)}">
      <span class="cms-caldev-chip-time">${escapeHtml(time)}</span>
      <span class="cms-caldev-chip-title">${escapeHtml(ev.title)}</span>
    </button>`;
  }

  function bindDropTarget(el, dateKey) {
    el.addEventListener("dragover", (e) => {
      if (!draggingId) return;
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
                return `<div class="cms-caldev-cell ${inMonth ? "" : "is-out"} ${isToday(d) ? "is-today" : ""}"
                  data-cms-caldev-day="${key}">
                  <div class="cms-caldev-cell-head">
                    <span class="cms-caldev-daynum">${d.getDate()}</span>
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
          return `<section class="cms-caldev-week-col ${isToday(d) ? "is-today" : ""}" data-cms-caldev-day="${key}">
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
          return `<section class="cms-caldev-list-day" data-cms-caldev-day="${key}">
            <header>
              <div>
                <strong>${DOW_FULL[d.getDay()]}</strong>
                <span>${MONTHS[d.getMonth()]} ${d.getDate()}</span>
              </div>
              <button type="button" class="btn outline cms-caldev-add-list" data-cms-caldev-new-day="${key}">+</button>
            </header>
            ${dayEvents
              .map((ev) => {
                const meta = trackMeta(ev.track);
                return `<button type="button" class="cms-caldev-list-item ${String(selectedId) === String(ev.id) ? "is-selected" : ""}"
                  data-cms-caldev-event="${escapeHtml(ev.id)}"
                  draggable="true"
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

  function syncRangeSelects() {
    const monthSel = root.querySelector("[data-cms-caldev-month]");
    const yearSel = root.querySelector("[data-cms-caldev-year]");
    if (monthSel) monthSel.value = String(cursor.getMonth());
    if (yearSel) {
      const years = yearOptions();
      const current = String(cursor.getFullYear());
      yearSel.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");
      yearSel.value = current;
    }
  }

  function renderBoardOnly() {
    view = "month";
    syncRangeSelects();
    renderTracks();
    renderHint();
    renderUndated();
    const main = root.querySelector("[data-cms-caldev-main]");
    if (!main) return;
    main.innerHTML = renderMonth();

    main.querySelectorAll("[data-cms-caldev-day]").forEach((el) => {
      bindDropTarget(el, el.getAttribute("data-cms-caldev-day"));
    });
  }

  function render() {
    renderBoardOnly();
  }

  function selectEvent(id) {
    selectedId = id;
    renderBoardOnly();
  }

  function openEventById(id) {
    const ev = events.find((x) => String(x.id) === String(id));
    if (!ev) return;
    openEditor(eventToForm(ev));
  }

  function onDragStart(e) {
    const btn = e.target.closest("[data-cms-caldev-event]");
    if (!btn || !root.contains(btn)) return;
    draggingId = btn.getAttribute("data-cms-caldev-event");
    selectedId = draggingId;
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

  function clearLongPress() {
    if (longPress.timer) clearTimeout(longPress.timer);
    longPress.timer = null;
    longPress.id = null;
    longPress.active = false;
    root?.querySelectorAll(".is-longpress").forEach((el) => el.classList.remove("is-longpress"));
  }

  function dayKeyFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const day = el?.closest?.("[data-cms-caldev-day]");
    return day?.getAttribute("data-cms-caldev-day") || null;
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

      if (e.target.closest("[data-cms-caldev-new]")) {
        openEditor(blankForm(toDateKey(new Date())));
        return;
      }

      const newDay = e.target.closest("[data-cms-caldev-new-day]");
      if (newDay && root.contains(newDay)) {
        e.preventDefault();
        e.stopPropagation();
        openEditor(blankForm(newDay.getAttribute("data-cms-caldev-new-day")));
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
      if (e.target.closest("[data-cms-caldev-add-exception]")) {
        const input = root.querySelector("[data-cms-caldev-exception-input]");
        const value = String(input?.value || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(value) && !exceptionDates.includes(value)) {
          exceptionDates.push(value);
          renderExceptions();
        }
        if (input) input.value = "";
        return;
      }
      const removeEx = e.target.closest("[data-cms-caldev-remove-exception]");
      if (removeEx) {
        exceptionDates = exceptionDates.filter((d) => d !== removeEx.getAttribute("data-cms-caldev-remove-exception"));
        renderExceptions();
        return;
      }

      const descCmd = e.target.closest("[data-cms-caldev-desc-cmd]");
      if (descCmd) {
        e.preventDefault();
        applyDescCommand(descCmd.getAttribute("data-cms-caldev-desc-cmd"));
        return;
      }

      const evBtn = e.target.closest("[data-cms-caldev-event]");
      if (evBtn && root.contains(evBtn)) {
        const id = evBtn.getAttribute("data-cms-caldev-event");
        const now = Date.now();
        const isDouble = lastTap.id === id && (now - lastTap.at) < 350;
        lastTap = { id, at: now };
        if (isDouble) {
          openEventById(id);
          return;
        }
        selectEvent(id);
      }
    });

    root.addEventListener("dblclick", (e) => {
      const evBtn = e.target.closest("[data-cms-caldev-event]");
      if (!evBtn || !root.contains(evBtn)) return;
      e.preventDefault();
      openEventById(evBtn.getAttribute("data-cms-caldev-event"));
    });

    root.addEventListener("change", (e) => {
      if (e.target.matches("[data-cms-caldev-month]") || e.target.matches("[data-cms-caldev-year]")) {
        const monthSel = root.querySelector("[data-cms-caldev-month]");
        const yearSel = root.querySelector("[data-cms-caldev-year]");
        const month = Number(monthSel?.value);
        const year = Number(yearSel?.value);
        if (Number.isFinite(month) && Number.isFinite(year)) {
          cursor = new Date(year, month, 1);
          render();
        }
        return;
      }
      if (e.target.matches('[name="all_day"]')) toggleTimeFields();
      if (e.target.matches("[data-cms-caldev-repeat-yes]")) {
        root.querySelector('[name="repeat_yes"]').checked = true;
        root.querySelector('[name="repeat_no"]').checked = false;
        syncRepeatUi();
      }
      if (e.target.matches("[data-cms-caldev-repeat-no]")) {
        root.querySelector('[name="repeat_yes"]').checked = false;
        root.querySelector('[name="repeat_no"]').checked = true;
        syncRepeatUi();
      }
      if (e.target.matches("[data-cms-caldev-desc-color]")) {
        applyDescCommand("foreColor", e.target.value);
      }
      if (e.target.matches("[data-cms-caldev-desc-size]") && e.target.value) {
        applyDescCommand("fontSize", e.target.value);
        e.target.value = "";
      }
    });

    root.addEventListener("submit", (e) => {
      if (e.target.matches("[data-cms-caldev-editor]")) saveEditor(e);
    });

    root.addEventListener("dragstart", onDragStart);
    root.addEventListener("dragend", onDragEnd);

    root.addEventListener("touchstart", (e) => {
      const btn = e.target.closest("[data-cms-caldev-event]");
      if (!btn || !root.contains(btn)) return;
      const touch = e.touches[0];
      if (!touch) return;
      longPress.id = btn.getAttribute("data-cms-caldev-event");
      longPress.startX = touch.clientX;
      longPress.startY = touch.clientY;
      longPress.active = false;
      longPress.timer = setTimeout(() => {
        longPress.active = true;
        draggingId = longPress.id;
        selectedId = longPress.id;
        btn.classList.add("is-longpress", "is-dragging");
        showToast("Drag to a day to reschedule");
        renderBoardOnly();
      }, 420);
    }, { passive: true });

    root.addEventListener("touchmove", (e) => {
      if (!longPress.id) return;
      const touch = e.touches[0];
      if (!touch) return;
      if (!longPress.active) {
        const dx = Math.abs(touch.clientX - longPress.startX);
        const dy = Math.abs(touch.clientY - longPress.startY);
        if (dx > 12 || dy > 12) clearLongPress();
        return;
      }
      e.preventDefault();
      const key = dayKeyFromPoint(touch.clientX, touch.clientY);
      root.querySelectorAll(".is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
      if (key) {
        root.querySelector(`[data-cms-caldev-day="${key}"]`)?.classList.add("is-drop-target");
      }
    }, { passive: false });

    root.addEventListener("touchend", async (e) => {
      if (!longPress.id) return;
      const id = longPress.id;
      const wasActive = longPress.active;
      const touch = e.changedTouches[0];
      clearLongPress();
      root.querySelectorAll(".is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
      draggingId = null;
      if (!wasActive || !touch) return;
      const key = dayKeyFromPoint(touch.clientX, touch.clientY);
      if (key) await persistMove(id, key);
      else renderBoardOnly();
    });

    root.addEventListener("touchcancel", () => {
      clearLongPress();
      draggingId = null;
      root.querySelectorAll(".is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && root?.querySelector("[data-cms-caldev-editor-overlay]:not([hidden])")) {
        closeEditor();
      }
    });

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
