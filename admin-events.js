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
<form class="ev-dialog" data-form role="dialog" aria-modal="true" aria-labelledby="ev-form-h" hidden novalidate></form>`;
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
  function openForm(ev, dateKey) {
    state.editing = ev || null;
    state.exceptions = [];
    const f = ev ? payloadOf(ev) : { title: "", description: "", location: "", start_date: dateKey || todayIso(), end_date: "", start_time: "", end_time: "", all_day: true, track: "rehearsal" };
    let suggested = false;
    if (ev && f.track === "other" && FUNDRAISER_RE.test(`${f.title} ${plain(f.description)}`)) { f.track = "fundraiser"; suggested = true; }
    const title = ev ? "Edit event" : `New event · ${longDate(f.start_date)}`;
    const form = root.querySelector("[data-form]");
    form.innerHTML = `
<div class="ev-f-grab" aria-hidden="true"></div>
<div class="ev-f-head"><h2 id="ev-form-h">${esc(title)}</h2><button type="button" class="ev-btn" data-close>✕ <span class="ev-lbl">Close</span></button></div>
<div class="ev-f-body">
<label class="ev-f ev-f-wide"><span>Title</span><input name="title" maxlength="200" required value="${esc(f.title)}" placeholder="Event title"></label>
<div class="ev-f-row">
  <label class="ev-f"><span>Date</span><input name="start_date" type="date" value="${esc(f.start_date)}"></label>
  <label class="ev-f"><span>End date (optional)</span><input name="end_date" type="date" value="${esc(f.end_date)}"></label>
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
  ${ev ? '<button type="button" class="ev-btn ev-danger" data-delete>🗑 Delete</button>' : ""}
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
    state.editing = null;
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

  async function save(e) {
    e.preventDefault();
    if (state.busy) return;
    const p = readForm();
    if (!p.title) { toast("Title is required", true); return; }
    if (!p.start_date && !p.repeat) { toast("Date is required", true); return; }
    const { repeat, days, months, ...body } = p;
    state.busy = true; setStatus("Saving…");
    try {
      if (state.editing) {
        const before = payloadOf(state.editing);
        const saved = await apiUpdate(state.editing.id, body);
        pushUndo(`Edit “${saved.title}”`, [{ type: "put", id: saved.id, payload: before }]);
        replace(saved);
        closeForm(); toast(`✓ Saved “${saved.title}”`, false, true);
      } else if (repeat) {
        const dates = repeatDates(p);
        if (!dates.length) { toast("Choose at least one weekday and one month to repeat", true); return; }
        const made = [];
        for (const d of dates) { made.push(await apiCreate({ ...body, start_date: d, end_date: "" })); }
        state.events.push(...made);
        pushUndo(`Add ${made.length} “${p.title}” dates`, made.map((x) => ({ type: "delete", id: x.id })));
        closeForm(); toast(`✓ Added ${made.length} “${p.title}” dates`, false, true);
      } else {
        const made = await apiCreate(body);
        state.events.push(made);
        pushUndo(`Add “${made.title}”`, [{ type: "delete", id: made.id }]);
        if (state.picked) state.picked = dayOf(made) || state.picked;
        closeForm(); toast(`✓ Added “${made.title}”`, false, true);
      }
      setStatus("✓ Saved · live on the public Calendar");
    } catch (err) {
      toast(err.message || "Save failed", true); setStatus("Not saved", true);
    } finally { state.busy = false; render(); }
  }
  function replace(row) { const i = state.events.findIndex((x) => String(x.id) === String(row.id)); if (i >= 0) state.events[i] = row; else state.events.push(row); }

  async function remove() {
    const ev = state.editing; if (!ev || state.busy) return;
    if (!window.confirm("Delete this Schedule Board event? Meetings will also be removed from Boosters.")) return;
    state.busy = true; setStatus("Deleting…");
    try {
      await apiDelete(ev.id);
      state.events = state.events.filter((x) => String(x.id) !== String(ev.id));
      pushUndo(`Delete “${ev.title}”`, [{ type: "restore", row: { id: ev.id, ...payloadOf(ev) } }]);
      closeForm(); toast(`🗑 Deleted “${ev.title}”`, false, true);
      setStatus("✓ Saved · live on the public Calendar");
    } catch (err) { toast(err.message || "Delete failed", true); setStatus("Not deleted", true); }
    finally { state.busy = false; render(); }
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
      const t = e.target.closest("button, [data-day], [data-scrim]");
      if (!t) return;
      if (t.matches("[data-scrim]")) { closeForm(); return; }
      const act = t.dataset.act;
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
