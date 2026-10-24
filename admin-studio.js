(() => {
  const slug = document.body.dataset.slug;
  const api = `/api/admin/studio/pages/${slug}`;
  const $ = (s) => document.querySelector(s);
  const COLS = 12;
  const PALETTE = [
    ['heading', 'Heading', () => ({ text: 'New heading', level: 2 })],
    ['text', 'Paragraph', () => ({ rich: { paragraphs: [[{ text: 'New text' }]] } })],
    ['button', 'Button', () => ({ label: 'Learn more', href: '/contact.html' })],
    ['image', 'Image', () => ({ src: '/assets/efhs-logo.png', alt: '' })],
    ['card', 'Card', () => ({ children: [{ id: uid('c'), type: 'text', props: { rich: { paragraphs: [[{ text: 'Card text' }]] } } }] })],
    ['logos', 'School logos', () => ({ auto: true })],
    ['divider', 'Divider', () => ({})],
    ['spacer', 'Spacer', () => ({})],
    ['html', 'Raw HTML (admin)', () => ({ html: '<p>HTML</p>' })],
  ];
  let layout = null; let state = null; let previewTimer = 0; let selected = null; let mode = localStorage.getItem('studio-mode') || 'simple';
  function uid(p = 'b') { return `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
  const status = (t) => { $('[data-status]').textContent = t; };
  const showErrors = (list = []) => { const ul = $('[data-errors]'); ul.innerHTML = ''; list.forEach((e) => { const li = document.createElement('li'); li.textContent = e; ul.append(li); }); };
  const call = async (path, method, body, raw) => {
    const init = { method, credentials: 'same-origin' };
    if (raw) init.body = raw; else if (body) { init.headers = { 'content-type': 'application/json' }; init.body = JSON.stringify(body); }
    const r = await fetch(path, init);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { showErrors(data.errors || [data.detail || `Error ${r.status}`]); throw new Error(data.detail || r.status); }
    showErrors([]); return data;
  };
  const textOf = (rich) => (rich?.paragraphs || []).map((p) => p.map((r) => r.text).join('')).join('\n\n');
  const richFrom = (text) => ({ paragraphs: String(text).split(/\n\s*\n/).filter(Boolean).map((t) => [{ text: t.trim() }]) });
  const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => { if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); }); kids.forEach((k) => k && n.append(k)); return n; };
  const input = (label, value, onInput, multi) => {
    const i = el(multi ? 'textarea' : 'input'); i.value = value ?? '';
    i.addEventListener('input', () => { onInput(i.value); changed(false); });
    return el('label', {}, document.createTextNode(label), i);
  };
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const fits = (section, b, r) => r.x >= 0 && r.y >= 0 && r.w >= 1 && r.h >= 1 && r.x + r.w <= COLS && !section.blocks.some((o) => o !== b && overlaps(r, o));
  const findBlock = (id) => { for (const s of layout.sections) for (const b of s.blocks) if (b.id === id) return { section: s, block: b }; return null; };
  const label = (b) => {
    const p = b.props || {};
    if (b.type === 'heading') return p.text;
    if (b.type === 'text') return textOf(p.rich).slice(0, 80);
    if (b.type === 'button') return `[${p.label}]`;
    if (b.type === 'html') return `${p.locked ? '🔒 ' : ''}HTML ${String(p.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 60)}`;
    if (b.type === 'card') return `Card (${(p.children || []).length} items)`;
    return b.type;
  };

  // ---------- canvas: drag + resize on the 12-col grid ----------
  const renderCanvas = () => {
    const host = $('[data-canvas]'); host.innerHTML = '';
    const canLayout = !!state?.can_layout;
    layout.sections.forEach((section) => {
      const rows = Math.max(2, ...section.blocks.map((b) => b.y + b.h)) + (canLayout ? 1 : 0);
      const head = el('div', { class: 'sc-section-head' }, el('strong', { text: `Section ${section.id}` }), el('span', { text: section.flow ? ' · matches legacy layout' : ' · grid' }));
      const grid = el('div', { class: 'sc-grid', style: `grid-template-rows:repeat(${rows},40px)` });
      grid.dataset.section = section.id;
      section.blocks.forEach((b) => {
        const box = el('div', { class: `sc-block${selected === b.id ? ' is-selected' : ''}`, style: `grid-column:${b.x + 1}/span ${b.w};grid-row:${b.y + 1}/span ${b.h}`, tabindex: '0' });
        box.dataset.id = b.id;
        box.append(el('span', { class: 'sc-type', text: b.type }), el('span', { class: 'sc-label', text: label(b) || '' }));
        if (canLayout) box.append(el('span', { class: 'sc-resize', title: 'Drag to resize' }));
        box.addEventListener('click', () => { selected = b.id; renderCanvas(); renderInspector(); });
        if (canLayout) box.addEventListener('pointerdown', (e) => startDrag(e, section, b, grid, e.target.classList.contains('sc-resize')));
        grid.append(box);
      });
      host.append(head, grid);
    });
  };
  const startDrag = (e, section, b, grid, resize) => {
    e.preventDefault();
    const rect = grid.getBoundingClientRect(); const colW = rect.width / COLS;
    const start = { x: e.clientX, y: e.clientY, b: { ...b } };
    const move = (ev) => {
      const dx = Math.round((ev.clientX - start.x) / colW); const dy = Math.round((ev.clientY - start.y) / 40);
      const r = resize ? { x: b.x, y: b.y, w: start.b.w + dx, h: start.b.h + dy } : { x: start.b.x + dx, y: start.b.y + dy, w: b.w, h: b.h };
      if (fits(section, b, r) && (r.x !== b.x || r.y !== b.y || r.w !== b.w || r.h !== b.h)) { Object.assign(b, r); renderCanvas(); changed(false); }
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); selected = b.id; renderInspector(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // ---------- inspector ----------
  const propEditors = (host, b) => {
    const p = b.props || (b.props = {});
    if (b.type === 'heading') { host.append(input('Text', p.text, (v) => { p.text = v; })); if (mode === 'advanced' && p.style !== 'kicker') host.append(input('Level (1-4)', p.level || 2, (v) => { p.level = Number(v) || 2; })); }
    if (b.type === 'text') host.append(input('Text (blank line = new paragraph)', textOf(p.rich), (v) => { p.rich = richFrom(v); }, true));
    if (b.type === 'button') { host.append(input('Label', p.label, (v) => { p.label = v; }), input('Link', p.href, (v) => { p.href = v; })); }
    if (b.type === 'image') {
      host.append(input('Image URL', p.src, (v) => { p.src = v; }), input('Alt text (describe the picture)', p.alt, (v) => { p.alt = v; }));
      const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp' });
      file.addEventListener('change', async () => {
        const f = file.files[0]; if (!f) return;
        if (f.size > 10 * 1024 * 1024) { showErrors(['Images must be 10 MB or smaller.']); return; }
        const fd = new FormData(); fd.append('file', f); status('Uploading…');
        const out = await call(`${api}/upload`, 'POST', null, fd); p.src = out.src; changed(); renderInspector(); status('Image uploaded');
      });
      host.append(el('label', {}, document.createTextNode('Upload an image (max 10 MB)'), file));
    }
    if (b.type === 'logos') host.append(el('p', { class: 'sc-note', text: p.auto ? 'Shows the site logo and the Blue Regiment mark automatically.' : 'Custom logos.' }));
    if (b.type === 'html') {
      if (state.can_html) host.append(input('HTML', p.html, (v) => { p.html = v; p.locked = false; }, true));
      else host.append(el('p', { class: 'sc-note', text: '🔒 This part keeps the original page markup. Ask the Super Admin to change it.' }));
    }
    if (b.type === 'card') {
      (p.children || []).forEach((kid, i) => {
        const box = el('fieldset', { class: 'sc-child' }, el('legend', { text: `${kid.type} ${i + 1}` }));
        propEditors(box, kid);
        if (state.can_layout) box.append(el('button', { type: 'button', text: 'Remove from card', onclick: () => { p.children.splice(i, 1); changed(); renderInspector(); } }));
        host.append(box);
      });
      if (state.can_layout) {
        const sel = el('select'); ['text', 'heading', 'button', 'image', 'divider'].forEach((t) => sel.append(el('option', { value: t, text: t })));
        host.append(el('div', { class: 'sc-row' }, sel, el('button', { type: 'button', text: 'Add to card', onclick: () => {
          const def = PALETTE.find(([t]) => t === sel.value); p.children.push({ id: uid('c'), type: sel.value, props: def[2]() }); changed(); renderInspector();
        } })));
      }
    }
  };
  const renderInspector = () => {
    const host = $('[data-inspector]'); host.innerHTML = '';
    const found = selected && findBlock(selected);
    if (!found) { host.append(el('p', { class: 'sc-note', text: 'Click a block to edit it.' })); return; }
    const { section, block: b } = found;
    host.append(el('h3', { text: `${b.type} block` }));
    propEditors(host, b);
    if (state.can_layout) {
      if (mode === 'advanced') {
        const pos = el('div', { class: 'sc-pos' });
        ['x', 'y', 'w', 'h'].forEach((k) => pos.append(input(k, b[k], (v) => { const r = { ...b, [k]: Number.parseInt(v, 10) }; if (fits(section, b, r)) { b[k] = r[k]; renderCanvas(); } })));
        host.append(pos);
        const order = input('Phone order (blank = same)', b.mobile?.order ?? '', (v) => { b.mobile = { ...(b.mobile || {}), order: v === '' ? undefined : Number(v) }; });
        const hide = el('input', { type: 'checkbox' }); hide.checked = !!b.mobile?.hidden;
        hide.addEventListener('change', () => { b.mobile = { ...(b.mobile || {}), hidden: hide.checked }; changed(false); });
        host.append(order, el('label', {}, hide, document.createTextNode(' Hide on phones')));
      }
      host.append(el('button', { type: 'button', class: 'danger', text: 'Delete block', onclick: () => {
        if (b.type === 'html' && b.props?.locked && !state.can_html) return;
        section.blocks = section.blocks.filter((x) => x !== b); selected = null; changed();
      } }));
    }
  };
  const renderPalette = () => {
    const host = $('[data-palette]'); host.innerHTML = '';
    if (!state.can_layout) { host.append(el('p', { class: 'sc-note', text: 'You can change words, links and pictures. Layout changes need the “can also change layout” permission.' })); return; }
    PALETTE.filter(([t]) => t !== 'html' || state.can_html).filter(([t]) => mode === 'advanced' || !['spacer', 'html'].includes(t)).forEach(([type, name, make]) => {
      host.append(el('button', { type: 'button', text: `+ ${name}`, onclick: () => {
        const section = (selected && findBlock(selected)?.section) || layout.sections[layout.sections.length - 1];
        const y = Math.max(0, ...section.blocks.map((b) => b.y + b.h));
        const b = { id: uid(), type, x: 0, y, w: 12, h: type === 'card' || type === 'image' ? 3 : 1, props: make() };
        section.blocks.push(b); selected = b.id; changed();
      } }));
    });
    if (mode === 'advanced') host.append(el('button', { type: 'button', text: '+ Section', onclick: () => { layout.sections.push({ id: uid('s'), variant: 'content', blocks: [] }); changed(); } }));
  };

  const preview = async () => {
    try {
      const { html } = await call(`${api}/render`, 'POST', { layout });
      $('[data-preview]').srcdoc = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/public-theme.css"><link rel="stylesheet" href="/theme.css"><main id="main">${html}</main>`;
    } catch { /* errors shown */ }
  };
  function changed(rebuild = true) {
    if ($('[data-json]')) $('[data-json]').value = JSON.stringify(layout, null, 2);
    if (rebuild) { renderCanvas(); renderInspector(); renderPalette(); }
    clearTimeout(previewTimer); previewTimer = setTimeout(preview, 300);
    status('Unsaved changes');
  }
  const renderHistory = () => {
    const ol = $('[data-history]'); ol.innerHTML = '';
    (state.versions || []).forEach((v) => {
      const when = new Date(`${String(v.created_at).replace(' ', 'T')}Z`).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
      const li = el('li', { text: `${v.kind === 'restore' ? 'Restored' : 'Published'} by ${v.created_by_name || '?'} · ${when} ET${v.id === state.page.live_version_id ? ' (live)' : ''} ` });
      if (v.id !== state.page.live_version_id) li.append(el('button', { type: 'button', text: 'Restore', onclick: async () => { await call(`${api}/restore`, 'POST', { version_id: v.id }); await load(); status('Restored'); } }));
      ol.append(li);
    });
  };
  const setMode = (m) => {
    mode = m; localStorage.setItem('studio-mode', m);
    document.body.dataset.mode = m;
    document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    renderPalette(); renderInspector();
  };
  async function load() {
    state = await call(api, 'GET');
    $('[data-slug-label]').textContent = `· ${state.page.title || slug}`;
    const starter = JSON.parse($('#studio-starter').textContent || 'null');
    layout = state.draft?.layout || state.live_layout || starter;
    if (!layout && state.can_html) { try { layout = (await call(`${api}/migrate`, 'POST', {})).layout; } catch { /* fall through */ } }
    if (!layout) layout = { version: 1, sections: [{ id: 'main', variant: 'content', blocks: [] }] };
    if (state.can_flag) { $('.studio-flag').hidden = false; $('[data-editor]').value = state.page.editor || 'legacy'; }
    if (!state.can_html) { const d = $('[data-json-wrap]'); if (d) d.remove(); }
    renderHistory(); setMode(mode); changed(); status(`Live editor: ${state.page.editor || 'legacy'}`);
  }
  document.addEventListener('click', async (e) => {
    const t = e.target?.closest?.('[data-act],[data-mode],[data-device]'); if (!t) return;
    if (t.dataset.mode) return setMode(t.dataset.mode);
    if (t.dataset.device) { $('[data-preview-wrap]').dataset.device = t.dataset.device; document.querySelectorAll('[data-device]').forEach((b) => b.setAttribute('aria-pressed', String(b === t))); return; }
    const act = t.dataset.act;
    if (act === 'apply-json') { try { layout = JSON.parse($('[data-json]').value); changed(); } catch { showErrors(['That JSON could not be read.']); } return; }
    if (act === 'draft') { await call(`${api}/draft`, 'PUT', { layout }); status('Draft saved'); }
    if (act === 'publish') { await call(`${api}/publish`, 'POST', { layout }); await load(); status('Published'); }
    if (act === 'migrate') { layout = (await call(`${api}/migrate`, 'POST', {})).layout; selected = null; changed(); status('Rebuilt from the current page'); }
  });
  $('[data-editor]').addEventListener('change', async (e) => { await call(`${api}/editor`, 'POST', { editor: e.target.value }); await load(); });
  load().catch(() => status('Could not load'));
})();
