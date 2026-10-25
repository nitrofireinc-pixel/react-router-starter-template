/* Event manager (plan 2.20): full-page month calendar over the Schedule Board events.
   Saves go live immediately (same API as the Schedule Board); Undo reverses the last 3 changes. */
(function () {
  "use strict";

  const TRACKS = [
    { id: "game", label: "Games", color: "#E71321" },
    { id: "rehearsal", label: "Rehearsals", color: "#014990" },
    { id: "meeting", label: "Meetings", color: "#002142" },
    { id: "deadline", label: "IMPORTANT", color: "#FDD703", ink: "#002142" },
    { id: "trip", label: "Trips", color: "#7c3aed" },
    { id: "other", label: "Other", color: "#5b6472" },
    { id: "fundraiser", label: "Fundraising", color: "#F2B705", ink: "#002142" },
  ];
  const TRACK = Object.fromEntries(TRACKS.map((t) => [t.id, t]));
  const FORM_LABEL = { game: "Games", rehearsal: "Rehearsals", meeting: "Meetings", deadline: "IMPORTANT", trip: "Trips", other: "Other", fundraiser: "Fundraising" };
  const FUNDRAISER_RE = /fundrais|mattress|silent auction|auction/i;
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DOW1 = ["S", "M", "T", "W", "T", "F", "S"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const UNDO_MAX = 3;

  const root = document.getElementById("ev-root");
  const canNotify = document.body.dataset.canNotify === "1";
  const state = {
    events: [],
    year: 0,
    month: 0,
    show: new Set(TRACKS.map((t) => t.id)),
    picked: "",        // phone: selected day
    undo: [],          // [{label, ops:[{type, ...}]}]
    busy: false,
    editing: null,     // event being edited or null for new
    exceptions: [],
    mode: "",          // "" | "one" (just this date) | "series" (whole series) for series rows
    shift: null,       // whole-series day shift {from, to}
    settings: null,    // overlap settings {evening_start, evening_end, modes}
    canEditSettings: false,
  };
  let toastTimer = null;

  // ---------- dates ----------
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  function todayIso() {
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(new Date()).map((x) => [x.type, x.value]));
      return `${p.year}-${p.month}-${p.day}`;
    } catch { const d = new Date(); return iso(d.getFullYear(), d.getMonth(), d.getDate()); }
  }
  function parse(isoStr) { const [y, m, d] = String(isoStr).split("-").map(Number); return new Date(y, m - 1, d); }
  function shortDate(isoStr) { const d = parse(isoStr); return `${MON[d.getMonth()]} ${d.getDate()}`; }
  function longDate(isoStr) { const d = parse(isoStr); return `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`; }
  function years() { const y = Number(todayIso().slice(0, 4)); return [y - 1, y, y + 1]; }
  const dayOf = (ev) => String(ev.start_date || "").slice(0, 10);
  function spans(ev, key) {
    const s = dayOf(ev); if (!s) return false;
    const e = String(ev.end_date || "").slice(0, 10);
    return e && e > s ? key >= s && key <= e : key === s;
  }
  function timeLabel(ev) {
    if (Number(ev.all_day) || !ev.start_time) return "All day";
    const f = (t) => { const [h, m] = String(t).split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; return `${((h + 11) % 12) + 1}:${pad(m || 0)} ${ap}`; };
    return ev.end_time ? `${f(ev.start_time)}–${f(ev.end_time)}` : f(ev.start_time);
  }
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plain = (html) => { const d = document.createElement("div"); d.innerHTML = String(html || ""); return d.textContent || ""; };

  // ---------- api ----------
  async function api(path, options = {}) {
    const res = await fetch(path, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...options });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { location.href = "/admin/login?next=/admin/events-manager"; throw new Error("Login required"); }
    if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
    return data;
  }
  const apiCreate = (p) => api("/api/admin/caldev/events", { method: "POST", body: JSON.stringify(p) });
  const apiUpdate = (id, p) => api(`/api/admin/caldev/events/${id}`, { method: "PUT", body: JSON.stringify(p) });
  const apiDelete = (id) => api(`/api/admin/caldev/events/${id}`, { method: "DELETE" });
  const apiRestore = (row) => api("/api/admin/caldev/events/restore", { method: "POST", body: JSON.stringify(row) });
  const apiPutBack = (rows, deleteIds, label) => api("/api/admin/caldev/put-back", { method: "POST", body: JSON.stringify({ rows: rows || [], delete_ids: deleteIds || [], undo: label || "" }) });
  const q = (flag) => (flag === "force" ? "?force=1" : "?check=1");
  // Every save asks the server to check overlaps first; nothing is written when it finds any.
  async function withOverlapCheck(send, adding) {
    const first = await send("check");
    if (first && first.saved === false && first.count) {
      const choice = await showConflicts(first, adding);
      if (choice !== "force") return { cancelled: true };
      const data = await send("force");
      return { data, overlaps: first.count };
    }
    return { data: first, overlaps: 0 };
  }
  function payloadOf(ev) {
    return {
      title: ev.title || "", description: ev.description || "", location: ev.location || "", who: ev.who || "",
      start_date: dayOf(ev), end_date: String(ev.end_date || "").slice(0, 10), start_time: ev.start_time || "", end_time: ev.end_time || "",
      all_day: !!Number(ev.all_day) || !ev.start_time, track: ev.track || "other",
    };
  }
  async function load() {
    const data = await api("/api/admin/caldev/events");
    state.events = Array.isArray(data.events) ? data.events : [];
  }
  const sortEv = (a, b) => dayOf(a).localeCompare(dayOf(b)) || String(a.start_time || "").localeCompare(String(b.start_time || "")) || Number(a.id) - Number(b.id);
  const visible = () => state.events.filter((e) => state.show.has(TRACK[e.track] ? e.track : "other"));
  const onDay = (key) => visible().filter((e) => spans(e, key)).sort(sortEv);

  // ---------- undo ----------
  function pushUndo(label, ops) {
    state.undo.push({ label, ops });
    while (state.undo.length > UNDO_MAX) state.undo.shift();
  }
  async function undo() {
    const step = state.undo.pop();
    if (!step || state.busy) { if (step) state.undo.push(step); return; }
    state.busy = true; setStatus("Undoing…");
    try {
      for (const op of step.ops) {
        if (op.type === "delete") await apiDelete(op.id).catch((e) => { if (!/not found/i.test(e.message)) throw e; });
        else if (op.type === "put") await apiUpdate(op.id, op.payload);
        else if (op.type === "restore") await apiRestore(op.row);
        else if (op.type === "putback") await apiPutBack(op.rows, op.delete_ids, step.label);
      }
      await load();
      toast(`↶ Undid: ${step.label}`);
      setStatus("✓ Saved · live on the public Calendar");
    } catch (err) {
      toast(err.message || "Undo failed", true); setStatus("Undo failed", true);
      await load().catch(() => {});
    } finally { state.busy = false; render(); }
  }

  // ---------- render ----------
  function shell() {
    const ys = years();
    root.innerHTML = `
<div class="ev-bar">
  <div class="ev-bar-l">
    <h1 class="ev-h1"><span aria-hidden="true">📅</span> Calendar events</h1>
    <button type="button" class="ev-btn ev-nav" data-act="prev" aria-label="Previous month">‹ <span class="ev-lbl">Prev</span></button>
    <button type="button" class="ev-btn ev-today" data-act="today">Today</button>
    <button type="button" class="ev-btn ev-nav" data-act="next" aria-label="Next month"><span class="ev-lbl">Next</span> ›</button>
    <select class="ev-sel" data-month aria-label="Month">${MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join("")}</select>
    <select class="ev-sel" data-year aria-label="Year">${ys.map((y) => `<option value="${y}">${y}</option>`).join("")}</select>
    <span class="ev-years">years ${ys[0]} – ${ys[2]} (prev · this · next)</span>
  </div>
  <div class="ev-bar-r">
    <button type="button" class="ev-btn" data-act="undo" title="Undo (up to 3 changes) · Ctrl+Z" aria-label="Undo">↶ <span class="ev-lbl">Undo</span> <small data-undo-n></small></button>
    <button type="button" class="ev-btn ev-focus-btn" data-act="focus" aria-pressed="false" title="Hide the side rail and header">⤢ Focus</button>
    <span class="ev-status" data-status role="status">✓ Saved · live on the public Calendar</span>
    <button type="button" class="ev-btn ev-primary ev-new" data-act="new">＋ New event</button>
  </div>
</div>
<div class="ev-bar2">
  <div class="ev-show"><span class="ev-show-h">Show:</span><span data-chips></span><span class="ev-legend">↻ = repeating · <s>struck</s> = cancelled</span></div>
  <div class="ev-bar2-r">
    <button type="button" class="ev-link" data-act="settings">⚙ Overlap settings</button>
    <a class="ev-link" href="/admin?tab=caldev" data-old-board title="Older Schedule Board: drag events to new dates and preview the IMPORTANT banners showing now">Schedule Board (drag · banner preview)</a>
    <button type="button" class="ev-link" data-act="undated" aria-expanded="false">Needs a date (<span data-undated-n>0</span>)</button>
    ${canNotify ? '<button type="button" class="ev-btn ev-finished" data-act="finished">✉ Finished: notify subscribers</button>' : ""}
  </div>
</div>
<div class="ev-undated" data-undated hidden></div>
<div class="ev-grid" data-grid role="grid" aria-label="Month"></div>
<section class="ev-daylist" data-daylist aria-live="polite"></section>
<button type="button" class="ev-fab" data-act="new">＋ New event</button>
<div class="ev-toast" data-toast role="status" aria-live="polite" hidden></div>
<div class="ev-scrim" data-scrim hidden></div>
<form class="ev-dialog" data-form role="dialog" aria-modal="true" aria-labelledby="ev-form-h" hidden novalidate></form>
<div class="ev-sheet-scrim" data-sheet-scrim hidden></div>
<div class="ev-sheet" data-sheet role="dialog" aria-modal="true" aria-labelledby="ev-sheet-h" hidden></div>`;
  }

  function renderChips() {
    root.querySelector("[data-chips]").innerHTML = TRACKS.map((t) => `<button type="button" class="ev-chip${state.show.has(t.id) ? "" : " is-off"}" data-chip="${t.id}" aria-pressed="${state.show.has(t.id)}" style="--c:${t.color};--i:${t.ink || "#fff"}">${t.id === "fundraiser" ? "💰 " : ""}${esc(t.label)}</button>`).join("");
  }

  function renderGrid() {
    const { year: y, month: m } = state;
    root.querySelector("[data-month]").value = String(m);
    root.querySelector("[data-year]").value = String(y);
    const ys = years();
    root.querySelector('[data-act="prev"]').disabled = y === ys[0] && m === 0;
    root.querySelector('[data-act="next"]').disabled = y === ys[2] && m === 11;
    const first = new Date(y, m, 1);
    const start = new Date(y, m, 1 - first.getDay());
    const weeks = Math.ceil((first.getDay() + new Date(y, m + 1, 0).getDate()) / 7);
    const today = todayIso();
    let html = `<div class="ev-dow" role="row">${DOW.map((d, i) => `<div role="columnheader"><span class="ev-dl">${d}</span><span class="ev-ds">${DOW1[i]}</span></div>`).join("")}</div>`;
    for (let w = 0; w < weeks; w += 1) {
      html += '<div class="ev-week" role="row">';
      for (let i = 0; i < 7; i += 1) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i);
        const key = iso(d.getFullYear(), d.getMonth(), d.getDate());
        const list = onDay(key);
        const out = d.getMonth() !== m;
        const tip = `Add event on ${shortDate(key)}`;
        html += `<div class="ev-day${out ? " is-out" : ""}${key === today ? " is-today" : ""}${key === state.picked ? " is-picked" : ""}" role="gridcell" data-day="${key}">
  <div class="ev-day-h"><span class="ev-num">${d.getDate()}</span><button type="button" class="ev-plus" data-add="${key}" title="${tip}" aria-label="${tip}" data-tip="${tip}">+</button></div>
  <div class="ev-chips">${list.map(chip).join("")}</div>
  <div class="ev-dots" aria-hidden="true">${list.slice(0, 4).map((e) => `<i style="--c:${(TRACK[e.track] || TRACK.other).color}"></i>`).join("")}</div>
</div>`;
      }
      html += "</div>";
    }
    const grid = root.querySelector("[data-grid]");
    grid.innerHTML = html;
    grid.style.setProperty("--weeks", weeks);
  }

  function chip(ev) {
    const t = TRACK[ev.track] || TRACK.other;
    const cancelled = !!ev.cancelled_at;
    const rep = ev.series_id ? "↻ " : "";
    const fund = ev.track === "fundraiser" ? "💰 " : "";
    const label = `${ev.title}${cancelled ? " · Cancelled" : ""}`;
    return `<button type="button" class="ev-ev${cancelled ? " is-cancelled" : ""}" data-edit="${ev.id}" style="--c:${t.color};--i:${t.ink || "#fff"}" title="${esc(`${ev.title} · ${timeLabel(ev)} · ${FORM_LABEL[ev.track] || "Other"}`)}">${rep}${fund}${esc(label)}</button>`;
  }

  function renderDayList() {
    const box = root.querySelector("[data-daylist]");
    const key = state.picked;
    if (!key) { box.innerHTML = '<p class="ev-hint">Tap a day to see its events.</p>'; return; }
    const list = onDay(key);
    box.innerHTML = `<div class="ev-dl-h"><h2>${esc(longDate(key))}</h2><button type="button" class="ev-btn ev-primary" data-add="${key}">＋ Add on ${esc(shortDate(key))}</button></div>
${list.length ? list.map((ev) => { const t = TRACK[ev.track] || TRACK.other; return `<button type="button" class="ev-card${ev.cancelled_at ? " is-cancelled" : ""}" data-edit="${ev.id}" style="--c:${t.color}"><span class="ev-card-t">${esc(ev.title)}</span><span class="ev-card-s">${esc(timeLabel(ev))}${ev.location ? ` · ${esc(ev.location)}` : ""} · tap to edit</span><span aria-hidden="true" class="ev-card-go">›</span></button>`; }).join("") : '<p class="ev-hint">Nothing on this day yet.</p>'}`;
  }

  function renderUndated() {
    const list = state.events.filter((e) => !dayOf(e));
    root.querySelector("[data-undated-n]").textContent = String(list.length);
    root.querySelector("[data-undated]").innerHTML = list.length
      ? `<p>These events have no date, so they are not on the calendar:</p>${list.map(chip).join(" ")}`
      : "<p>Every event has a date.</p>";
  }

  function renderUndo() {
    const n = state.undo.length;
    const b = root.querySelector('[data-act="undo"]');
    b.disabled = !n || state.busy;
    root.querySelector("[data-undo-n]").textContent = `(${n} step${n === 1 ? "" : "s"})`;
    b.title = n ? `Undo: ${state.undo[n - 1].label} · Ctrl+Z (up to 3 changes)` : "Nothing to undo";
  }

  function render() { renderChips(); renderGrid(); renderDayList(); renderUndated(); renderUndo(); }

  function setStatus(text, err) {
    const s = root.querySelector("[data-status]");
    s.textContent = text; s.classList.toggle("is-error", !!err);
  }
  function toast(msg, err, withUndo) {
    const el = root.querySelector("[data-toast]");
    el.innerHTML = `<span>${esc(msg)}</span>${withUndo ? '<button type="button" data-act="undo">Undo</button>' : ""}`;
    el.hidden = false; el.classList.toggle("is-error", !!err);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, withUndo ? 7000 : 3200);
  }

  // ---------- form ----------
  function radioCats(sel) {
    return TRACKS.map((t) => `<label class="ev-cat" style="--c:${t.color};--i:${t.ink || "#fff"}"><input type="radio" name="track" value="${t.id}"${t.id === sel ? " checked" : ""}><span>${esc(FORM_LABEL[t.id])}</span></label>`).join("");
  }
  function openForm(ev, dateKey, chosen) {
    if (ev && ev.series_id && !ev.cancelled_at && !chosen) { state.mode = ""; state.shift = null; seriesChooser(ev); return; }
    if (!chosen) { state.mode = ""; state.shift = null; }
    state.editing = ev || null;
    state.exceptions = [];
    const f = ev ? payloadOf(ev) : { title: "", description: "", location: "", start_date: dateKey || todayIso(), end_date: "", start_time: "", end_time: "", all_day: true, track: "rehearsal" };
    let suggested = false;
    if (ev && f.track === "other" && FUNDRAISER_RE.test(`${f.title} ${plain(f.description)}`)) { f.track = "fundraiser"; suggested = true; }
    const inSeries = ev && ev.series_id && !ev.cancelled_at;
    const title = !ev ? `New event · ${longDate(f.start_date)}`
      : state.mode === "series" ? "Edit whole series (today onward)"
      : inSeries ? "Edit just this date" : ev.cancelled_at ? "Edit event · Cancelled" : "Edit event";
    const form = root.querySelector("[data-form]");
    form.innerHTML = `
<div class="ev-f-grab" aria-hidden="true"></div>
<div class="ev-f-head"><h2 id="ev-form-h">${esc(title)}</h2><button type="button" class="ev-btn" data-close>✕ <span class="ev-lbl">Close</span></button></div>
<div class="ev-f-body">
${state.mode === "series" ? `<p class="ev-note ev-series-note">↻ Changes apply to every date in this series from today on${state.shift ? ` · each ${DOW[state.shift.from]} moves to ${DOW[state.shift.to]} of the same week` : ""}. Past and detached dates are not touched.</p>` : ""}
${state.mode === "one" ? '<p class="ev-note ev-series-note">Saving removes this date from its series; the rest of the series keeps going.</p>' : ""}
${ev && ev.cancelled_at ? '<p class="ev-note ev-cancel-note">⊘ <b>Cancelled</b> · shows struck through on the calendar. Restore brings it back.</p>' : ""}
<label class="ev-f ev-f-wide"><span>Title</span><input name="title" maxlength="200" required value="${esc(f.title)}" placeholder="Event title"></label>
<div class="ev-f-row">
  <label class="ev-f"><span>Date</span><input name="start_date" type="date" value="${esc(f.start_date)}"${state.mode === "series" ? " disabled" : ""}></label>
  <label class="ev-f"><span>End date (optional)</span><input name="end_date" type="date" value="${esc(f.end_date)}"${state.mode === "series" ? " disabled" : ""}></label>
</div>
${ev ? "" : `<fieldset class="ev-f ev-f-wide ev-repeat"><legend>Repeat</legend>
  <div class="ev-seg"><label><input type="radio" name="repeat" value="yes"><span>Yes</span></label><label><input type="radio" name="repeat" value="no" checked><span>No</span></label></div>
  <div class="ev-rep-opts" data-rep hidden>
    <p class="ev-note">Creates one event for each matching weekday in the selected months of that year. Skip dates leave a day out.</p>
    <div class="ev-checks" aria-label="Days">${DOW.map((d, i) => `<label><input type="checkbox" name="rday" value="${i}"> ${d}</label>`).join("")}</div>
    <div class="ev-checks" aria-label="Months">${MON.map((d, i) => `<label><input type="checkbox" name="rmonth" value="${i + 1}"> ${d}</label>`).join("")}</div>
    <div class="ev-f-row"><input type="date" data-skip aria-label="Skip date"><button type="button" class="ev-btn" data-add-skip>Add skip date</button></div>
    <ul class="ev-skips" data-skips></ul>
  </div></fieldset>`}
<label class="ev-allday"><input type="checkbox" name="all_day"${f.all_day ? " checked" : ""}> All day</label>
<div class="ev-f-row" data-times${f.all_day ? " hidden" : ""}>
  <label class="ev-f"><span>Start</span><input name="start_time" type="time" value="${esc(f.start_time || "16:00")}"></label>
  <label class="ev-f"><span>End</span><input name="end_time" type="time" value="${esc(f.end_time || "18:00")}"></label>
</div>
<fieldset class="ev-f ev-f-wide"><legend>Category (pick one)</legend><div class="ev-cats" role="radiogroup">${radioCats(f.track)}</div>
<p class="ev-note">IMPORTANT shows the red banner on every page for the 7 days up to the event. Meetings also show on Boosters.</p>
<p class="ev-note ev-fund-note" data-fund-note${f.track === "fundraiser" ? "" : " hidden"}>💰 Category <b>Fundraising</b>${suggested ? " (suggested because the title looks like a fundraiser; it is saved only when you press Save)" : ""}. Fundraising never shows the red IMPORTANT banner; pick IMPORTANT if you need the banner.</p></fieldset>
<label class="ev-f ev-f-wide"><span>Location</span><input name="location" maxlength="200" value="${esc(f.location)}"></label>
<div class="ev-f ev-f-wide"><span id="ev-desc-l">Description</span>
  <div class="ev-rt-bar" role="toolbar" aria-label="Text style">
    <button type="button" data-cmd="bold" title="Bold"><b>B</b></button><button type="button" data-cmd="italic" title="Italic"><i>I</i></button><button type="button" data-cmd="underline" title="Underline"><u>U</u></button>
    <button type="button" data-cmd="link" title="Add a link">Link</button>
    <label title="Color">Color <input type="color" data-color value="#002142"></label>
    <label title="Size">Size <select data-size><option value="">Normal</option><option value="14px">Small</option><option value="18px">Medium</option><option value="22px">Large</option><option value="28px">Extra large</option></select></label>
  </div>
  <div class="ev-rt" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="ev-desc-l" data-desc data-placeholder="Event details">${f.description || ""}</div>
</div>
</div>
<div class="ev-f-foot">
  ${ev ? `<button type="button" class="ev-btn ev-danger" data-delete>🗑 ${state.mode === "series" ? "Delete whole series…" : "Delete"}</button>` : ""}
  ${ev && state.mode !== "series" ? (ev.cancelled_at ? '<button type="button" class="ev-btn" data-uncancel>↺ Restore</button>' : '<button type="button" class="ev-btn" data-cancel-date>⊘ Cancel this date</button>') : ""}
  ${ev && !ev.series_id && !ev.cancelled_at ? '<button type="button" class="ev-btn" data-group>⛓ Group as series…</button>' : ""}
  <span class="ev-note">Saves go live; Undo can reverse the last 3 changes</span>
  <button type="button" class="ev-btn" data-close>Cancel</button>
  <button type="submit" class="ev-btn ev-primary" data-save>${ev ? "Save" : "Add event"}</button>
</div>`;
    form.hidden = false;
    root.querySelector("[data-scrim]").hidden = false;
    document.body.classList.add("ev-modal");
    setTimeout(() => form.querySelector('[name="title"]').focus(), 20);
  }
  function closeForm() {
    root.querySelector("[data-form]").hidden = true;
    root.querySelector("[data-scrim]").hidden = true;
    document.body.classList.remove("ev-modal");
    state.editing = null; state.mode = ""; state.shift = null;
  }

  function cleanDesc(html) {
    const ok = /^(?:B|STRONG|I|EM|U|BR|SPAN|DIV|P|A)$/i;
    const wrap = document.createElement("div"); wrap.innerHTML = String(html || "");
    const unwrap = (p, c) => { while (c.firstChild) p.insertBefore(c.firstChild, c); p.removeChild(c); };
    const walk = (node) => [...node.childNodes].forEach((c) => {
      if (c.nodeType === 3) return;
      if (c.nodeType !== 1 || !ok.test(c.tagName)) { if (c.nodeType === 1 && c.tagName === "FONT") { /* fall through */ } unwrap(node, c); return; }
      if (c.tagName === "A") {
        const href = safeUrl(c.getAttribute("href"));
        [...c.attributes].forEach((a) => c.removeAttribute(a.name));
        if (!href) { unwrap(node, c); return; }
        c.setAttribute("href", href); c.setAttribute("target", "_blank"); c.setAttribute("rel", "noopener noreferrer");
      } else if (c.tagName === "SPAN") {
        const color = c.style.color, size = c.style.fontSize;
        [...c.attributes].forEach((a) => c.removeAttribute(a.name));
        const st = [color && `color:${color}`, size && `font-size:${size}`].filter(Boolean);
        if (!st.length) { unwrap(node, c); return; }
        c.setAttribute("style", st.join(";"));
      } else { [...c.attributes].forEach((a) => c.removeAttribute(a.name)); }
      walk(c);
    });
    walk(wrap);
    const out = wrap.innerHTML.trim();
    return out === "<br>" ? "" : out;
  }
  function safeUrl(raw) {
    const u = String(raw || "").trim();
    if (!u || /[\s<>]/.test(u) || /^(javascript|data|vbscript):/i.test(u)) return "";
    if (/^https?:\/\//i.test(u) || /^mailto:/i.test(u) || (u.startsWith("/") && !u.startsWith("//"))) return u;
    if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(u)) return `https://${u}`;
    return "";
  }

  function readForm() {
    const form = root.querySelector("[data-form]");
    const v = (n) => form.querySelector(`[name="${n}"]`)?.value || "";
    const allDay = form.querySelector('[name="all_day"]').checked;
    return {
      title: v("title").trim(), description: cleanDesc(form.querySelector("[data-desc]").innerHTML),
      location: v("location").trim(), who: state.editing?.who || "",
      start_date: v("start_date"), end_date: v("end_date"),
      start_time: allDay ? "" : v("start_time"), end_time: allDay ? "" : v("end_time"), all_day: allDay,
      track: form.querySelector('[name="track"]:checked')?.value || "other",
      repeat: form.querySelector('[name="repeat"][value="yes"]')?.checked || false,
      days: [...form.querySelectorAll('[name="rday"]:checked')].map((x) => Number(x.value)),
      months: [...form.querySelectorAll('[name="rmonth"]:checked')].map((x) => Number(x.value)),
    };
  }
  function repeatDates(p) {
    const year = Number(String(p.start_date || todayIso()).slice(0, 4));
    const skip = new Set(state.exceptions);
    if (!p.days.length || !p.months.length) return [];
    const out = [];
    for (const m of [...p.months].sort((a, b) => a - b)) {
      const dim = new Date(year, m, 0).getDate();
      for (let d = 1; d <= dim; d += 1) {
        const dt = new Date(year, m - 1, d);
        const key = iso(year, m - 1, d);
        if (p.days.includes(dt.getDay()) && !skip.has(key)) out.push(key);
      }
    }
    return out;
  }

  const fullRow = (ev) => ({ ...ev });
  function okToast(base, overlaps) {
    toast(overlaps ? `✓ Saved (overlaps noted)` : base, false, true);
  }
  async function save(e) {
    e.preventDefault();
    if (state.busy) return;
    const p = readForm();
    if (!p.title) { toast("Title is required", true); return; }
    if (!p.start_date && !p.repeat && state.mode !== "series") { toast("Date is required", true); return; }
    const { repeat, days, months, ...body } = p;
    const ev = state.editing;
    state.busy = true; setStatus("Saving…");
    try {
      if (ev && state.mode === "series") {
        const fields = { title: body.title, description: body.description, location: body.location, track: body.track, all_day: body.all_day, start_time: body.start_time, end_time: body.end_time };
        const shift = state.shift;
        const r = await withOverlapCheck((flag) => api(`/api/admin/caldev/series/${ev.series_id}${q(flag)}`, { method: "PUT", body: JSON.stringify({ fields, day_shift: shift }) }), body);
        if (r.cancelled) { setStatus("Not saved"); return; }
        await load();
        pushUndo(`Change series “${body.title}”`, [{ type: "putback", rows: r.data.before || [] }]);
        closeForm(); okToast(`✓ Changed ${r.data.rows.length} dates in the series`, r.overlaps);
      } else if (ev) {
        const extra = ev.series_id && !ev.cancelled_at ? { detach: true } : {};
        const r = await withOverlapCheck((flag) => api(`/api/admin/caldev/events/${ev.id}${q(flag)}`, { method: "PUT", body: JSON.stringify({ ...body, ...extra }) }), body);
        if (r.cancelled) { setStatus("Not saved"); return; }
        pushUndo(`Edit “${r.data.title}”`, [{ type: "putback", rows: [fullRow(ev)] }]);
        replace(r.data);
        closeForm(); okToast(`✓ Saved “${r.data.title}”`, r.overlaps);
      } else if (repeat) {
        const dates = repeatDates(p);
        if (!dates.length) { toast("Choose at least one weekday and one month to repeat", true); return; }
        const rule = { kind: "weekly", days: [...days].sort(), months: [...months].sort((a, b) => a - b), year: Number(dates[0].slice(0, 4)), skip: [...state.exceptions].sort() };
        const r = await withOverlapCheck((flag) => api(`/api/admin/caldev/series${q(flag)}`, { method: "POST", body: JSON.stringify({ event: { ...body, end_date: "" }, dates, rule }) }), body);
        if (r.cancelled) { setStatus("Not saved"); return; }
        const made = r.data.rows || [];
        state.events.push(...made);
        pushUndo(`Add ${made.length} “${p.title}” dates`, [{ type: "putback", rows: [], delete_ids: made.map((x) => x.id) }]);
        closeForm(); okToast(`✓ Added ${made.length} “${p.title}” dates`, r.overlaps);
      } else {
        const r = await withOverlapCheck((flag) => api(`/api/admin/caldev/events${q(flag)}`, { method: "POST", body: JSON.stringify(body) }), body);
        if (r.cancelled) { setStatus("Not saved"); return; }
        const made = r.data;
        state.events.push(made);
        pushUndo(`Add “${made.title}”`, [{ type: "delete", id: made.id }]);
        if (state.picked) state.picked = dayOf(made) || state.picked;
        closeForm(); okToast(`✓ Added “${made.title}”`, r.overlaps);
      }
      setStatus("✓ Saved · live on the public Calendar");
    } catch (err) {
      toast(err.message || "Save failed", true); setStatus("Not saved", true);
    } finally { state.busy = false; render(); }
  }
  function replace(row) { const i = state.events.findIndex((x) => String(x.id) === String(row.id)); if (i >= 0) state.events[i] = row; else state.events.push(row); }

  async function remove() {
    const ev = state.editing; if (!ev || state.busy) return;
    if (state.mode === "series") return removeSeries(ev);
    if (!window.confirm("Delete this Schedule Board event? Meetings will also be removed from Boosters.")) return;
    state.busy = true; setStatus("Deleting…");
    try {
      await apiDelete(ev.id);
      state.events = state.events.filter((x) => String(x.id) !== String(ev.id));
      pushUndo(`Delete “${ev.title}”`, [{ type: "restore", row: { ...payloadOf(ev), id: ev.id, series_id: ev.series_id, series_rule: ev.series_rule, cancelled_at: ev.cancelled_at } }]);
      closeForm(); toast(`🗑 Deleted “${ev.title}”`, false, true);
      setStatus("✓ Saved · live on the public Calendar");
    } catch (err) { toast(err.message || "Delete failed", true); setStatus("Not deleted", true); }
    finally { state.busy = false; render(); }
  }
  async function removeSeries(ev) {
    let info;
    try { info = await api(`/api/admin/caldev/series/${ev.series_id}`); } catch (err) { toast(err.message, true); return; }
    const n = info.future_count;
    const ok = await confirmSheet("Delete whole series?", `<p>This deletes <b>${n}</b> date${n === 1 ? "" : "s"} of “${esc(ev.title)}” from today on that are still in the series.</p><p class="ev-note">Past, cancelled and detached dates stay. Undo brings them all back.</p>`, `🗑 Delete ${n} date${n === 1 ? "" : "s"}`, true);
    if (!ok) return;
    state.busy = true; setStatus("Deleting…");
    try {
      const res = await api(`/api/admin/caldev/series/${ev.series_id}`, { method: "DELETE" });
      await load();
      pushUndo(`Delete series “${ev.title}”`, [{ type: "putback", rows: res.deleted || [] }]);
      closeForm(); toast(`🗑 Deleted ${res.deleted.length} dates of “${ev.title}”`, false, true);
      setStatus("✓ Saved · live on the public Calendar");
    } catch (err) { toast(err.message || "Delete failed", true); setStatus("Not deleted", true); }
    finally { state.busy = false; render(); }
  }
  async function setCancelled(on) {
    const ev = state.editing; if (!ev || state.busy) return;
    state.busy = true; setStatus(on ? "Cancelling…" : "Restoring…");
    try {
      const saved = await apiUpdate(ev.id, { cancelled: on });
      replace(saved);
      pushUndo(`${on ? "Cancel" : "Restore"} “${ev.title}”`, [{ type: "putback", rows: [fullRow(ev)] }]);
      closeForm(); toast(on ? `⊘ Cancelled “${ev.title}” · ${shortDate(dayOf(ev))}` : `↺ Restored “${ev.title}”`, false, true);
      setStatus("✓ Saved · live on the public Calendar");
    } catch (err) { toast(err.message || "Failed", true); setStatus("Not saved", true); }
    finally { state.busy = false; render(); }
  }

  // ---------- sheet (series chooser, overlap check, group, settings) ----------
  let sheetDone = null;
  function openSheet(html, cls) {
    const prev = root.querySelector("[data-sheet]");
    const sh = prev.cloneNode(false); // fresh node: no listeners left from the last sheet
    prev.replaceWith(sh);
    sh.className = `ev-sheet${cls ? ` ${cls}` : ""}`;
    sh.innerHTML = html; sh.hidden = false;
    root.querySelector("[data-sheet-scrim]").hidden = false;
    setTimeout(() => sh.querySelector("button.ev-primary, button")?.focus(), 20);
    return sh;
  }
  function closeSheet(result) {
    root.querySelector("[data-sheet]").hidden = true;
    root.querySelector("[data-sheet-scrim]").hidden = true;
    const done = sheetDone; sheetDone = null;
    if (done) done(result);
  }
  function sheetPromise() { return new Promise((resolve) => { sheetDone = resolve; }); }
  function confirmSheet(title, bodyHtml, okLabel, danger) {
    openSheet(`<div class="ev-sh-head"><h2 id="ev-sheet-h">${esc(title)}</h2><button type="button" class="ev-btn" data-sheet-close>✕</button></div>
<div class="ev-sh-body">${bodyHtml}</div>
<div class="ev-sh-foot"><button type="button" class="ev-btn" data-sheet-close>Back</button><button type="button" class="ev-btn ${danger ? "ev-danger-solid" : "ev-primary"}" data-sheet-ok>${esc(okLabel)}</button></div>`);
    return sheetPromise();
  }

  function seriesChooser(ev) {
    const d = parse(dayOf(ev)).getDay();
    openSheet(`<div class="ev-sh-head"><h2 id="ev-sheet-h">Change a repeating event</h2><button type="button" class="ev-btn" data-sheet-close>✕</button></div>
<p class="ev-sh-sub">↻ ${esc(ev.title)} · ${esc(longDate(dayOf(ev)))}</p>
<div class="ev-sh-body">
<label class="ev-choice"><input type="radio" name="smode" value="one" checked><span><b>Just this date</b> (removes it from the series)<small>Edit, move or cancel ${esc(shortDate(dayOf(ev)))} only. It becomes a single event; the series keeps going.</small></span></label>
<label class="ev-choice"><input type="radio" name="smode" value="series"><span><b>Whole series</b><small>Change every date in the series from today on, at once.</small></span></label>
<div class="ev-shift" data-shift hidden><b>Whole-series shift</b>
  <div class="ev-f-row">Day: <select data-shift-from>${DOW.map((x, i) => `<option value="${i}"${i === d ? " selected" : ""}>${x}</option>`).join("")}</select> → <select data-shift-to>${DOW.map((x, i) => `<option value="${i}"${i === d ? " selected" : ""}>${x}</option>`).join("")}</select></div>
  <p class="ev-note">Each date moves to that day of the same week. Detached and past dates are not touched.</p>
  <div class="ev-preview" data-shift-preview></div>
</div></div>
<div class="ev-sh-foot"><button type="button" class="ev-btn" data-sheet-close>Back</button><button type="button" class="ev-btn ev-primary" data-series-go>Continue</button></div>`, "ev-sheet-side");
    const sh = root.querySelector("[data-sheet]");
    const refresh = async () => {
      const whole = sh.querySelector('[name="smode"][value="series"]').checked;
      sh.querySelector("[data-shift]").hidden = !whole;
      if (!whole) return;
      const from = Number(sh.querySelector("[data-shift-from]").value), to = Number(sh.querySelector("[data-shift-to]").value);
      const box = sh.querySelector("[data-shift-preview]");
      try {
        const res = await api(`/api/admin/caldev/series/${ev.series_id}?preview=1`, { method: "PUT", body: JSON.stringify({ fields: {}, day_shift: from === to ? null : { from, to } }) });
        const moved = res.preview.filter((x) => x.old_date !== x.new_date);
        box.innerHTML = `Preview: <b>${res.preview.length}</b> date${res.preview.length === 1 ? "" : "s"} change${moved.length ? ` · ${moved.length} move` : ""}${moved.length ? `<ul class="ev-moves">${moved.slice(0, 6).map((x) => `<li>${esc(shortDate(x.old_date))} → <b>${esc(shortDate(x.new_date))}</b></li>`).join("")}${moved.length > 6 ? `<li>and ${moved.length - 6} more</li>` : ""}</ul>` : ""}`;
      } catch (err) { box.textContent = err.message; }
    };
    sh.addEventListener("change", refresh);
    sheetDone = (r) => {
      if (r !== "go") return;
      const whole = sh.querySelector('[name="smode"][value="series"]').checked;
      const from = Number(sh.querySelector("[data-shift-from]").value), to = Number(sh.querySelector("[data-shift-to]").value);
      state.mode = whole ? "series" : "one";
      state.shift = whole && from !== to ? { from, to } : null;
      openForm(ev, null, true);
    };
  }

  function fmtMin(m) { if (m >= 1440) return "midnight"; const h = Math.floor(m / 60), mm = m % 60; return `${((h + 11) % 12) + 1}:${pad(mm)} ${h >= 12 ? "PM" : "AM"}`; }
  function winLabel(w) { return w.kind === "whole_day" ? "Whole day" : `${fmtMin(w.start)}–${fmtMin(w.end)}`; }
  function bar(w, cls, label) {
    const lo = 720, span = 720;
    const a = Math.max(w.start, lo), b = Math.min(w.end, 1440);
    if (b <= a) return `<div class="ev-tl-row"><span class="ev-tl-out">${esc(label)} · before 12 PM</span></div>`;
    return `<div class="ev-tl-row"><span class="ev-tl-bar ${cls}" style="left:${((a - lo) / span) * 100}%;width:${((b - a) / span) * 100}%">${esc(label)}</span></div>`;
  }
  function conflictBlock(c) {
    const ex = c.existing, ad = c.adding;
    const exT = TRACK[ex.track] || TRACK.other, adT = TRACK[ad.track] || TRACK.other;
    const eveningNote = (w, t) => (w.kind === "evening" ? `All-day ${(FORM_LABEL[t] || "").replace(/s$/, "").toLowerCase()}, counted from ${fmtMin(w.start)}` : "");
    const lo = 720, ov = c.overlap;
    return `<div class="ev-cf">
<h3>⚠ ${esc(longDate(c.date))}: overlaps “${esc(ex.title)}”</h3>
<div class="ev-cf-pair">
  <div class="ev-cf-card" style="--c:${exT.color}"><small>ALREADY SCHEDULED</small><b>${esc(ex.title)}</b><span>${esc(shortDate(c.date))} · ${esc(ex.all_day ? "All day" : timeLabel(ex))} (${esc(FORM_LABEL[ex.track] || "Other")})</span>${ex.window.kind !== "timed" ? `<span>counted ${esc(winLabel(ex.window))}</span>` : ""}</div>
  <span class="ev-cf-vs">vs</span>
  <div class="ev-cf-card is-new" style="--c:${adT.color}"><small>YOU ARE ADDING</small><b>${esc(ad.title)}</b><span>${esc(shortDate(c.date))} · ${esc(ad.all_day ? "All day" : timeLabel(ad))} (${esc(FORM_LABEL[ad.track] || "Other")})</span>${ad.window.kind !== "timed" ? `<span>counted ${esc(winLabel(ad.window))}</span>` : ""}</div>
</div>
<div class="ev-tl" aria-hidden="true"><div class="ev-tl-scale"><span>12 PM</span><span>2 PM</span><span>4 PM</span><span>6 PM</span><span>8 PM</span><span>10 PM</span><span>12 AM</span></div>
${bar(ex.window, ex.window.kind === "evening" ? "is-hatch" : "", eveningNote(ex.window, ex.track) || ex.title)}
${bar(ad.window, `is-new${ad.window.kind === "evening" ? " is-hatch" : ""}`, eveningNote(ad.window, ad.track) || ad.title)}
${ov.end > lo ? `<div class="ev-tl-row ev-tl-ovrow"><span class="ev-tl-ov" style="left:${((Math.max(ov.start, lo) - lo) / 720) * 100}%;width:${((Math.min(ov.end, 1440) - Math.max(ov.start, lo)) / 720) * 100}%"></span></div>` : ""}
</div>
<p class="ev-cf-legend">Orange = overlap ${esc(fmtMin(ov.start))}–${esc(fmtMin(ov.end))}.</p>
</div>`;
  }
  function showConflicts(res, adding) {
    const all = res.all && res.all.length ? res.all : res.conflicts;
    const first = all.slice(0, 5), rest = all.slice(5);
    const more = res.count - first.length;
    openSheet(`<div class="ev-sh-grab" aria-hidden="true"></div>
<div class="ev-sh-head"><h2 id="ev-sheet-h">Check before saving</h2><button type="button" class="ev-btn" data-sheet-close aria-label="Go back">✕</button></div>
<p class="ev-sh-sub">${esc(adding?.title || "")}: <b>${res.count} overlap${res.count === 1 ? "" : "s"}</b></p>
<div class="ev-sh-body ev-cf-list">${first.map(conflictBlock).join("")}
${more > 0 ? `<button type="button" class="ev-link" data-more aria-expanded="false">and ${more} more ▾</button><div data-more-list hidden>${rest.map(conflictBlock).join("")}${res.count > all.length ? `<p class="ev-note">…plus ${res.count - all.length} more not shown.</p>` : ""}</div>` : ""}
<p class="ev-note">Saving is never blocked. “Save anyway” is logged as saved with ${res.count} overlap${res.count === 1 ? "" : "s"}. IMPORTANT and Other items are never conflicts; back-to-back (one ends 5:00, next starts 5:00) is fine.</p></div>
<div class="ev-sh-foot"><button type="button" class="ev-btn" data-sheet-close>← Go back and edit</button><button type="button" class="ev-btn ev-primary" data-sheet-force>Save anyway</button></div>`, "ev-sheet-cf");
    return sheetPromise();
  }

  function openGroup(ev) {
    const key = (r) => `${String(r.title).trim().toLowerCase()}|${r.track}|${r.start_time}|${r.end_time}`;
    const free = state.events.filter((r) => dayOf(r) && !r.series_id && !r.cancelled_at).sort(sortEv);
    const similar = new Set(free.filter((r) => key(r) === key(ev)).map((r) => String(r.id)));
    const row = (r) => `<label class="ev-grp"><input type="checkbox" name="gid" value="${r.id}"${similar.has(String(r.id)) ? " checked" : ""}> <span>${esc(shortDate(dayOf(r)))} · ${esc(r.title)} · ${esc(timeLabel(r))}</span></label>`;
    openSheet(`<div class="ev-sh-head"><h2 id="ev-sheet-h">⛓ Group as series</h2><button type="button" class="ev-btn" data-sheet-close>✕</button></div>
<p class="ev-sh-sub">Pick separate events to join into one series, so whole-series changes work on them.</p>
<div class="ev-sh-body"><button type="button" class="ev-btn" data-find-similar>Find similar (same title, category and time)</button>
<div class="ev-grp-list" data-grp-list>${free.filter((r) => similar.has(String(r.id))).map(row).join("")}</div>
<details><summary>Show all other single events</summary>${free.filter((r) => !similar.has(String(r.id))).map(row).join("")}</details>
<p class="ev-note" data-grp-n></p></div>
<div class="ev-sh-foot"><button type="button" class="ev-btn" data-sheet-close>Back</button><button type="button" class="ev-btn ev-primary" data-group-go>Review</button></div>`, "ev-sheet-side");
    const sh = root.querySelector("[data-sheet]");
    const count = () => { const n = sh.querySelectorAll('[name="gid"]:checked').length; sh.querySelector("[data-grp-n]").textContent = `${n} selected`; return n; };
    count(); sh.addEventListener("change", count);
    sh.querySelector("[data-find-similar]").addEventListener("click", () => { sh.querySelectorAll('[name="gid"]').forEach((c) => { c.checked = similar.has(c.value); }); count(); });
    sheetDone = async (r) => {
      if (r !== "group") return;
      const ids = [...sh.querySelectorAll('[name="gid"]:checked')].map((c) => Number(c.value));
      if (ids.length < 2) { toast("Pick at least two events", true); return; }
      const picked = state.events.filter((x) => ids.includes(Number(x.id))).sort(sortEv);
      const ok = await confirmSheet("Review: group as series", `<p>Join <b>${ids.length}</b> events into one series:</p><ul class="ev-moves">${picked.slice(0, 10).map((x) => `<li>${esc(shortDate(dayOf(x)))} · ${esc(x.title)}</li>`).join("")}${picked.length > 10 ? `<li>and ${picked.length - 10} more</li>` : ""}</ul><p class="ev-note">Dates do not change. One Undo step.</p>`, `⛓ Group ${ids.length} events`);
      if (!ok) return;
      state.busy = true;
      try {
        const res = await api("/api/admin/caldev/group-series", { method: "POST", body: JSON.stringify({ ids }) });
        await load();
        pushUndo(`Group ${ids.length} “${ev.title}” events`, [{ type: "putback", rows: res.before }]);
        closeForm(); toast(`⛓ Grouped ${ids.length} events as a series`, false, true);
      } catch (err) { toast(err.message || "Group failed", true); }
      finally { state.busy = false; render(); }
    };
  }

  const MODE_LABEL = { evening: "Evening only", whole_day: "Whole day", skip: "Not checked" };
  async function openSettings() {
    let res;
    try { res = await api("/api/admin/caldev/overlap-settings"); } catch (err) { toast(err.message, true); return; }
    const st = res.settings, can = !!res.can_edit;
    const order = ["game", "trip", "rehearsal", "meeting", "fundraiser", "other", "deadline"];
    openSheet(`<div class="ev-sh-head"><h2 id="ev-sheet-h">⚙ Calendar overlap check</h2><button type="button" class="ev-btn" data-sheet-close>✕</button></div>
<p class="ev-sh-sub">Super Admin or events:manage · changes are logged${can ? "" : " · <b>view only</b>"}</p>
<div class="ev-sh-body"><b class="ev-sh-k">EVENING WINDOW (for untimed “evening” categories)</b>
<div class="ev-f-row"><label class="ev-f"><span>Starts</span><input type="time" data-set="evening_start" value="${esc(st.evening_start)}"${can ? "" : " disabled"}></label><label class="ev-f"><span>Ends</span><input type="time" data-set="evening_end" value="${esc(st.evening_end)}"${can ? "" : " disabled"}></label></div>
<b class="ev-sh-k">UNTIMED EVENTS IN EACH CATEGORY COUNT AS</b>
${order.map((t) => `<label class="ev-set-row"><span>${esc(FORM_LABEL[t])}</span><select data-mode="${t}"${can ? "" : " disabled"}>${Object.entries(MODE_LABEL).map(([k, v]) => `<option value="${k}"${st.modes[t] === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>`).join("")}
<p class="ev-note">Timed events always use their own times. Multi-day untimed events apply the rule on each day.</p></div>
<div class="ev-sh-foot"><button type="button" class="ev-btn" data-sheet-close>Close</button>${can ? '<button type="button" class="ev-btn ev-primary" data-settings-save>Save settings</button>' : ""}</div>`, "ev-sheet-side");
    const sh = root.querySelector("[data-sheet]");
    sheetDone = async (r) => {
      if (r !== "save") return;
      const body = { evening_start: sh.querySelector('[data-set="evening_start"]').value, evening_end: sh.querySelector('[data-set="evening_end"]').value, modes: {} };
      sh.querySelectorAll("[data-mode]").forEach((x) => { body.modes[x.dataset.mode] = x.value; });
      try {
        const out = await api("/api/admin/caldev/overlap-settings", { method: "PUT", body: JSON.stringify(body) });
        toast(out.changed ? `✓ Overlap settings saved (${out.changed} change${out.changed === 1 ? "" : "s"})` : "No changes");
      } catch (err) { toast(err.message || "Not saved", true); }
    };
  }

  // Finished keeps exactly the Schedule Board behaviour.
  async function finished() {
    if (!canNotify) return;
    if (!confirm("Email calendar subscribers that the schedule board is finished/updated? Fundraising subscribers are not included.")) return;
    try {
      const result = await api("/api/admin/caldev/notify-finished", { method: "POST", body: JSON.stringify({}) });
      const email = result?.email_list || {};
      if (email.skipped) { alert(email.detail || "No calendar subscribers to email (or email sending is not configured)."); return; }
      if (email.ok) { alert(`Finished — emailed ${email.sent || 0} calendar subscriber${email.sent === 1 ? "" : "s"}.`); return; }
      alert(email.detail || "Could not email calendar subscribers.");
    } catch (error) { alert(error.message || "Could not email calendar subscribers."); }
  }

  function go(dm) {
    const ys = years();
    let y = state.year, m = state.month + dm;
    if (m < 0) { m = 11; y -= 1; } if (m > 11) { m = 0; y += 1; }
    if (y < ys[0] || y > ys[2]) return;
    state.year = y; state.month = m; state.picked = ""; render();
  }
  const isPhone = () => window.matchMedia("(max-width: 760px)").matches;

  function bind() {
    root.addEventListener("click", (e) => {
      const t = e.target.closest("button, [data-day], [data-scrim], [data-sheet-scrim]");
      if (!t) return;
      if (t.matches("[data-scrim]")) { closeForm(); return; }
      if (t.matches("[data-sheet-scrim]")) return closeSheet(false);
      if (t.matches("[data-sheet-close]")) return closeSheet(false);
      if (t.matches("[data-sheet-ok]")) return closeSheet(true);
      if (t.matches("[data-sheet-force]")) return closeSheet("force");
      if (t.matches("[data-series-go]")) return closeSheet("go");
      if (t.matches("[data-group-go]")) return closeSheet("group");
      if (t.matches("[data-settings-save]")) return closeSheet("save");
      if (t.matches("[data-more]")) { const l = root.querySelector("[data-more-list]"); l.hidden = !l.hidden; t.setAttribute("aria-expanded", String(!l.hidden)); t.textContent = l.hidden ? t.textContent.replace("▴", "▾") : t.textContent.replace("▾", "▴"); return; }
      if (t.matches("[data-cancel-date]")) return setCancelled(true);
      if (t.matches("[data-uncancel]")) return setCancelled(false);
      if (t.matches("[data-group]")) return openGroup(state.editing);
      const act = t.dataset.act;
      if (act === "settings") return openSettings();
      if (act === "prev") return go(-1);
      if (act === "next") return go(1);
      if (act === "today") { const d = todayIso(); state.year = Number(d.slice(0, 4)); state.month = Number(d.slice(5, 7)) - 1; state.picked = isPhone() ? d : ""; return render(); }
      if (act === "new") return openForm(null, state.picked || (state.year === Number(todayIso().slice(0, 4)) && state.month === Number(todayIso().slice(5, 7)) - 1 ? todayIso() : iso(state.year, state.month, 1)));
      if (act === "undo") return undo();
      if (act === "finished") return finished();
      if (act === "focus") { const on = document.body.classList.toggle("ev-focus"); t.setAttribute("aria-pressed", String(on)); return; }
      if (act === "undated") { const box = root.querySelector("[data-undated]"); box.hidden = !box.hidden; t.setAttribute("aria-expanded", String(!box.hidden)); return; }
      if (t.dataset.chip) { const id = t.dataset.chip; if (state.show.has(id)) state.show.delete(id); else state.show.add(id); return render(); }
      if (t.dataset.add) { e.stopPropagation(); return openForm(null, t.dataset.add); }
      if (t.dataset.edit) {
        if (isPhone() && t.closest(".ev-grid")) { state.picked = t.closest("[data-day]").dataset.day; return render(); }
        const ev = state.events.find((x) => String(x.id) === t.dataset.edit); if (ev) openForm(ev); return;
      }
      if (t.matches("[data-close]")) return closeForm();
      if (t.matches("[data-delete]")) return remove();
      if (t.matches("[data-add-skip]")) {
        const inp = root.querySelector("[data-skip]"); if (inp.value && !state.exceptions.includes(inp.value)) state.exceptions.push(inp.value);
        inp.value = ""; renderSkips(); return;
      }
      if (t.dataset.unskip) { state.exceptions = state.exceptions.filter((x) => x !== t.dataset.unskip); renderSkips(); return; }
      if (t.dataset.cmd) return richCmd(t.dataset.cmd);
      if (t.dataset.day && isPhone()) { state.picked = t.dataset.day; render(); }
    });
    root.addEventListener("change", (e) => {
      const t = e.target;
      if (t.matches("[data-month]")) { state.month = Number(t.value); state.picked = ""; render(); }
      else if (t.matches("[data-year]")) { state.year = Number(t.value); state.picked = ""; render(); }
      else if (t.name === "all_day") root.querySelector("[data-times]").hidden = t.checked;
      else if (t.name === "repeat") root.querySelector("[data-rep]").hidden = t.value !== "yes";
      else if (t.name === "track") root.querySelector("[data-fund-note]").hidden = t.value !== "fundraiser";
      else if (t.matches("[data-color]")) { root.querySelector("[data-desc]").focus(); document.execCommand("foreColor", false, t.value); }
      else if (t.matches("[data-size]") && t.value) {
        const ed = root.querySelector("[data-desc]"); ed.focus(); document.execCommand("fontSize", false, "7");
        ed.querySelectorAll('font[size="7"]').forEach((n) => { const s = document.createElement("span"); s.style.fontSize = t.value; while (n.firstChild) s.appendChild(n.firstChild); n.replaceWith(s); });
        t.value = "";
      }
    });
    root.addEventListener("submit", save);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !root.querySelector("[data-sheet]").hidden) { closeSheet(false); return; }
      if (e.key === "Escape" && !root.querySelector("[data-form]").hidden) { closeForm(); return; }
      const inField = e.target.closest("input, textarea, select, [contenteditable]");
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !inField) { e.preventDefault(); undo(); }
    });
    window.addEventListener("resize", () => { if (!isPhone()) state.picked = state.picked; });
  }
  function renderSkips() {
    root.querySelector("[data-skips]").innerHTML = state.exceptions.sort().map((d) => `<li>${esc(d)} <button type="button" data-unskip="${d}" aria-label="Remove ${d}">✕</button></li>`).join("");
  }
  function richCmd(cmd) {
    const ed = root.querySelector("[data-desc]");
    if (cmd === "link") {
      const url = safeUrl(window.prompt("Link goes to (web address):", "https://"));
      if (!url) return;
      ed.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount && !sel.isCollapsed && ed.contains(sel.anchorNode)) document.execCommand("createLink", false, url);
      else document.execCommand("insertHTML", false, `<a href="${esc(url)}">Click Here</a>`);
      return;
    }
    ed.focus(); document.execCommand(cmd, false, null);
  }

  async function start() {
    const d = todayIso();
    state.year = Number(d.slice(0, 4)); state.month = Number(d.slice(5, 7)) - 1;
    const q = new URLSearchParams(location.search).get("month");
    if (/^\d{4}-\d{2}$/.test(q || "") && years().includes(Number(q.slice(0, 4)))) { state.year = Number(q.slice(0, 4)); state.month = Number(q.slice(5, 7)) - 1; }
    shell(); bind();
    if (isPhone()) state.picked = state.year === Number(d.slice(0, 4)) && state.month === Number(d.slice(5, 7)) - 1 ? d : "";
    try { await load(); } catch (err) { setStatus(err.message || "Could not load events", true); }
    render();
  }
  start();
})();
