// Site Studio · Form Builder (plan 2.21). My forms, builder, sign-ups viewer, link review.
(() => {
  const root = document.getElementById('fb-root');
  const ME = Number(document.body.dataset.me); const SUPER = document.body.dataset.super === '1'; const CAN_DELETE = document.body.dataset.canDelete === '1';
  const put = (...kids) => root.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return n;
  };
  const api = async (path, method = 'GET', body) => {
    const res = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const out = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => ({})) : {};
    if (!res.ok) { const e = new Error(out.detail || `Request failed (${res.status})`); e.status = res.status; e.body = out; throw e; }
    return out;
  };
  let toastT = 0;
  const toast = (msg, bad) => { let t = document.querySelector('.fb-toast'); if (!t) { t = el('div', { class: 'fb-toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); } t.textContent = msg; t.classList.toggle('bad', Boolean(bad)); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4200); };
  const fmt = (s) => { if (!s) return ''; const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`); return Number.isNaN(+d) ? s : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  const TYPES = [
    ['text', 'Aa', 'Short text'], ['textarea', '¶', 'Long text'], ['email', '@', 'Email'], ['phone', '☎', 'Phone'], ['number', '#', 'Number'], ['date', '📅', 'Date'],
    ['select', '▾', 'Dropdown'], ['radio', '◉', 'Radio (pick one)'], ['checkbox', '☑', 'Checkbox(es)'], ['heading', '—', 'Section heading'], ['note', 'ℹ', 'Note text'], ['pricing', '$', 'Price list'],
  ];
  const TYPE_LABEL = Object.fromEntries(TYPES.map(([k, , l]) => [k, l.replace(/ \(.*/, '')]));
  const HAS_OPTIONS = new Set(['select', 'radio', 'checkbox']);
  const INPUT = new Set(['text', 'textarea', 'email', 'phone', 'number', 'date', 'select', 'radio', 'checkbox']);
  const rid = () => Math.random().toString(36).slice(2, 8);
  const slugName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^[^a-z]+|_+$/g, '').slice(0, 40);

  // ---------------- router ----------------
  let cleanup = null;
  async function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    const h = location.hash.replace(/^#\/?/, '');
    const [view, id, sub] = h.split('/');
    put(el('p', { class: 'ev-loading', text: 'Loading…' }));
    try {
      if (view === 'edit' && id) await builder(Number(id));
      else if (view === 'subs') await submissions(id ? Number(id) : 0, sub ? Number(sub) : 0);
      else if (view === 'links' && SUPER) await linkQueue();
      else await myForms();
    } catch (e) { put(el('div', { class: 'fb-error' }, el('h2', { text: 'Could not load' }), el('p', { text: e.message }), el('a', { href: '#/', class: 'fb-btn', text: '← My forms' }))); }
  }
  window.addEventListener('hashchange', () => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); route(); });

  const topNav = (current) => el('nav', { class: 'fb-tabs', 'aria-label': 'Form Builder areas' },
    el('a', { href: '#/', 'aria-current': current === 'forms' ? 'page' : null, text: '📋 My forms' }),
    el('a', { href: '#/subs', 'aria-current': current === 'subs' ? 'page' : null, text: '📥 Submitted forms' }),
    SUPER ? el('a', { href: '#/links', 'aria-current': current === 'links' ? 'page' : null, text: '🔗 Link review' }) : null);

  // ---------------- My forms ----------------
  async function myForms() {
    const data = await api('/api/admin/forms-v2');
    const notices = await api('/api/admin/studio-notices').catch(() => ({ notices: [] }));
    const unread = (notices.notices || []).filter((n) => !n.read_at);
    const newBtn = el('button', { class: 'fb-btn fb-primary', type: 'button', text: '＋ New form', onclick: async () => {
      const title = prompt('Name the new form', 'New sign-up form'); if (!title) return;
      const out = await api('/api/admin/forms-v2', 'POST', { title }); location.hash = `#/edit/${out.id}`;
    } });
    const fromLegacy = (data.legacy_forms || []).length ? el('select', { 'aria-label': 'Copy an existing form', onchange: async (e) => {
      if (!e.target.value) return; const out = await api('/api/admin/forms-v2', 'POST', { from_legacy: e.target.value }); location.hash = `#/edit/${out.id}`;
    } }, el('option', { value: '', text: 'Copy an existing form…' }), ...data.legacy_forms.map((f) => el('option', { value: f.slug, text: f.title }))) : null;
    const rows = (data.forms || []).map((f) => {
      const draft = f.draft_saved_at ? (Number(f.draft_by) === ME ? '✎ You have unsaved changes' : `✎ ${f.draft_by_name} is editing`) : '';
      return el('article', { class: 'fb-row', 'data-form-row': f.id },
        el('div', { class: 'fb-row-main' }, el('h3', {}, el('a', { href: `#/edit/${f.id}`, text: f.title })),
          el('p', { class: 'fb-muted', text: `Saved ${fmt(f.updated_at)} by ${f.updated_by_name || 'staff'} · ${f.pages.length ? `on ${f.pages.map((p) => p.title).join(', ')}` : 'not on a page yet'}` }),
          draft ? el('p', { class: 'fb-draft', text: draft }) : null),
        el('div', { class: 'fb-row-stats' }, el('a', { href: `#/subs/${f.id}`, class: 'fb-count', text: `${f.submissions} sign-up${f.submissions === 1 ? '' : 's'}` })),
        el('div', { class: 'fb-row-act' },
          el('a', { class: 'fb-btn', href: `#/edit/${f.id}`, text: 'Edit' }),
          el('button', { class: 'fb-btn', type: 'button', text: 'Duplicate', onclick: async () => { const o = await api(`/api/admin/forms-v2/${f.id}/duplicate`, 'POST', {}); toast('Copied'); location.hash = `#/edit/${o.id}`; } }),
          el('button', { class: 'fb-btn fb-danger', type: 'button', text: 'Delete', onclick: () => deleteForm(f) })));
    });
    put(topNav('forms'), el('section', { class: 'fb-page' },
      el('header', { class: 'fb-head' }, el('div', {}, el('h1', { text: 'My forms' }), el('p', { class: 'fb-muted', text: 'Build a sign-up form once, then add it to any page as a Form block. Saving updates every page that uses it right away.' })), el('div', { class: 'fb-head-act' }, fromLegacy, newBtn)),
      unread.length ? el('div', { class: 'fb-notice', role: 'status' }, ...unread.map((n) => el('p', { text: `🔔 ${n.text}` })), el('button', { type: 'button', class: 'fb-link', text: 'Mark read', onclick: async () => { await api('/api/admin/studio-notices', 'POST', {}); route(); } })) : null,
      rows.length ? el('div', { class: 'fb-list' }, rows) : el('p', { class: 'fb-empty', text: 'No forms yet. Click “New form” or copy an existing one.' })));
  }

  async function deleteForm(f) {
    const dlg = el('dialog', { class: 'fb-dialog' });
    const input = el('input', { 'aria-label': 'Type the form title to confirm', placeholder: f.title });
    const delSubs = el('input', { type: 'checkbox' });
    dlg.append(el('h2', { text: `Delete “${f.title}”?` }),
      el('p', { text: f.pages.length ? `It is on ${f.pages.length} page(s): ${f.pages.map((p) => p.title).join(', ')}. Those pages will show nothing where the form was.` : 'It is not on any page.' }),
      el('p', { text: `${f.submissions} sign-up(s) are kept for 18 months unless you also delete them.` }),
      CAN_DELETE ? el('label', { class: 'fb-check' }, delSubs, ' Also delete its sign-ups now') : null,
      el('label', { class: 'fb-field' }, 'Type the form title to confirm', input),
      el('div', { class: 'fb-dlg-act' }, el('button', { class: 'fb-btn', type: 'button', text: 'Cancel', onclick: () => dlg.close() }),
        el('button', { class: 'fb-btn fb-danger', type: 'button', text: 'Delete form', onclick: async () => {
          try { await api(`/api/admin/forms-v2/${f.id}`, 'DELETE', { confirm_title: input.value, delete_submissions: delSubs.checked }); dlg.close(); toast('Form deleted'); route(); } catch (e) { toast(e.message, true); }
        } })));
    document.body.append(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
  }

  // ---------------- Builder ----------------
  async function builder(id) {
    const data = await api(`/api/admin/forms-v2/${id}`);
    const LS = `fb-draft-${id}`;
    let def = structuredClone(data.definition);
    let baseVersion = data.form.version;
    let savedJson = JSON.stringify(def);
    let selected = def.fields[0]?.id || null;
    let tab = 'build';
    let undo = []; let redo = [];
    let serverSavedAt = null; let lastServer = 0; let dirtySinceServer = false; let serverPaused = '';
    let lockedBy = data.draft?.locked ? data.draft.by_name : '';
    const local = (() => { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch { return null; } })();
    const resumeFrom = data.draft && data.draft.mine ? { definition: data.draft.definition, at: data.draft.saved_at, server: true }
      : local && local.base_version === baseVersion && JSON.stringify(local.definition) !== savedJson ? { definition: local.definition, at: local.at, server: false } : null;
    let showResume = Boolean(resumeFrom);

    const snapshot = () => JSON.stringify(def);
    const commit = (fn) => { undo.push(snapshot()); if (undo.length > 3) undo.shift(); redo = []; fn(); changed(); };
    const isDirty = () => snapshot() !== savedJson;
    let localT = 0;
    function changed() {
      dirtySinceServer = true;
      clearTimeout(localT); localT = setTimeout(() => { try { localStorage.setItem(LS, JSON.stringify({ definition: def, base_version: baseVersion, at: new Date().toISOString() })); } catch {} }, 2000);
      render();
    }
    async function serverDraft(force = false) {
      if (!isDirty() || serverPaused || lockedBy) return;
      if (!force && Date.now() - lastServer < 60_000) return;
      lastServer = Date.now();
      try { await api(`/api/admin/forms-v2/${id}/draft`, 'PUT', { definition: def, base_version: baseVersion }); serverSavedAt = new Date(); dirtySinceServer = false; renderStatus(); }
      catch (e) { if (e.body?.code === 'draft_cap') serverPaused = e.message; if (e.body?.code === 'locked') lockedBy = e.message; renderStatus(); }
    }
    const tick = setInterval(() => serverDraft(false), 15_000);
    const beacon = () => { if (isDirty() && !lockedBy && Date.now() - lastServer > 60_000) navigator.sendBeacon?.(`/api/admin/forms-v2/${id}/draft`, new Blob([JSON.stringify({ definition: def, base_version: baseVersion })], { type: 'application/json' })); };
    const beforeUnload = (e) => { if (isDirty()) { beacon(); e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('visibilitychange', beacon);
    const keys = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };
    document.addEventListener('keydown', keys);
    cleanup = () => { clearInterval(tick); window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('visibilitychange', beacon); document.removeEventListener('keydown', keys); };
    const doUndo = () => { if (!undo.length) return; redo.push(snapshot()); def = JSON.parse(undo.pop()); changed(); };
    const doRedo = () => { if (!redo.length) return; undo.push(snapshot()); def = JSON.parse(redo.pop()); changed(); };

    async function save(extra = {}) {
      const btn = root.querySelector('[data-save]'); if (btn) btn.disabled = true;
      try {
        const out = await api(`/api/admin/forms-v2/${id}/save`, 'POST', { definition: def, base_version: baseVersion, ...extra });
        baseVersion = out.version; savedJson = snapshot(); localStorage.removeItem(LS); serverSavedAt = null; showResume = false;
        const pend = (out.links || []).filter((l) => l.status !== 'ok');
        toast(pend.length ? `Saved. ${pend.length} link(s) wait for a Super Admin and stay plain text until approved.` : `Saved · live on ${out.pages} page${out.pages === 1 ? '' : 's'}`);
        render();
      } catch (e) {
        if (e.body?.code === 'link_blocked') {
          if (confirm(`${e.message}\n\nOK = save and send it to a Super Admin (the link stays disabled). Cancel = go back and fix it.`)) return save({ send_to_admin: true });
        } else toast(e.message, true);
      } finally { if (btn) btn.disabled = false; }
    }

    const addField = (type, at = def.fields.length) => commit(() => {
      const label = { heading: 'New section', note: '', pricing: 'Prices' }[type] ?? TYPE_LABEL[type];
      const used = new Set(def.fields.map((f) => f.name)); let name = slugName(label) || type; let n = 2; const b = name; while (used.has(name)) name = `${b}_${n++}`;
      const f = { id: `f${rid()}`, type, name, label, help: '', placeholder: '', required: false, width: ['textarea', 'radio', 'checkbox', 'heading', 'note', 'pricing'].includes(type) ? 'full' : 'half' };
      if (HAS_OPTIONS.has(type)) f.options = [{ id: `o${rid()}`, value: 'Option 1', label: 'Option 1' }, { id: `o${rid()}`, value: 'Option 2', label: 'Option 2' }];
      if (type === 'radio') f.display = 'buttons';
      if (type === 'note') { f.text = 'Add a note for families.'; f.style = ''; }
      if (type === 'pricing') f.items = [{ label: 'S – XL', price: '$0.00', values: [] }];
      def.fields.splice(at, 0, f); selected = f.id;
    });
    const move = (fid, to) => commit(() => { const i = def.fields.findIndex((f) => f.id === fid); const [f] = def.fields.splice(i, 1); def.fields.splice(Math.max(0, Math.min(def.fields.length, to)), 0, f); });

    function render() {
      const sel = def.fields.find((f) => f.id === selected);
      put(
        el('div', { class: 'fb-bar' },
          el('a', { href: '#/', class: 'fb-back', text: '← My forms' }),
          el('h1', { text: def.title }),
          el('span', { class: 'fb-chip', text: `Used on ${data.pages.length} page${data.pages.length === 1 ? '' : 's'} · Save updates them right away` }),
          el('span', { class: 'fb-status', 'data-status': '' }),
          el('div', { class: 'fb-seg', role: 'tablist' },
            el('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === 'build'), text: '1. Build the form', onclick: () => { tab = 'build'; render(); } }),
            el('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === 'mail'), text: '2. How it’s submitted', onclick: () => { tab = 'mail'; render(); } })),
          el('button', { type: 'button', class: 'fb-btn', disabled: !undo.length, title: 'Undo (up to 3) · Ctrl+Z', onclick: doUndo, text: `↶ Undo (${undo.length})` }),
          el('a', { class: 'fb-btn', href: data.pages[0] ? (data.pages[0].path || `/${data.pages[0].slug}`) : '#', 'aria-disabled': data.pages[0] ? null : 'true', title: data.pages[0] ? null : 'Add this form to a page to preview it there; the public view below shows how it looks.', target: '_blank', rel: 'noopener', text: '👁 Preview' }),
          el('button', { type: 'button', class: 'fb-btn fb-primary', 'data-save': '', disabled: !isDirty() || Boolean(lockedBy), onclick: () => save(), text: '💾 Save' })),
        lockedBy ? el('div', { class: 'fb-lock', role: 'alert' }, el('p', { text: `🔒 ${lockedBy}` }), el('button', { class: 'fb-btn', type: 'button', text: 'Take over editing', onclick: async () => { try { await api(`/api/admin/forms-v2/${id}/draft`, 'PUT', { definition: def, base_version: baseVersion, take_over: true }); lockedBy = ''; lastServer = Date.now(); render(); } catch (e) { toast(e.message, true); } } })) : null,
        el('div', { class: `fb-grid ${tab === 'mail' ? 'fb-grid-mail' : ''}` },
          tab === 'build' ? palette() : null,
          el('div', { class: 'fb-canvas' },
            showResume ? resumeBanner() : null,
            tab === 'build' ? canvas() : mailDesigner()),
          tab === 'build' ? inspector(sel) : null));
      renderStatus();
    }
    function renderStatus() {
      const s = root.querySelector('[data-status]'); if (!s) return;
      s.textContent = serverPaused ? `⏸ ${serverPaused}` : !isDirty() ? `✓ Saved v${baseVersion}` : serverSavedAt ? `● Draft autosaved ${serverSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : '● Unsaved changes (kept in this browser)';
    }
    function resumeBanner() {
      return el('div', { class: 'fb-resume', role: 'status' },
        el('p', {}, el('b', { text: `Resume unsaved changes from ${fmt(resumeFrom.at)}?` }), ' (autosaved draft, private to you, never shown on pages)'),
        el('div', {}, el('button', { class: 'fb-btn fb-primary', type: 'button', text: 'Resume', onclick: () => { undo = []; def = normalizeClient(resumeFrom.definition); showResume = false; changed(); } }),
          el('button', { class: 'fb-btn', type: 'button', text: `Discard (back to last save${data.form.updated_at ? `, ${fmt(data.form.updated_at)}` : ''})`, onclick: async () => { localStorage.removeItem(LS); if (resumeFrom.server) await api(`/api/admin/forms-v2/${id}/draft`, 'DELETE').catch(() => {}); showResume = false; render(); } })));
    }
    const normalizeClient = (d) => ({ ...data.definition, ...d, email: { ...data.definition.email, ...(d?.email || {}) }, fields: Array.isArray(d?.fields) ? d.fields : [] });
    function palette() {
      return el('aside', { class: 'fb-palette', 'aria-label': 'Add a field' }, el('h2', { text: '＋ Add a field' }),
        ...TYPES.map(([type, icon, label]) => el('button', { type: 'button', class: 'fb-tile', draggable: 'true', 'data-add': type,
          ondragstart: (e) => { e.dataTransfer.setData('text/fb-add', type); }, onclick: () => addField(type, selected ? def.fields.findIndex((f) => f.id === selected) + 1 : def.fields.length) }, el('span', { 'aria-hidden': 'true', text: icon }), ` ${label}`)),
        el('p', { class: 'fb-hint', text: 'Drag into the form or click to add after the selected field.' }));
    }
    function canvas() {
      const list = el('ol', { class: 'fb-fields', 'aria-label': 'Form fields' });
      def.fields.forEach((f, i) => {
        const item = el('li', { class: `fb-field-row${f.id === selected ? ' sel' : ''}`, tabindex: '0', draggable: 'true', 'data-field': f.id, 'aria-label': `${TYPE_LABEL[f.type]}: ${f.label || f.text || ''}`,
          onclick: () => { selected = f.id; render(); }, onkeydown: (e) => { if (e.key === 'Enter') { selected = f.id; render(); } if (e.altKey && e.key === 'ArrowUp') move(f.id, i - 1); if (e.altKey && e.key === 'ArrowDown') move(f.id, i + 1); },
          ondragstart: (e) => { e.dataTransfer.setData('text/fb-move', f.id); }, ondragover: (e) => e.preventDefault(),
          ondrop: (e) => { e.preventDefault(); const add = e.dataTransfer.getData('text/fb-add'); const mv = e.dataTransfer.getData('text/fb-move'); if (add) addField(add, i); else if (mv && mv !== f.id) move(mv, i); } },
          el('span', { class: 'fb-grip', 'aria-hidden': 'true', text: '⠿' }),
          el('span', { class: 'fb-type', text: f.type === 'radio' ? 'Radio · button group' : TYPE_LABEL[f.type] }),
          el('div', { class: 'fb-field-body' }, el('b', { text: f.type === 'note' ? (f.text || '').slice(0, 90) : f.label }), f.required ? el('span', { class: 'fb-req', text: ' *' }) : null,
            f.type === 'radio' ? el('div', { class: 'rgp-row fb-pill-prev', 'aria-hidden': 'true' }, ...f.options.map((o) => el('span', { class: 'fb-pill', text: o.label }))) : null,
            HAS_OPTIONS.has(f.type) && f.type !== 'radio' ? el('small', { class: 'fb-muted', text: f.options.map((o) => o.label).join(' · ') }) : null,
            f.type === 'pricing' ? el('small', { class: 'fb-muted', text: f.items.map((it) => `${it.label} ${it.price}`).join(' · ') }) : null,
            f.help ? el('small', { class: 'fb-muted', text: f.help }) : null),
          el('span', { class: 'fb-row-tools' },
            el('button', { type: 'button', class: 'fb-ib', 'aria-label': `Move ${f.label} up`, disabled: i === 0, onclick: (e) => { e.stopPropagation(); move(f.id, i - 1); }, text: '↑' }),
            el('button', { type: 'button', class: 'fb-ib', 'aria-label': `Move ${f.label} down`, disabled: i === def.fields.length - 1, onclick: (e) => { e.stopPropagation(); move(f.id, i + 1); }, text: '↓' }),
            el('button', { type: 'button', class: 'fb-ib fb-x', 'aria-label': `Remove ${f.label}`, onclick: (e) => { e.stopPropagation(); const n = data.answer_counts[f.name] || 0; if (n && !confirm(`${n} sign-up(s) answered “${f.label}”. Their answers are kept, but the field leaves the form. Remove it?`)) return; commit(() => { def.fields.splice(i, 1); if (selected === f.id) selected = def.fields[i]?.id || def.fields[i - 1]?.id || null; }); }, text: '✕' })));
        list.append(item);
      });
      const drop = el('li', { class: 'fb-drop', ondragover: (e) => e.preventDefault(), ondrop: (e) => { e.preventDefault(); const add = e.dataTransfer.getData('text/fb-add'); const mv = e.dataTransfer.getData('text/fb-move'); if (add) addField(add); else if (mv) move(mv, def.fields.length); } }, 'Drop here to add at the end');
      list.append(el('li', { class: 'fb-field-row fb-submit-row' }, el('span', { class: 'fb-type', text: 'Submit button' }), el('div', { class: 'fb-field-body' }, el('b', { text: def.submit_label }))), drop);
      const head = el('div', { class: 'fb-form-head' }, el('span', { class: 'fb-kicker', text: 'FORM' }),
        inlineInput(def.title, (v) => { def.title = v; }, 'Form title', 'fb-title-in'), inlineInput(def.intro, (v) => { def.intro = v; }, 'Intro shown above the fields', 'fb-intro-in', true));
      const links = data.links.filter((l) => !['ok', 'approved'].includes(l.status));
      return el('div', {}, head, links.length ? el('div', { class: 'fb-linkwarn', role: 'status' }, el('b', { text: '⚠ Links waiting or broken: ' }), ...links.map((l) => el('span', { class: 'fb-linkpill', title: l.status, text: `${l.status === 'unreachable' || l.status === 'blocked' ? '⛓️‍💥' : '⏳'} ${l.url}` })), el('small', { text: ' These show as plain text until a Super Admin approves them.' })) : null, list,
        el('h2', { class: 'fb-pv-h', text: 'Public view (what families see)' }), el('div', { class: 'fb-public-preview', 'data-public-preview': '' }, livePreview()));
    }
    const inlineInput = (value, set, label, cls, multi) => { const i = el(multi ? 'textarea' : 'input', { class: cls, 'aria-label': label, placeholder: label, rows: multi ? '2' : null }); i.value = value || ''; let snap = false; i.addEventListener('input', () => { if (!snap) { undo.push(snapshot()); if (undo.length > 3) undo.shift(); snap = true; } set(i.value); dirtySinceServer = true; clearTimeout(localT); localT = setTimeout(() => { try { localStorage.setItem(LS, JSON.stringify({ definition: def, base_version: baseVersion, at: new Date().toISOString() })); } catch {} }, 2000); renderStatus(); const s = root.querySelector('[data-save]'); if (s) s.disabled = !isDirty(); }); i.addEventListener('change', () => { snap = false; render(); }); return i; };
    function livePreview() {
      const wrap = el('div', { class: 'card inkind-card letterman-card fs-card' });
      const form = el('div', { class: 'inkind-form letterman-form form-grid fs-form' });
      def.fields.forEach((f) => {
        if (f.type === 'heading') form.append(el('h3', { class: 'full letterman-section', text: f.label }));
        else if (f.type === 'note') form.append(el('p', { class: 'full letterman-note', text: f.text }));
        else if (f.type === 'pricing') form.append(el('div', { class: 'full letterman-pricing' }, ...f.items.map((it) => el('div', {}, el('span', { text: it.label }), el('b', { text: it.price })))));
        else if (f.type === 'radio') form.append(el('fieldset', { class: 'full rgp' }, el('legend', { text: `${f.label}${f.required ? ' *' : ' (optional)'}` }), el('div', { class: 'rgp-row' }, ...f.options.map((o) => el('label', { class: 'rpl' }, el('input', { type: 'radio', name: `pv-${f.id}`, value: o.value }), el('span', { text: o.label }))))));
        else if (f.type === 'checkbox') form.append(el('fieldset', { class: 'full letterman-choices' }, el('legend', { text: f.label }), ...f.options.map((o) => el('label', { class: 'letterman-choice' }, el('input', { type: 'checkbox' }), ` ${o.label}`))));
        else if (f.type === 'select') form.append(el('label', { class: 'full' }, f.label, el('select', {}, el('option', { text: 'Select' }), ...f.options.map((o) => el('option', { text: o.label })))));
        else if (f.type === 'textarea') form.append(el('label', { class: 'full' }, f.label, el('textarea', { rows: '3', placeholder: f.placeholder || null })));
        else form.append(el('label', { class: f.width === 'full' ? 'full' : '' }, `${f.label}${f.required ? ' *' : ''}`, el('input', { type: { email: 'email', phone: 'tel', number: 'number', date: 'date' }[f.type] || 'text', placeholder: f.placeholder || null })));
      });
      form.append(el('div', { class: 'full inkind-form-actions' }, el('button', { class: 'btn primary', type: 'button', text: def.submit_label })));
      wrap.append(el('h2', { text: def.title }), def.intro ? el('p', { text: def.intro }) : null, form);
      return wrap;
    }
    function inspector(f) {
      const box = el('aside', { class: 'fb-inspector', 'aria-label': 'Field settings' });
      if (!f) { box.append(el('h2', { text: 'Form settings' }), txt('Submit button words', def.submit_label, (v) => { def.submit_label = v; }), txt('Message after sending', def.success_message, (v) => { def.success_message = v; }, true), el('p', { class: 'fb-muted', text: 'Click a field to change it.' })); return box; }
      box.append(el('h2', { text: `✎ Field: ${TYPE_LABEL[f.type]}${f.label ? ` · ${f.label}` : ''}` }));
      if (f.type === 'note') box.append(txt('Note text (links need Super Admin review)', f.text, (v) => { f.text = v; }, true), sel('Style', f.style, [['', 'Plain'], ['strong', 'Bold'], ['italic', 'Italic']], (v) => { f.style = v; }));
      else box.append(txt(f.type === 'radio' ? 'Label (shown as the group title)' : 'Label', f.label, (v) => { f.label = v; }));
      if (INPUT.has(f.type)) {
        box.append(el('label', { class: 'fb-check' }, Object.assign(el('input', { type: 'checkbox', onchange: (e) => commit(() => { f.required = e.target.checked; }) }), { checked: f.required }), f.type === 'radio' ? ' Required: an option must be picked' : ' Required'));
        box.append(txt('Help text', f.help, (v) => { f.help = v; }));
        if (!HAS_OPTIONS.has(f.type) && f.type !== 'date') box.append(txt('Placeholder', f.placeholder, (v) => { f.placeholder = v; }));
        box.append(sel('Width', f.width, [['half', 'Half'], ['full', 'Full row']], (v) => { f.width = v; }));
      }
      if (HAS_OPTIONS.has(f.type)) {
        const ol = el('div', { class: 'fb-opts' }, el('h3', { text: 'Options · label / saved value' }));
        f.options.forEach((o, oi) => {
          const lab = el('input', { 'aria-label': `Option ${oi + 1} label` }); lab.value = o.label;
          lab.addEventListener('change', () => commit(() => { const old = o.label; o.label = lab.value.trim() || old; if (o.value === old && !(data.answer_counts[f.name])) o.value = o.label; }));
          ol.append(el('div', { class: 'fb-opt' }, el('span', { class: 'fb-grip', 'aria-hidden': 'true', text: '⠿' }), lab, el('code', { title: 'Saved value', text: o.value }),
            el('button', { type: 'button', class: 'fb-ib', 'aria-label': `Move ${o.label} up`, disabled: oi === 0, onclick: () => commit(() => { f.options.splice(oi - 1, 0, f.options.splice(oi, 1)[0]); }), text: '↑' }),
            el('button', { type: 'button', class: 'fb-ib fb-x', 'aria-label': `Delete option ${o.label}`, disabled: f.options.length < 2, onclick: () => { if (!confirm(`Delete option “${o.label}”? Past sign-ups that chose it keep their answer.`)) return; commit(() => { f.options.splice(oi, 1); }); }, text: '✕' })));
        });
        ol.append(el('button', { type: 'button', class: 'fb-btn', text: '＋ Add option', onclick: () => commit(() => { const n = `Option ${f.options.length + 1}`; f.options.push({ id: `o${rid()}`, value: n, label: n }); }) }));
        box.append(ol);
      }
      if (f.type === 'pricing') {
        const pl = el('div', { class: 'fb-opts' }, el('h3', { text: 'Price rows · label / price / which choices' }));
        f.items.forEach((it, ii) => {
          const a = el('input', { 'aria-label': 'Row label' }); a.value = it.label; a.onchange = () => commit(() => { it.label = a.value; });
          const b = el('input', { 'aria-label': 'Price', class: 'fb-sm' }); b.value = it.price; b.onchange = () => commit(() => { it.price = b.value; });
          const c = el('input', { 'aria-label': 'Choices this price applies to, comma separated' }); c.value = it.values.join(', '); c.onchange = () => commit(() => { it.values = c.value.split(',').map((x) => x.trim()).filter(Boolean); });
          pl.append(el('div', { class: 'fb-opt fb-price' }, a, b, c, el('button', { type: 'button', class: 'fb-ib fb-x', 'aria-label': 'Delete row', onclick: () => commit(() => { f.items.splice(ii, 1); }), text: '✕' })));
        });
        pl.append(el('button', { type: 'button', class: 'fb-btn', text: '＋ Add price row', onclick: () => commit(() => { f.items.push({ label: 'Size', price: '$0.00', values: [] }); }) }));
        box.append(pl);
      }
      if (['text', 'number'].includes(f.type)) {
        const sources = def.fields.filter((x) => ['radio', 'select'].includes(x.type));
        if (sources.length && def.fields.some((x) => x.type === 'pricing')) {
          box.append(sel('Check amount against price list', f.price_check?.from || '', [['', 'No check'], ...sources.map((x) => [x.name, x.label])], (v) => { f.price_check = v ? { from: v, autofill: true } : undefined; if (!v) delete f.price_check; }));
        }
      }
      box.append(el('div', { class: 'fb-kv' }, el('span', { text: 'Field name' }), el('code', { text: `{${f.name}}` })));
      if (f.type === 'radio') box.append(el('p', { class: 'fb-tip', text: 'Families see real radio buttons styled as pills: they work with the keyboard (arrow keys) and screen readers. Each pill is at least 44 px tall and wraps on phones. Optional groups get a “Clear choice” link.' }));
      return box;
    }
    function txt(label, value, set, multi) { const i = el(multi ? 'textarea' : 'input', { rows: multi ? '3' : null }); i.value = value || ''; i.addEventListener('change', () => commit(() => set(i.value))); return el('label', { class: 'fb-field' }, label, i); }
    function sel(label, value, opts, set) { const s = el('select', {}, ...opts.map(([v, t]) => el('option', { value: v, text: t }))); s.value = value || ''; s.addEventListener('change', () => commit(() => set(s.value))); return el('label', { class: 'fb-field' }, label, s); }
    function mailDesigner() {
      const e = def.email;
      const people = el('div', { class: 'fb-people' }, ...data.users.map((u) => {
        const cb = el('input', { type: 'checkbox', value: String(u.id) }); cb.checked = e.to_user_ids.includes(u.id);
        cb.addEventListener('change', () => { if (cb.checked && e.to_user_ids.length >= data.max_recipients) { cb.checked = false; toast(`At most ${data.max_recipients} staff get each sign-up.`, true); return; } commit(() => { e.to_user_ids = cb.checked ? [...e.to_user_ids, u.id] : e.to_user_ids.filter((x) => x !== u.id); }); });
        return el('label', { class: 'fb-check' }, cb, ` ${u.name}`);
      }));
      const emails = def.fields.filter((f) => f.type === 'email');
      const tokens = def.fields.filter((f) => INPUT.has(f.type)).map((f) => `{${f.name}}`).join(' ');
      return el('section', { class: 'fb-mail' },
        el('h2', { text: 'Who gets each sign-up' }), el('p', { class: 'fb-muted', text: `Pick up to ${data.max_recipients} staff accounts. They get an email with every answer and a PDF copy.` }), people,
        sel('Replies go to', e.reply_to_field, [['', 'Nobody (no reply-to)'], ...emails.map((f) => [f.name, f.label])], (v) => { e.reply_to_field = v; }),
        txt(`Email subject (you can use {title} ${tokens})`, e.subject, (v) => { e.subject = v; }),
        txt('Short note at the top of the staff email', e.intro, (v) => { e.intro = v; }, true),
        el('label', { class: 'fb-check' }, Object.assign(el('input', { type: 'checkbox', onchange: (ev) => commit(() => { e.confirm_copy = ev.target.checked; }) }), { checked: e.confirm_copy }), ' Send the family a copy of what they sent (to their email field)'),
        el('p', { class: 'fb-muted', text: 'The rows of answers are built for you, in the same layout as today’s Letterman Jacket emails. Daily email budget: 80 per day / 2,700 per month; extra emails wait in a queue and go out the next morning.' }),
        el('button', { type: 'button', class: 'fb-btn', text: '✉ Send me a test email', onclick: async () => { try { const out = await api(`/api/admin/forms-v2/${id}/test-email`, 'POST', { definition: def }); toast(out.result ? `Test: ${out.result}` : out.detail || 'Preview ready'); const pv = root.querySelector('[data-mail-preview]'); if (pv && out.preview) pv.srcdoc = out.preview.html; } catch (err) { toast(err.message, true); } } }),
        el('iframe', { class: 'fb-mail-preview', 'data-mail-preview': '', title: 'Email preview', sandbox: '' }));
    }
    render();
  }

  // ---------------- Submitted forms ----------------
  async function submissions(formId, subId) {
    const menu = await api('/api/admin/forms-v2/submitted');
    window.efhsAdminNav?.setBadge?.('forms-subs', (menu.forms || []).reduce((n, f) => n + (Number(f.new_count) || 0), 0));
    if (!formId) {
      put(topNav('subs'), el('section', { class: 'fb-page' }, el('h1', { text: 'Submitted forms' }),
        el('p', { class: 'fb-muted', text: 'Sign-ups are kept for 18 months, then removed automatically each night.' }),
        menu.forms.length ? el('ul', { class: 'fb-menu' }, ...menu.forms.map((f) => el('li', {}, el('a', { href: `#/subs/${f.id}` }, el('span', { text: f.title }), f.new_count ? el('b', { class: 'fb-badge', text: `${f.new_count} new` }) : null, el('small', { text: `${f.total} total` }))))) : el('p', { class: 'fb-empty', text: 'No forms yet.' })));
      return;
    }
    const params = new URLSearchParams(location.search);
    let filter = { status: '', q: '' }; let offset = 0;
    async function load() {
      const qs = new URLSearchParams({ offset: String(offset), ...(filter.status ? { status: filter.status } : {}), ...(filter.q ? { q: filter.q } : {}) });
      const data = await api(`/api/admin/forms-v2/${formId}/submissions?${qs}`);
      const cols = data.fields.slice(0, 4);
      const table = el('table', { class: 'fb-table' }, el('thead', {}, el('tr', {}, el('th', { text: 'When' }), ...cols.map((c) => el('th', { text: c.label })), el('th', { text: 'Status' }), el('th', { text: 'Email' }))),
        el('tbody', {}, ...data.submissions.map((s) => el('tr', { class: s.status === 'new' ? 'is-new' : '', tabindex: '0', onclick: () => openSub(s.id), onkeydown: (e) => { if (e.key === 'Enter') openSub(s.id); } },
          el('td', { 'data-label': 'When', text: fmt(s.created_at) }), ...cols.map((c) => el('td', { 'data-label': c.label, text: s.values[c.name]?.option || s.values[c.name]?.value || '' })),
          el('td', { 'data-label': 'Status' }, el('span', { class: `fb-st fb-st-${s.status}`, text: s.legacy ? 'old form' : s.status })),
          el('td', { 'data-label': 'Email', text: s.legacy ? (s.delivered ? 'sent' : s.delivery_error || 'not sent') : mailText(s.mail_state) })))));
      const search = el('input', { type: 'search', placeholder: 'Search answers', 'aria-label': 'Search answers' }); search.value = filter.q;
      search.addEventListener('change', () => { filter.q = search.value; offset = 0; load(); });
      const st = el('select', { 'aria-label': 'Status filter', onchange: (e) => { filter.status = e.target.value; offset = 0; load(); } }, ...[['', 'All'], ['new', 'New'], ['seen', 'Seen'], ['done', 'Done'], ['spam', 'Spam']].map(([v, t]) => el('option', { value: v, text: t }))); st.value = filter.status;
      put(topNav('subs'), el('section', { class: 'fb-page' },
        el('header', { class: 'fb-head' }, el('div', {}, el('a', { href: '#/subs', class: 'fb-back', text: '← Submitted forms' }), el('h1', { text: data.form.title })),
          el('div', { class: 'fb-head-act' }, search, st, el('a', { class: 'fb-btn', href: `/api/admin/forms-v2/${formId}/export?offset=0`, text: '⬇ CSV (first 500)' }))),
        data.submissions.length ? table : el('p', { class: 'fb-empty', text: 'No sign-ups match.' }),
        el('div', { class: 'fb-pager' }, offset ? el('button', { class: 'fb-btn', type: 'button', text: '← Newer', onclick: () => { offset = Math.max(0, offset - 50); load(); } }) : null, data.more ? el('button', { class: 'fb-btn', type: 'button', text: 'Older →', onclick: () => { offset += 50; load(); } }) : null)));
    }
    const mailText = (m) => { const v = Object.values(m || {}); if (!v.length) return ''; return v.some((x) => String(x).startsWith('failed')) ? '⚠ failed' : v.includes('email delayed') ? '⏳ delayed' : v.every((x) => x === 'sent') ? '✓ sent' : String(v[0]); };
    async function openSub(sid) {
      const { submission: s, form } = await api(`/api/admin/forms-v2/submissions/${sid}`);
      const dlg = el('dialog', { class: 'fb-dialog fb-sub' });
      const note = el('textarea', { rows: '3', 'aria-label': 'Staff note' }); note.value = s.staff_note;
      const status = el('select', { 'aria-label': 'Status' }, ...['new', 'seen', 'done', 'spam'].map((v) => el('option', { value: v, text: v }))); status.value = s.status === 'new' ? 'seen' : s.status;
      dlg.append(el('h2', { text: `${form.title} · #${s.id}` }), el('p', { class: 'fb-muted', text: `Sent ${fmt(s.created_at)} · email: ${s.legacy ? (s.delivered ? 'sent' : s.delivery_error || 'not sent') : mailText(s.mail_state) || '—'}` }),
        el('dl', { class: 'fb-dl' }, ...Object.entries(s.values).flatMap(([, v]) => [el('dt', { text: v.label }), el('dd', { text: v.option || v.value || '—' })])),
        s.legacy ? el('p', { class: 'fb-muted', text: 'From the old form (read-only).' }) : el('div', {}, el('label', { class: 'fb-field' }, 'Status', status), el('label', { class: 'fb-field' }, 'Staff note (only staff see this)', note)),
        el('div', { class: 'fb-dlg-act' },
          CAN_DELETE ? el('button', { class: 'fb-btn fb-danger', type: 'button', text: 'Delete now', onclick: async () => { if (!confirm('Delete this sign-up now? This cannot be undone.')) return; try { await api(`/api/admin/forms-v2/submissions/${sid}`, 'DELETE'); dlg.close(); toast('Deleted'); load(); } catch (e) { toast(e.message, true); } } }) : null,
          el('button', { class: 'fb-btn', type: 'button', text: 'Close', onclick: () => dlg.close() }),
          s.legacy ? null : el('button', { class: 'fb-btn fb-primary', type: 'button', text: 'Save', onclick: async () => { await api(`/api/admin/forms-v2/submissions/${sid}`, 'PATCH', { status: status.value, staff_note: note.value }); dlg.close(); load(); } })));
      document.body.append(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
      if (!s.legacy && s.status === 'new') api(`/api/admin/forms-v2/submissions/${sid}`, 'PATCH', { status: 'seen' }).catch(() => {});
    }
    await load();
    if (subId) openSub(subId);
    void params;
  }

  // ---------------- Link review (Super Admin) ----------------
  async function linkQueue() {
    const data = await api('/api/admin/link-reviews');
    const host = el('input', { placeholder: 'example.net', 'aria-label': 'Host to block' });
    put(topNav('links'), el('section', { class: 'fb-page' }, el('h1', { text: 'Link review' }),
      data.safe_browsing !== 'configured' ? el('div', { class: 'fb-sb-off', role: 'alert', text: `⚠ ${data.safe_browsing}. New links cannot be safety-checked, so every new link waits here until you approve it.` }) : null,
      el('h2', { text: `Waiting for review (${data.reviews.length})` }),
      data.reviews.length ? el('div', { class: 'fb-list' }, ...data.reviews.map((r) => el('article', { class: 'fb-row' },
        el('div', { class: 'fb-row-main' }, el('h3', { text: r.url || '(unknown)' }), el('p', { class: 'fb-muted', text: `${r.reason || r.check_status} · used in ${r.uses} place(s) · ${fmt(r.created_at)}` }),
          /Safe Browsing unavailable/.test(r.reason || '') ? el('p', { class: 'fb-sb-off', text: 'Safe Browsing unavailable: this link was not safety-checked.' }) : null),
        el('div', { class: 'fb-row-act' },
          el('a', { class: 'fb-btn', href: `https://transparencyreport.google.com/safe-browsing/search?url=${encodeURIComponent(r.url || '')}`, target: '_blank', rel: 'noopener noreferrer', text: 'Check ↗' }),
          el('button', { class: 'fb-btn fb-primary', type: 'button', text: 'Approve', onclick: () => decide(r.id, 'approve') }),
          el('button', { class: 'fb-btn fb-danger', type: 'button', text: 'Reject', onclick: () => decide(r.id, 'reject') }))))) : el('p', { class: 'fb-empty', text: 'Nothing waiting.' }),
      el('h2', { text: `Broken or blocked links in use (${data.broken.length})` }),
      el('ul', {}, ...data.broken.map((b) => el('li', {}, '⛓️‍💥 ', el('code', { text: b.url }), ` · ${b.status} · ${b.reason}`))),
      el('h2', { text: 'Blocked hosts' }),
      el('ul', {}, ...data.blocklist.map((b) => el('li', {}, el('code', { text: b.pattern }), ' ', el('button', { class: 'fb-link', type: 'button', text: 'remove', onclick: async () => { await api(`/api/admin/link-reviews/blocklist/${b.id}`, 'DELETE'); route(); } })))),
      el('div', { class: 'fb-head-act' }, host, el('button', { class: 'fb-btn', type: 'button', text: 'Block host', onclick: async () => { try { await api('/api/admin/link-reviews/blocklist', 'POST', { pattern: host.value }); route(); } catch (e) { toast(e.message, true); } } }))));
    async function decide(rid_, decision) { const note = decision === 'reject' ? prompt('Why? (shown to the person who added it)') || '' : ''; await api(`/api/admin/link-reviews/${rid_}`, 'POST', { decision, note }); toast(decision === 'approve' ? 'Approved' : 'Rejected'); route(); }
  }

  route();
})();
