/* Site Studio page editor: WYSIWYG canvas, palette drag, move/resize with
 * snap + no-overlap hints, inline text editing, undo/redo, draft autosave.
 * Autosave writes the DRAFT only. Nothing goes live until Publish is pressed. */
(() => {
  const slug = document.body.dataset.slug;
  const api = `/api/admin/studio/pages/${slug}`;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const UNDO_CAP = 3; // Undo keeps the last 3 changes only (small memory while editing).
  const isMobile = () => window.matchMedia('(max-width: 900px)').matches;
  const COLS = 12; const GAP = 16; const ROW = 40; const DESK = 1180; const PHONE = 390;
  const uid = (p = 'b') => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const rich = (t) => ({ paragraphs: [[{ text: t }]] });
  const TYPE_NAMES = { heading: 'Heading', text: 'Text box', button: 'Button', image: 'Image', card: 'Card', logos: 'Logos', divider: 'Divider', spacer: 'Spacer', html: 'HTML', el: 'Element', group: 'Container', live: 'Live data' };
  const TREE = new Set(['el', 'group', 'live']);
  const liveMake = (source, limit) => () => ({ type: 'live', props: { source, html: (state?.live_templates || {})[source] || '', ...(limit ? { limit } : {}) } });
  // [key, icon, label, make(), {w,h}, flags]
  const PALETTE = [
    ['Big blocks', [
      ['hero', '🦸', 'Hero card', () => ({ type: 'card', props: { className: 'card', children: [
        { id: uid('c'), type: 'heading', props: { level: 2, text: 'Big news' } },
        { id: uid('c'), type: 'text', props: { rich: rich('Tell families what is happening.') } },
        { id: uid('c'), type: 'button', props: { label: 'Learn more', href: '/contact.html' } }] } }), { w: 12, h: 4 }],
      ['card', '🃏', 'Card', () => ({ type: 'card', props: { className: 'card', children: [
        { id: uid('c'), type: 'heading', props: { level: 3, text: 'Card title' } },
        { id: uid('c'), type: 'text', props: { rich: rich('Card text') } }] } }), { w: 4, h: 3 }],
      ['image', '🖼️', 'Image', () => ({ type: 'image', props: { src: '/assets/efhs-photo-1.png', alt: 'Band photo' } }), { w: 4, h: 4 }],
      ['gallery', '🎞️', 'Gallery', () => ({ type: 'card', props: { className: 'card studio-gallery', children: [
        { id: uid('c'), type: 'image', props: { src: '/assets/efhs-photo-1.png', alt: 'Band photo' } },
        { id: uid('c'), type: 'image', props: { src: '/assets/efhs-photo-2.png', alt: 'Band photo' } }] } }), { w: 12, h: 5 }],
    ]],
    ['Text & links', [
      ['heading', '🔤', 'Heading', () => ({ type: 'heading', props: { level: 2, text: 'New heading' } }), { w: 12, h: 1 }],
      ['text', '📝', 'Text box', () => ({ type: 'text', props: { rich: rich('New text. Click to type.') } }), { w: 6, h: 2 }],
      ['button', '🔘', 'Button', () => ({ type: 'button', props: { label: 'Learn more', href: '/contact.html' } }), { w: 3, h: 1 }],
      ['menulink', '🧭', 'Menu link', () => ({ type: 'button', props: { label: 'Calendar', href: '/calendar.html', style: 'secondary' } }), { w: 3, h: 1 }],
    ]],
    ['Form bits', [
      ['dropdown', '⬇️', 'Dropdown', null, null, 'soon'],
      ['radio', '⚪', 'Radio', null, null, 'soon'],
      ['checkbox', '☑️', 'Checkbox', null, null, 'soon'],
      ['html', '</>', 'HTML', () => ({ type: 'html', props: { html: '<p>HTML</p>' } }), { w: 12, h: 1 }, 'admin'],
    ]],
    ['Live data', [
      ['events', '📅', 'Events', liveMake('events', 4), { w: 12, h: 4 }],
      ['sponsors', '🤝', 'Sponsors', liveMake('sponsor-thanks'), { w: 12, h: 3 }],
      ['nextfund', '💰', 'Next fundraiser', liveMake('next-fund'), { w: 6, h: 4 }],
    ]],
  ];

  let state = null; let layout = null; let liveJson = 'null';
  let selected = null; let editingKid = null;
  let mode = localStorage.getItem('studio-mode');
  let device = 'desktop'; let showGrid = true; let scale = 1;
  let undoStack = []; let redoStack = []; let lastSnap = ''; let coalesceUntil = 0;
  let saveTimer = 0; let renderTimer = 0; let lastSaved = null; let saving = false; let saveError = '';
  let template = null; let canvasDoc = null; let index = { blocks: new Map(), sections: new Map(), kids: new Map() };

  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((k) => k != null && n.append(k));
    return n;
  };
  let toastTimer = 0;
  const toast = (t, err) => { const n = $('[data-toast]'); n.textContent = t; n.classList.toggle('is-error', !!err); n.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => n.classList.remove('show'), err ? 6000 : 2200); };
  const call = async (path, method, body, raw) => {
    const init = { method, credentials: 'same-origin' };
    if (raw) init.body = raw; else if (body) { init.headers = { 'content-type': 'application/json' }; init.body = JSON.stringify(body); }
    const r = await fetch(path, init);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const msg = (data.errors || []).slice(0, 2).join(' · ') || data.detail || `Error ${r.status}`; const e = new Error(msg); e.status = r.status; throw e; }
    return data;
  };
  const textOf = (r) => (r?.paragraphs || []).map((p) => p.map((x) => x.text).join('')).join('\n\n');
  const richFrom = (t) => ({ paragraphs: String(t).split(/\n\s*\n/).filter((x) => x.trim()).map((x) => [{ text: x.trim() }]) });
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  // Nested blocks (inside an original-markup container) live in a pseudo
  // section whose blocks are the container's children; moves reorder them.
  let pseudo = new WeakMap();
  const groupSection = (top, owner) => {
    let p = pseudo.get(owner);
    if (!p) {
      p = { id: owner.id, nested: true, flow: true, _owner: owner, _top: top, get blocks() { return owner.props.children; }, set blocks(v) { owner.props.children = v; } };
      pseudo.set(owner, p);
    }
    return p;
  };
  const findBlock = (id) => {
    const walk = (list, section, top) => {
      for (const b of list) {
        if (b.id === id) return { section, block: b, top };
        if (b.type === 'group') { const hit = walk(b.props.children || [], groupSection(top, b), top); if (hit) return hit; }
      }
      return null;
    };
    for (const s of layout.sections) { const hit = walk(s.blocks, s, s); if (hit) return hit; }
    return null;
  };
  // ---------- original-markup elements: text segments ----------
  const TOKEN_RE = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g;
  const tokens = (html) => { const out = []; let last = 0; let m; const s2 = String(html || ''); TOKEN_RE.lastIndex = 0; while ((m = TOKEN_RE.exec(s2))) { if (m.index > last) out.push({ text: s2.slice(last, m.index) }); out.push({ tag: m[0] }); last = TOKEN_RE.lastIndex; } if (last < s2.length) out.push({ text: s2.slice(last) }); return out; };
  const decoder = document.createElement('textarea');
  const decode = (t) => { decoder.innerHTML = t; return decoder.value; };
  const encode = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\u00a0/g, '&nbsp;');
  const textSegs = (html) => tokens(html).map((t, i) => ({ ...t, i })).filter((t) => t.text != null && decode(t.text).length);
  const wordsOf = (html) => textSegs(html).map((t) => decode(t.text).replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
  /** Replace changed text segments only, so untouched bytes stay identical. */
  function withTexts(html, texts) {
    const toks = tokens(html); const segs = textSegs(html);
    if (segs.length !== texts.length) return null;
    segs.forEach((seg, k) => { if (decode(seg.text) !== texts[k]) toks[seg.i].text = encode(texts[k]); });
    return toks.map((t) => t.tag ?? t.text).join('');
  }
  const tagAttr = (tagStr, name) => { const m = tagStr.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? decode(m[1]) : null; };
  function withAttr(html, tagIndex, name, value) {
    const toks = tokens(html); let n = -1;
    for (const t of toks) {
      if (t.tag == null || t.tag.startsWith('</') || t.tag.startsWith('<!')) continue;
      n += 1; if (n !== tagIndex) continue;
      const v = String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      t.tag = new RegExp(`\\s${name}="`).test(t.tag) ? t.tag.replace(new RegExp(`\\s${name}="[^"]*"`), ` ${name}="${v}"`) : t.tag.replace(/\s*(\/?>)$/, ` ${name}="${v}"$1`);
    }
    return toks.map((t) => t.tag ?? t.text).join('');
  }
  const openTags = (html) => tokens(html).filter((t) => t.tag && !t.tag.startsWith('</') && !t.tag.startsWith('<!')).map((t) => t.tag);
  const rootTag = (html) => (String(html || '').match(/^<([a-zA-Z0-9-]+)/)?.[1] || '').toLowerCase();
  const liveInfo = (b) => (state?.live_sources || {})[b.props?.source] || { label: b.props?.source || 'another page', admin: '/admin.html' };
  const typeName = (b) => {
    if (b.type === 'live') return `Live data · ${liveInfo(b).label}`;
    if (b.type === 'el') {
      const t = rootTag(b.props.html); const first = openTags(b.props.html)[0] || '';
      if (/^h[1-6]$/.test(t)) return 'Heading';
      if (t === 'a' || t === 'button') return /\bbtn\b/.test(first) ? 'Button' : 'Link';
      if (t === 'p') return 'Text';
      if (t === 'li') return 'List item';
      if (t === 'img' || t === 'picture') return 'Image';
      if (t === 'svg') return 'Icon';
      return 'Element';
    }
    return TYPE_NAMES[b.type] || b.type;
  };
  const isGrid = (s) => !s.flow && !s.raw;
  const canLayout = () => !!state?.can_layout;
  const isAdmin = () => !!state?.can_html;
  const sorted = (s) => (s.nested ? [...s.blocks] : [...s.blocks].sort((a, b) => (a.y - b.y) || (a.x - b.x)));
  const labelOf = (b) => {
    const p = b.props || {};
    if (b.type === 'heading') return p.text;
    if (b.type === 'text') return textOf(p.rich);
    if (b.type === 'button') return p.label;
    if (b.type === 'image') return p.alt || 'Image';
    if (b.type === 'card') { const h = (p.children || []).find((k) => k.type === 'heading'); return h ? h.props.text : 'Card'; }
    if (b.type === 'el') return wordsOf(p.html) || typeName(b);
    if (b.type === 'live') return `Live: ${liveInfo(b).label}`;
    if (b.type === 'group') { const first = (p.children || []).map(labelOf).find((t) => t && t !== 'Container'); return first || 'Container'; }
    if (b.type === 'html') return String(p.html || '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || 'HTML';
    return TYPE_NAMES[b.type] || b.type;
  };
  const short = (t, n = 28) => { const s = String(t || '').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

  // ---------- change tracking, undo/redo, autosave ----------
  const snapshot = () => JSON.stringify(layout);
  const isDirty = () => snapshot() !== liveJson;
  function pushUndo(coalesce) {
    const now = Date.now();
    if (coalesce && now < coalesceUntil) { coalesceUntil = now + 900; return; }
    coalesceUntil = coalesce ? now + 900 : 0;
    if (lastSnap) undoStack.push(lastSnap);
    while (undoStack.length > UNDO_CAP) undoStack.shift();
    redoStack = [];
  }
  /** Call after every edit. opts: { canvas: re-render canvas, panel: re-render inspector, coalesce: typing } */
  function changed(opts = {}) {
    const { canvas = true, panel = true, coalesce = false } = opts;
    const snap = snapshot();
    if (snap === lastSnap) return;
    pushUndo(coalesce);
    lastSnap = snap;
    if (canvas) scheduleRender();
    if (panel) renderInspector();
    renderJson();
    scheduleSave();
    updateChrome();
  }
  function undo() { if (!undoStack.length) return; redoStack.push(lastSnap); lastSnap = undoStack.pop(); layout = JSON.parse(lastSnap); coalesceUntil = 0; afterJump('Undone'); }
  function redo() { if (!redoStack.length) return; undoStack.push(lastSnap); while (undoStack.length > UNDO_CAP) undoStack.shift(); lastSnap = redoStack.pop(); layout = JSON.parse(lastSnap); coalesceUntil = 0; afterJump('Redone'); }
  function afterJump(msg) { pseudo = new WeakMap(); if (selected && !findBlock(selected)) selected = null; scheduleRender(0); renderInspector(); renderJson(); scheduleSave(); updateChrome(); toast(msg); }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, 1200); updateChrome(); }
  async function saveDraft() {
    clearTimeout(saveTimer); saving = true; updateChrome();
    const snap = snapshot();
    try {
      // Draft only. This endpoint never publishes.
      await call(`${api}/draft`, 'PUT', { layout: JSON.parse(snap) });
      lastSaved = Date.now(); saveError = '';
    } catch (e) { saveError = e.message; toast(`Draft not saved: ${e.message}`, true); }
    saving = false; updateChrome();
  }
  const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`; };
  function updateChrome() {
    const pill = $('[data-pill]'); const dirty = layout ? isDirty() : false;
    pill.classList.toggle('is-dirty', dirty && !saveError); pill.classList.toggle('is-error', !!saveError);
    let t;
    if (saveError) t = 'Draft not saved · fix the error';
    else if (saving || saveTimer && !lastSaved) t = 'Saving draft…';
    else if (dirty) t = `Unpublished changes · autosaved ${lastSaved ? ago(lastSaved) : 'earlier'}`;
    else t = 'Published · no unpublished changes';
    pill.textContent = t;
    pill.title = dirty ? 'Your changes are saved as a draft. Visitors see them only after you press Publish.' : 'The live page matches this draft.';
    const pub = $('[data-act="publish"]');
    pub.classList.toggle('has-changes', dirty);
    pub.disabled = !dirty;
    pub.textContent = dirty ? '🚀 Publish' : '✓ Published';
    pub.dataset.state = dirty ? 'dirty' : 'clean'; pub.setAttribute('aria-label', dirty ? 'Publish' : 'Published');
    pub.title = dirty ? 'Unpublished changes: press to make this draft live' : 'Nothing new to publish';
    $('[data-act="undo"]').disabled = !undoStack.length;
    const dis = $('[data-act="discard"]'); if (dis) dis.disabled = !dirty || !state?.live_layout;
    $('[data-act="redo"]').disabled = !redoStack.length;
  }
  setInterval(updateChrome, 5000);

  // ---------- canvas ----------
  async function loadTemplate() {
    const tryFetch = async (p) => { try { const r = await fetch(p, { credentials: 'same-origin' }); return r.ok ? await r.text() : null; } catch { return null; } };
    const src = (await tryFetch(state.page.path || '/')) || (await tryFetch('/contact.html')) || '<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body><main id="main"></main></body></html>';
    const doc = new DOMParser().parseFromString(src, 'text/html');
    $$('script,noscript', doc).forEach((n) => n.remove());
    $$('[data-site-marquee],[data-sponsor-flyin],.sponsor-flyin', doc).forEach((n) => n.remove());
    if (!$('main', doc)) doc.body.append(doc.createElement('main'));
    const style = doc.createElement('style'); style.id = 'sc-editor-style'; style.textContent = CANVAS_CSS; doc.head.append(style);
    template = doc;
  }
  const docHtml = (doc, mainHtml) => { const d = doc.cloneNode(true); $('main', d).innerHTML = mainHtml; return `<!doctype html>${d.documentElement.outerHTML}`; };
  async function renderHtml(annotate) { return (await call(`${api}/render`, 'POST', { layout, annotate })).html; }
  function scheduleRender(ms = 220) { clearTimeout(renderTimer); renderTimer = setTimeout(renderCanvas, ms); }
  let firstRender = true; let scrollToSel = false;
  async function renderCanvas() {
    let html;
    try { html = await renderHtml(true); } catch (e) { toast(e.message, true); return; }
    const frame = $('[data-canvas]');
    if (firstRender || !canvasDoc || !$('main', canvasDoc)) {
      firstRender = false;
      await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = docHtml(template, html); });
      canvasDoc = frame.contentDocument;
      wireCanvas();
    } else {
      const y = canvasDoc.defaultView.scrollY;
      $('main', canvasDoc).innerHTML = html;
      canvasDoc.defaultView.scrollTo(0, y);
    }
    buildIndex(); sizeStage(); drawOverlay(); makeEditable();
    if (scrollToSel && selected && isMobile()) { scrollToSel = false; revealSelected(); }
    if (scrollToSel && selected) { scrollToSel = false; const r = docRect(index.blocks.get(selected) || []); const w = canvasDoc.defaultView; if (r && (r.top < w.scrollY || r.top + Math.min(r.height, 200) > w.scrollY + w.innerHeight)) { w.scrollTo(0, Math.max(0, r.top - 120)); drawOverlay(); } }
  }
  function buildIndex() {
    index = { blocks: new Map(), sections: new Map(), kids: new Map() };
    const main = $('main', canvasDoc);
    const walker = canvasDoc.createTreeWalker(main, NodeFilter.SHOW_COMMENT);
    const starts = [];
    for (let c = walker.nextNode(); c; c = walker.nextNode()) starts.push(c);
    for (const c of starts) {
      const m = /^(sb|ss|sk):(.+)$/.exec(c.data); if (!m) continue;
      const [, kind, id] = m; const els = [];
      for (let n = c.nextSibling; n && !(n.nodeType === 8 && n.data === `/${kind}`); n = n.nextSibling) if (n.nodeType === 1 && n.tagName !== 'STYLE') els.push(n);
      const map = kind === 'sb' ? index.blocks : kind === 'ss' ? index.sections : index.kids;
      map.set(id, els);
      els.forEach((e) => { if (kind === 'sb') e.dataset.scBlock = id; if (kind === 'sk') e.dataset.scKid = id; if (kind === 'ss') e.dataset.scSection = id; });
    }
  }
  const docRect = (els) => {
    let r = null; const w = canvasDoc.defaultView;
    for (const e of els) {
      const b = e.getBoundingClientRect(); if (!b.width && !b.height) continue;
      const x = { l: b.left + w.scrollX, t: b.top + w.scrollY, r: b.right + w.scrollX, b: b.bottom + w.scrollY };
      r = r ? { l: Math.min(r.l, x.l), t: Math.min(r.t, x.t), r: Math.max(r.r, x.r), b: Math.max(r.b, x.b) } : x;
    }
    return r && { left: r.l, top: r.t, width: r.r - r.l, height: r.b - r.t };
  };
  const sectionOf = (id) => layout.sections.find((s) => s.id === id);
  /** Column geometry for a section: { left, top, width, height, cols:[{l,r}], rows:[{t,b}] } in document coords. */
  function geometry(section) {
    const els = (section.nested ? index.blocks.get(section._owner.id) : index.sections.get(section.id)) || [];
    const w = canvasDoc.defaultView;
    let box = null; let cols = null; let rows = null;
    if (isGrid(section)) {
      const g = els[0] && $('.studio-grid', els[0]);
      if (g) {
        const b = g.getBoundingClientRect(); const cs = w.getComputedStyle(g);
        box = { left: b.left + w.scrollX, top: b.top + w.scrollY, width: b.width, height: b.height };
        const gap = parseFloat(cs.columnGap) || GAP; const rgap = parseFloat(cs.rowGap) || GAP;
        let x = box.left; cols = cs.gridTemplateColumns.split(' ').map((v) => { const c = { l: x, r: x + parseFloat(v) }; x = c.r + gap; return c; });
        let y = box.top; rows = cs.gridTemplateRows.split(' ').filter((v) => v.endsWith('px')).map((v) => { const r = { t: y, b: y + parseFloat(v) }; y = r.b + rgap; return r; });
        for (let i = 0; i < 12; i += 1) { rows.push({ t: y, b: y + ROW }); y += ROW + rgap; }
      }
    }
    if (!box) {
      const inner = section.nested ? els[0] : els[0] && (els.length === 1 ? (els[0].querySelector(':scope > .wrap, :scope > .page-title, :scope > div') || els[0]) : null);
      const r = inner ? docRect([inner]) : docRect(els);
      const sr = docRect(els) || r;
      if (!r) return null;
      box = { left: r.left, top: sr.top, width: r.width, height: sr.height };
      const cw = (box.width - GAP * (COLS - 1)) / COLS;
      cols = Array.from({ length: COLS }, (_, i) => ({ l: box.left + i * (cw + GAP), r: box.left + i * (cw + GAP) + cw }));
      rows = [];
    }
    return { ...box, cols, rows };
  }

  // ---------- overlay (selection, grid, hints) ----------
  let hover = null; let drag = null;
  function layer() {
    let L = canvasDoc.getElementById('sc-layer');
    if (!L) { L = canvasDoc.createElement('div'); L.id = 'sc-layer'; canvasDoc.body.append(L); }
    return L;
  }
  const box = (cls, r, text) => { const d = canvasDoc.createElement('div'); d.className = cls; Object.assign(d.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` }); if (text) d.textContent = text; return d; };
  const tag = (cls, x, y, text) => { const d = canvasDoc.createElement('div'); d.className = cls; d.style.left = `${x}px`; d.style.top = `${y}px`; d.textContent = text; return d; };
  function drawOverlay() {
    if (!canvasDoc) return;
    const L = layer(); L.innerHTML = '';
    const editingLayout = canLayout();
    if (showGrid && editingLayout) {
      for (const s of layout.sections) {
        const g = geometry(s); if (!g) continue;
        const grid = box('sc-grid', g);
        g.cols.forEach((c) => { const col = canvasDoc.createElement('div'); col.className = 'sc-col'; col.style.left = `${c.l - g.left}px`; col.style.width = `${c.r - c.l}px`; grid.append(col); });
        L.append(grid);
      }
    }
    if (hover && hover !== selected && !drag) { const r = docRect(index.blocks.get(hover) || []); if (r) L.append(box('sc-hover', r)); }
    if (selected) {
      const found = findBlock(selected); const r = found && docRect(index.blocks.get(selected) || []);
      if (r) {
        const sel = box(`sc-sel${drag ? ' is-dragging' : ''}`, r);
        const name = canvasDoc.createElement('div'); name.className = 'sc-name';
        if (editingLayout) { const h = canvasDoc.createElement('span'); h.className = 'sc-move'; h.dataset.scHandle = 'move'; h.title = 'Drag to move'; h.textContent = '⠿ Move'; name.append(h); }
        const lab = canvasDoc.createElement('span'); lab.textContent = `${found.block.type === 'live' ? '⚡ ' : ''}${typeName(found.block)}${found.block.props?.locked ? ' 🔒' : ''}`; if (found.block.type === 'live') lab.className = 'sc-live-tag'; name.append(lab);
        sel.append(name);
        if (editingLayout && (isGrid(found.section) || found.section.nested)) { const h = canvasDoc.createElement('span'); h.className = 'sc-resize'; h.dataset.scHandle = 'resize'; h.title = 'Drag to resize'; sel.append(h); }
        L.append(sel);
      }
    }
    if (drag?.hint) drawHint(L, drag.hint);
  }
  function drawHint(L, h) {
    if (h.ghost) L.append(box(`sc-ghost${h.bad ? ' is-bad' : ''}`, h.ghost));
    if (h.line) L.append(box('sc-line', h.line));
    (h.neighbours || []).forEach((r) => L.append(box('sc-nb', r)));
    if (h.text) L.append(tag(`sc-hint${h.bad ? ' is-bad' : ''}`, h.x, h.y, h.text));
    if (h.text2) L.append(tag('sc-hint2', h.x2, h.y2, h.text2));
  }

  // ---------- drag engine (move, resize, palette drop) ----------
  function sectionAt(x, y) {
    // x,y in iframe client coords.
    const e = canvasDoc.elementFromPoint(x, y);
    const sEl = e && e.closest('[data-sc-section]');
    const bEl = e && e.closest('[data-sc-block]');
    let section = sEl ? sectionOf(sEl.dataset.scSection) : null;
    if (!section && bEl) section = findBlock(bEl.dataset.scBlock)?.section || null;
    if (!section) {
      // nearest section vertically
      const py = y + canvasDoc.defaultView.scrollY; let best = null; let bd = Infinity;
      for (const s of layout.sections) { const r = docRect(index.sections.get(s.id) || []); if (!r) continue; const d = py < r.top ? r.top - py : py > r.top + r.height ? py - r.top - r.height : 0; if (d < bd) { bd = d; best = s; } }
      section = best;
    }
    return section;
  }
  const colAt = (g, px) => { let i = g.cols.findIndex((c) => px < c.r + GAP / 2); if (i < 0) i = COLS - 1; return i; };
  const rowAt = (g, py) => { let i = g.rows.findIndex((r) => py < r.b + GAP / 2); if (i < 0) i = g.rows.length - 1; return Math.max(0, i); };
  const rectOf = (g, r) => { const c0 = g.cols[r.x]; const c1 = g.cols[Math.min(COLS - 1, r.x + r.w - 1)]; const r0 = g.rows[r.y] || { t: g.top + g.height }; const r1 = g.rows[r.y + r.h - 1] || { b: r0.t + ROW * r.h }; return { left: c0.l, top: r0.t, width: c1.r - c0.l, height: Math.max(ROW, r1.b - r0.t) }; };
  /** Compute a drop/move target. item: {block?, w, h, label} ; returns plan */
  function planAt(item, cx, cy, grab = { dx: 0, dy: 0 }) {
    const own = item.block ? findBlock(item.block.id)?.section : null;
    const section = own?.nested ? own : sectionAt(cx, cy); if (!section) return null;
    const w = canvasDoc.defaultView; const px = cx + w.scrollX; const py = cy + w.scrollY;
    const g = geometry(section); if (!g) return null;
    if (isGrid(section)) {
      const wCols = Math.min(COLS, item.w); const x = Math.max(0, Math.min(COLS - wCols, colAt(g, px) - grab.dx));
      const y = Math.max(0, rowAt(g, py) - grab.dy);
      const r = { x, y, w: wCols, h: item.h };
      const hits = section.blocks.filter((o) => o.id !== item.block?.id && overlaps(r, o));
      const ghost = rectOf(g, r);
      const hint = { ghost, bad: hits.length > 0, x: ghost.left + ghost.width - 8, y: ghost.top - 12,
        text: hits.length ? `✕ overlaps ${short(labelOf(hits[0]), 18)}, pick an empty spot` : `→ snaps to columns ${x + 1}–${x + wCols}`,
        neighbours: hits.map((o) => docRect(index.blocks.get(o.id) || [])).filter(Boolean) };
      const near = section.blocks.find((o) => o.id !== item.block?.id && !hits.includes(o) && o.y < y + item.h && y < o.y + o.h);
      if (!hits.length && near) { const nr = docRect(index.blocks.get(near.id) || []); if (nr) { hint.text2 = 'no overlap: neighbours stay put'; hint.x2 = nr.left + 10; hint.y2 = nr.top - 12; } }
      return { kind: 'grid', section, rect: r, ok: !hits.length, hint };
    }
    if (!item.block && (section.raw || item.w < COLS)) {
      // Locked original markup: a new block goes in its own grid section just after it.
      const sr = docRect(index.sections.get(section.id) || []) || g;
      const line = { left: g.left, top: sr.top + sr.height - 2, width: g.width, height: 4 };
      const wCols = Math.min(COLS, item.w || COLS); const nx = Math.max(0, Math.min(COLS - wCols, colAt(g, px)));
      const ghost = { left: g.cols[nx].l, top: line.top + 8, width: g.cols[nx + wCols - 1].r - g.cols[nx].l, height: ROW * (item.h || 2) };
      return { kind: 'newsection', section, x: nx, ok: true, hint: { line, ghost, x: ghost.left + 6, y: line.top - 14, text: `↓ new 12-column grid row below · columns ${nx + 1}–${nx + wCols}` } };
    }
    // Flow section: reorder / insert by position.
    const list = sorted(section).filter((b) => b.id !== item.block?.id);
    let before = null;
    let side = false;
    for (const b of list) {
      const r = docRect(index.blocks.get(b.id) || []); if (!r) continue;
      if (!section.nested) { if (py < r.top + r.height / 2) { before = b; break; } continue; }
      if (py < r.top) { before = b; break; }
      const narrow = r.width < g.width * 0.85;
      if (py <= r.top + r.height && (narrow ? px < r.left + r.width / 2 : py < r.top + r.height / 2)) { before = b; side = narrow; break; }
    }
    if (item.block && item.block && findBlock(item.block.id).section !== section) return { kind: 'none', ok: false, hint: { x: px, y: py - 14, text: '✕ move it within its own section', bad: true } };
    const ref = before ? docRect(index.blocks.get(before.id) || []) : docRect(list.length ? index.blocks.get(list[list.length - 1].id) || [] : []);
    const lineY = before ? (ref ? ref.top - 3 : g.top) : (ref ? ref.top + ref.height + 1 : g.top + 4);
    const line = side && ref ? { left: ref.left - 4, top: ref.top, width: 4, height: ref.height } : { left: g.left, top: lineY, width: g.width, height: 4 };
    const text = before ? `↕ goes above “${short(labelOf(before), 22)}”` : '↕ goes at the end of this section';
    return { kind: 'flow', section, before, ok: true, hint: { line, x: g.left + 12, y: lineY - 13, text } };
  }
  function renumberFlow(section, order) { if (section.nested) { section.blocks = order; return; } let y = 0; order.forEach((b) => { b.x = 0; b.w = 12; b.y = y; y += b.h || 1; }); section.blocks = order; }
  function applyPlan(plan, block, isNew) {
    if (!plan || !plan.ok) return false;
    if (plan.kind === 'grid') {
      Object.assign(block, plan.rect);
      if (isNew) plan.section.blocks.push(block);
    } else if (plan.kind === 'flow') {
      const order = sorted(plan.section).filter((b) => b !== block);
      const at = plan.before ? order.indexOf(plan.before) : order.length;
      if (!plan.section.nested) block.h = block.h || 1;
      order.splice(at, 0, block); renumberFlow(plan.section, order);
    } else if (plan.kind === 'span') {
      if (plan.span >= COLS) delete block.props.span; else block.props.span = plan.span;
    } else if (plan.kind === 'newsection') {
      const i = layout.sections.indexOf(plan.section);
      Object.assign(block, { x: plan.x || 0, y: 0, w: Math.min(12, block.w || 12) });
      layout.sections.splice(i + 1, 0, { id: uid('s'), variant: 'content', blocks: [block] });
    } else return false;
    return true;
  }
  const toFrame = (cx, cy) => { const r = $('[data-canvas]').getBoundingClientRect(); return { x: (cx - r.left) / scale, y: (cy - r.top) / scale, inside: cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom }; };
  function autoScroll(fy) {
    const w = canvasDoc.defaultView; const h = w.innerHeight;
    if (fy < 40) w.scrollBy(0, -18); else if (fy > h - 40) w.scrollBy(0, 18);
  }

  function startPaletteDrag(e, def) {
    if (!canLayout()) return;
    e.preventDefault();
    const [, icon, name, make, size] = def;
    const ghost = el('div', { class: 'st-ghost', text: `${icon} ${name}` }); document.body.append(ghost);
    document.body.classList.add('st-dragging');
    const tile = e.currentTarget; tile.setPointerCapture?.(e.pointerId);
    const item = { w: size.w, h: size.h, label: name };
    drag = { kind: 'palette', hint: null, plan: null };
    const move = (ev) => {
      ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`;
      const f = toFrame(ev.clientX, ev.clientY);
      if (f.inside) { autoScroll(f.y); drag.plan = planAt(item, f.x, f.y); drag.hint = drag.plan?.hint || null; } else { drag.plan = null; drag.hint = null; }
      drawOverlay();
    };
    const up = () => {
      tile.removeEventListener('pointermove', move); tile.removeEventListener('pointerup', up); tile.removeEventListener('pointercancel', up);
      ghost.remove(); document.body.classList.remove('st-dragging');
      const plan = drag.plan; drag = null;
      if (plan?.ok) {
        const made = make(); const block = { id: uid(), ...made, x: 0, y: 0, w: size.w, h: size.h };
        if (applyPlan(plan, block, true)) { selected = block.id; scrollToSel = true; changed(); toast(`${name} added`); return; }
      } else if (plan) toast('That spot is taken. Drop it on an empty part of the grid.', true);
      drawOverlay();
    };
    tile.addEventListener('pointermove', move); tile.addEventListener('pointerup', up); tile.addEventListener('pointercancel', up);
    move(e);
  }
  function addAtEnd(def) {
    if (!canLayout()) return;
    const [, , name, make, size] = def;
    const found = selected && findBlock(selected);
    let section = found?.section || [...layout.sections].reverse().find((s) => !s.raw) || layout.sections[layout.sections.length - 1];
    const block = { id: uid(), ...make(), x: 0, y: 0, w: size.w, h: size.h };
    if (section.raw) applyPlan({ kind: 'newsection', section, ok: true }, block, true);
    else if (isGrid(section)) { block.y = Math.max(0, ...section.blocks.map((b) => b.y + b.h)); block.w = Math.min(12, size.w); section.blocks.push(block); }
    else applyPlan({ kind: 'flow', section, before: null, ok: true }, block, true);
    selected = block.id; scrollToSel = true; changed(); toast(`${name} added`);
  }

  /** Touch: add a tile right after the selected block (no drag needed). */
  function addAfter(def) {
    if (!canLayout()) return;
    const [, , name, make, size] = def;
    const found = selected && findBlock(selected);
    if (!found) { addAtEnd(def); closeSheet(); requestAnimationFrame(() => requestAnimationFrame(revealSelected)); return; }
    const { section, block: ref } = found;
    const block = { id: uid(), ...make(), x: 0, y: 0, w: size.w, h: size.h };
    if (section.raw) applyPlan({ kind: 'newsection', section, ok: true }, block, true);
    else if (isGrid(section)) {
      const y = ref.y + ref.h; block.w = Math.min(12, size.w); block.y = y;
      section.blocks.forEach((o) => { if (o.y >= y) o.y += block.h; }); section.blocks.push(block);
    } else {
      const order = sorted(section); order.splice(order.indexOf(ref) + 1, 0, block);
      if (section.nested) section.blocks = order; else { block.h = block.h || 1; renumberFlow(section, order); }
    }
    selected = block.id; scrollToSel = true; changed(); toast(`${name} added`);
    // Add sheet only: close it so the new block is in view (Edit/History sheets never auto-close).
    closeSheet(); requestAnimationFrame(() => requestAnimationFrame(revealSelected));
  }
  function startBlockDrag(ev, resize) {
    const found = findBlock(selected); if (!found || !canLayout()) return;
    ev.preventDefault(); ev.stopPropagation();
    const { section, block } = found; const g = geometry(section); const w = canvasDoc.defaultView;
    const start = { ...block }; const px0 = ev.clientX + w.scrollX; const py0 = ev.clientY + w.scrollY;
    const grab = isGrid(section) && g ? { dx: colAt(g, px0) - block.x, dy: rowAt(g, py0) - block.y } : { dx: 0, dy: 0 };
    drag = { kind: resize ? 'resize' : 'move', hint: null, plan: null };
    canvasDoc.body.classList.add('sc-dragging');
    const move = (e) => {
      autoScroll(e.clientY);
      if (resize && section.nested) {
        const px = e.clientX + w.scrollX; const er = docRect(index.blocks.get(block.id) || []);
        if (!g || !er) return;
        const span = Math.max(1, Math.min(COLS, Math.round(((px - er.left) / g.width) * COLS)));
        drag.plan = { kind: 'span', section, span, ok: true };
        const ghost = { left: er.left, top: er.top, width: (g.width * span) / COLS, height: er.height };
        drag.hint = { ghost, x: ghost.left + ghost.width - 8, y: ghost.top + ghost.height + 4, text: span >= COLS ? 'full width (original size)' : `${span} of ${COLS} columns wide` };
      } else if (resize) {
        const px = e.clientX + w.scrollX; const py = e.clientY + w.scrollY;
        const r = { x: start.x, y: start.y, w: Math.max(1, Math.min(COLS - start.x, colAt(g, px) - start.x + 1)), h: Math.max(1, rowAt(g, py) - start.y + 1) };
        const hits = section.blocks.filter((o) => o !== block && overlaps(r, o));
        const ghost = rectOf(g, r);
        drag.plan = { kind: 'grid', section, rect: r, ok: !hits.length };
        drag.hint = { ghost, bad: !!hits.length, x: ghost.left + ghost.width - 8, y: ghost.top + ghost.height + 4,
          text: hits.length ? `✕ would overlap ${short(labelOf(hits[0]), 18)}` : `columns ${r.x + 1}–${r.x + r.w} · ${r.h} tall`,
          neighbours: hits.map((o) => docRect(index.blocks.get(o.id) || [])).filter(Boolean) };
      } else {
        drag.plan = planAt({ block, w: block.w, h: block.h }, e.clientX, e.clientY, grab);
        drag.hint = drag.plan?.hint || null;
      }
      drawOverlay();
    };
    try { ev.target.setPointerCapture?.(ev.pointerId); } catch {}
    const up = (e) => {
      canvasDoc.removeEventListener('pointermove', move); canvasDoc.removeEventListener('pointerup', up); canvasDoc.removeEventListener('pointercancel', up);
      canvasDoc.body.classList.remove('sc-dragging');
      const plan = drag.plan; drag = null;
      // A tap on the handle (no drag) or a touch the browser cancelled: say how to move instead of doing nothing.
      if (!plan || e?.type === 'pointercancel') { drawOverlay(); if (!resize) toast(isMobile() ? 'Hold ⠿ Move and drag, or use ↑ Move up / ↓ Move down in Edit.' : 'Drag ⠿ Move to move this block.'); return; }
      if (plan?.ok) {
        const same = (plan.kind === 'grid' && ['x', 'y', 'w', 'h'].every((k) => plan.rect[k] === start[k]))
          || (plan.kind === 'span' && (plan.span >= COLS ? block.props.span == null : block.props.span === plan.span));
        if (!same && applyPlan(plan, block, false)) { selected = block.id; scrollToSel = true; changed(); toast('Moved'); return; }
      } else if (plan) toast(resize ? 'Blocks cannot overlap. Make room first.' : 'That spot is taken. Neighbours stay put.', true);
      drawOverlay();
    };
    canvasDoc.addEventListener('pointermove', move); canvasDoc.addEventListener('pointerup', up); canvasDoc.addEventListener('pointercancel', up);
  }

  // ---------- inline editing on the canvas ----------
  function makeEditable() {
    $$('[contenteditable]', canvasDoc).forEach((n) => { n.removeAttribute('contenteditable'); n.classList.remove('sc-editable'); });
    const found = selected && findBlock(selected); if (!found) return;
    const targets = [];
    const collect = (b, els) => {
      const p = b.props || {};
      if (b.type === 'heading' || b.type === 'button') {
        const t = b.type === 'button' ? els.map((x) => x.querySelector('a') || x)[0] : els[0];
        if (t) targets.push([t, (v) => { if (b.type === 'heading') p.text = v; else p.label = v; }]);
      }
      if (b.type === 'text') {
        const ps = els.flatMap((x) => (x.tagName === 'P' ? [x] : $$(':scope > p', x)));
        ps.forEach((pe, i) => { const para = p.rich?.paragraphs?.[i]; if (para && para.length === 1 && !para[0].href) targets.push([pe, (v) => { para[0].text = v; }]); });
      }
    };
    const els = index.blocks.get(found.block.id) || [];
    if (found.block.type === 'el') {
      const node = els[0]; const b = found.block;
      if (node && !/^(IMG|SVG|PICTURE|VIDEO|IFRAME|svg)$/.test(node.tagName) && textSegs(b.props.html).some((t) => decode(t.text).trim())) {
        node.setAttribute('contenteditable', 'plaintext-only'); node.classList.add('sc-editable'); node.spellcheck = true;
        node.oninput = () => {
          const walker = canvasDoc.createTreeWalker(node, NodeFilter.SHOW_TEXT); const texts = [];
          for (let t = walker.nextNode(); t; t = walker.nextNode()) if (t.data.length) texts.push(t.data);
          const next = withTexts(b.props.html, texts);
          if (next == null) { toast('Type inside the existing words. Use the panel on the right for bigger changes.', true); scheduleRender(0); return; }
          b.props.html = next; changed({ canvas: false, panel: false, coalesce: true }); syncPanelText();
        };
        node.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); node.blur(); } if (e.key === 'Escape') node.blur(); };
      }
      return;
    }
    if (found.block.type === 'card') (found.block.props.children || []).forEach((k) => collect(k, index.kids.get(k.id) || []));
    else collect(found.block, els);
    targets.forEach(([node, set]) => {
      node.setAttribute('contenteditable', 'plaintext-only'); node.classList.add('sc-editable'); node.spellcheck = true;
      node.oninput = () => { set(node.textContent.replace(/\s+/g, ' ').trim()); changed({ canvas: false, panel: false, coalesce: true }); syncPanelText(); };
      node.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); node.blur(); } if (e.key === 'Escape') node.blur(); };
    });
  }
  // ---------- phone/tablet pick-up & drag (one shared layout model; desktop uses the same order) ----------
  let pick = null; let lp = null;
  const pickEls = () => (pick ? index.blocks.get(pick.id) || [] : []);
  function pickBar(show) {
    let bar = $('[data-pick-bar]');
    if (!bar) { bar = el('div', { class: 'st-pickbar', 'data-pick-bar': '' }, el('span', { text: '⠿ Drag to move' }), el('button', { type: 'button', 'data-pick-cancel': '', text: 'Cancel', onclick: () => cancelPick(true) })); document.body.append(bar); }
    bar.hidden = !show;
  }
  function startPick(id) {
    const f = id && findBlock(id); if (!f || !canLayout()) return;
    if (pick) cancelPick();
    selected = id; afterSelect(); closeSheet();
    pick = { id, section: f.section, block: f.block, k: null };
    pickEls().forEach((n) => n.classList.add('sc-lifted')); canvasDoc.body.classList.add('sc-picked');
    try { navigator.vibrate?.(15); } catch {}
    pickBar(true);
  }
  function siblingsOf(p) { return sorted(p.section).filter((b) => b !== p.block); }
  function dropLine(y, left, width) {
    let ln = canvasDoc.getElementById('sc-dropline');
    if (y == null) { ln?.remove(); return; }
    if (!ln) { ln = canvasDoc.createElement('div'); ln.id = 'sc-dropline'; canvasDoc.body.append(ln); }
    Object.assign(ln.style, { top: `${y - 2}px`, left: `${left}px`, width: `${width}px` });
  }
  function pickMove(clientY) {
    const w = canvasDoc.defaultView; const py = clientY + w.scrollY; const sib = siblingsOf(pick);
    // Only blocks with something on screen count as drop slots; map back to the full sibling list (which may hold invisible fragments).
    const vis = sib.map((b) => [b, docRect(index.blocks.get(b.id) || [])]).filter(([, r]) => r && r.height > 0);
    const rects = vis.map(([, r]) => r);
    let k = 0; rects.forEach((r) => { if (r.top + r.height / 2 < py) k++; });
    pick.k = vis[k] ? sib.indexOf(vis[k][0]) : (vis.length ? sib.indexOf(vis[vis.length - 1][0]) + 1 : sib.length);
    const me = docRect(pickEls()); const ref = rects[k] || rects[rects.length - 1] || me;
    const y = rects[k] ? rects[k].top - 4 : (ref.top + ref.height + 4);
    dropLine(y, (me || ref).left, Math.max(60, (me || ref).width));
    const els = pickEls(); const dy = me ? py - (me.top + me.height / 2) : 0;
    els.forEach((n) => { n.style.transform = `translateY(${Math.round(dy)}px)`; });
    // Auto-scroll near the visible top/bottom (the bottom bar and sheets cover the frame's own bottom edge).
    const fr = $('[data-canvas]').getBoundingClientRect(); const s = scale || 1; const bar = $('.st-bottom');
    const visBottom = Math.min(fr.bottom, bar && bar.offsetParent ? bar.getBoundingClientRect().top : innerHeight);
    const sy = fr.top + clientY * s; const zone = 90;
    let v = 0;
    if (sy > visBottom - zone) v = Math.ceil(30 * (sy - (visBottom - zone)) / zone) + 4;
    else if (sy < fr.top + zone && w.scrollY > 0) v = -(Math.ceil(30 * (fr.top + zone - sy) / zone) + 4);
    pick.lastY = clientY;
    if (v) { const y0 = w.scrollY; w.scrollBy(0, v); if (w.scrollY !== y0 && !pick.raf) pick.raf = requestAnimationFrame(() => { if (pick) { pick.raf = 0; if (pick.dragging) pickMove(pick.lastY); } }); }
  }
  /** Reorder pick.block to reading-order slot k among its siblings. Grid sections get a sensible desktop placement:
   * it takes the target slot's row and column, and the blocks after it are pushed down so nothing overlaps. */
  function reorderTo(section, b, k) {
    const sib = sorted(section).filter((o) => o !== b);
    const old = sorted(section).indexOf(b); if (k === old) return false;
    if (section.nested || !isGrid(section)) { sib.splice(k, 0, b); if (section.nested) section.blocks = sib; else renumberFlow(section, sib); return true; }
    const t = sib[k];
    if (t) { b.x = Math.min(t.x, 12 - b.w); b.y = t.y; } else { b.x = 0; b.y = sib.reduce((m, o) => Math.max(m, o.y + o.h), 0); }
    const placed = [b];
    for (const o of sib.slice().sort((p, q) => p.y - q.y || p.x - q.x)) { let hit; while ((hit = placed.find((q) => overlaps(o, q)))) o.y = hit.y + hit.h; placed.push(o); }
    // close the vertical gap the block left behind
    return true;
  }
  function endPick(drop) {
    if (!pick) return;
    const p = pick; pick = null; if (p.raf) cancelAnimationFrame(p.raf); dropLine(null); pickBar(false);
    (index.blocks.get(p.id) || []).forEach((n) => { n.classList.remove('sc-lifted'); n.style.transform = ''; });
    canvasDoc.body.classList.remove('sc-picked');
    if (drop && p.k != null && reorderTo(p.section, p.block, p.k)) { selected = p.id; scrollToSel = true; changed(); toast('Moved'); requestAnimationFrame(() => requestAnimationFrame(revealSelected)); }
    else if (drop) { drawOverlay(); toast('Dropped back where it was.'); }
  }
  function cancelPick(say) { if (!pick) return; pick.k = null; endPick(false); if (say) toast('Move cancelled.'); }
  function wirePick(d) {
    let dragging = false; let start = null;
    d.addEventListener('touchstart', (e) => {
      if (!isMobile() || !canLayout() || e.touches.length > 1) { clearTimeout(lp); return; }
      const t = e.touches[0]; const target = d.elementFromPoint(t.clientX, t.clientY) || e.target;
      if (pick) {
        if (pickEls().some((n) => n.contains(target)) || target.closest?.('[data-sc-handle]')) { dragging = true; pick.dragging = true; e.preventDefault(); pickMove(t.clientY); }
        else { cancelPick(true); }
        return;
      }
      const b = target.closest?.('[data-sc-block]'); if (!b || target.closest('[contenteditable="true"]')) return;
      start = [t.clientX, t.clientY]; clearTimeout(lp);
      lp = setTimeout(() => { lp = null; startPick(b.dataset.scBlock); dragging = true; if (pick) pick.dragging = true; }, 450);
    }, { passive: false });
    d.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (lp && start && Math.hypot(t.clientX - start[0], t.clientY - start[1]) > 8) { clearTimeout(lp); lp = null; }
      if (pick && dragging) { e.preventDefault(); pickMove(t.clientY); }
    }, { passive: false });
    const end = () => { clearTimeout(lp); lp = null; if (pick && dragging) { dragging = false; pick.dragging = false; if (pick.raf) { cancelAnimationFrame(pick.raf); pick.raf = 0; } if (pick.k != null) endPick(true); } };
    d.addEventListener('touchend', end); d.addEventListener('touchcancel', () => { clearTimeout(lp); lp = null; dragging = false; });
    d.addEventListener('contextmenu', (e) => { if (isMobile()) e.preventDefault(); });
  }
  function wireCanvas() {
    const d = canvasDoc;
    wirePick(d);
    d.addEventListener('click', (e) => {
      const a = e.target.closest('a'); if (a) e.preventDefault();
      const f = e.target.closest('form'); if (f) e.preventDefault();
    }, true);
    d.addEventListener('submit', (e) => e.preventDefault(), true);
    d.addEventListener('pointerdown', (e) => {
      const h = e.target.closest('[data-sc-handle]');
      if (h) { if (isMobile() && h.dataset.scHandle === 'move') { e.preventDefault(); e.stopPropagation(); startPick(selected); return; } startBlockDrag(e, h.dataset.scHandle === 'resize'); return; }
      const b = e.target.closest('[data-sc-block]');
      if (!b) { if (!e.target.closest('#sc-layer')) { selected = null; afterSelect(); } return; }
      const id = b.dataset.scBlock;
      if (id !== selected) { selected = id; afterSelect(); }
    });
    d.addEventListener('dblclick', (e) => {
      const b = e.target.closest('[data-sc-block]'); const f = b && findBlock(b.dataset.scBlock);
      if (f?.block.type === 'live') toast(`Live data from ${liveInfo(f.block).label}. It updates by itself, so edit it at the source (link in the panel).`);
    });
    d.addEventListener('pointermove', (e) => {
      if (drag) return;
      const b = e.target.closest?.('[data-sc-block]'); const id = b?.dataset.scBlock || null;
      if (id !== hover) { hover = id; drawOverlay(); }
    });
    d.addEventListener('keydown', keys);
    d.defaultView.addEventListener('scroll', () => { if (!drag) drawOverlay(); });
  }
  function afterSelect() { renderInspector(); drawOverlay(); makeEditable(); if (isMobile() && selected && sheet) revealSelected(); }
  // ---------- desktop side panels: load collapsed; only the user's toggle opens/closes them ----------
  const panels = { left: false, right: false };
  const panelKey = () => `efhs-studio-panels:${state?.editor_uid ?? 'me'}`;
  function applyPanels() {
    document.body.classList.toggle('st-lc', !panels.left); document.body.classList.toggle('st-rc', !panels.right);
    $$('[data-panel-toggle]').forEach((b) => { const open = panels[b.dataset.panelToggle]; if (b.classList.contains('st-ptoggle')) { b.setAttribute('aria-pressed', String(open)); b.title = `${open ? 'Hide' : 'Show'} the ${b.dataset.panelToggle === 'left' ? 'Add elements' : 'Settings'} panel`; } });
    requestAnimationFrame(sizeStage);
  }
  function loadPanels() {
    try {
      // Remember the choice for this browser session only: a new session starts collapsed.
      if (!sessionStorage.getItem('efhs-studio-session')) { sessionStorage.setItem('efhs-studio-session', '1'); localStorage.removeItem(panelKey()); }
      const v = JSON.parse(localStorage.getItem(panelKey()) || '{}'); panels.left = !!v.left; panels.right = !!v.right;
    } catch { /* storage blocked: stay collapsed */ }
    applyPanels();
  }
  function togglePanel(side) { panels[side] = !panels[side]; try { localStorage.setItem(panelKey(), JSON.stringify(panels)); } catch {} applyPanels(); }
  document.addEventListener('click', (e) => { const t = e.target.closest('[data-panel-toggle]'); if (t) { e.preventDefault(); togglePanel(t.dataset.panelToggle); } });
  applyPanels();
  // ---------- mobile bottom sheets ----------
  let sheet = null;
  function openSheet(name) {
    sheet = name; document.body.dataset.sheet = name;
    $$('button[data-sheet]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sheet === name)));
    if (name === 'history') { $('[data-history-panel]').hidden = false; renderHistory(); } else $('[data-history-panel]').hidden = true;
    if (name === 'edit') requestAnimationFrame(revealSelected);
  }
  function closeSheet() {
    sheet = null; delete document.body.dataset.sheet; $$('button[data-sheet]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    if (isMobile()) $('[data-history-panel]').hidden = true;
  }
  /** Keep the selected block visible above the open sheet. */
  function revealSelected() {
    if (!canvasDoc || !selected) return;
    const r = docRect(index.blocks.get(selected) || []); if (!r) return;
    const w = canvasDoc.defaultView; const frame = $('[data-canvas]').getBoundingClientRect();
    const sh = document.querySelector(sheet === 'edit' ? '.st-right' : sheet === 'add' ? '.st-left' : '.st-history');
    const sheetTop = sheet && sh ? sh.getBoundingClientRect().top : window.innerHeight;
    const visible = Math.max(80, Math.min(frame.bottom, sheetTop) - frame.top);
    const top = r.top - w.scrollY;
    if (top < 36 || top + Math.min(r.height, visible - 60) > visible) { w.scrollTo(0, Math.max(0, r.top - 40)); drawOverlay(); }
  }

  // ---------- stage sizing (device toggle) ----------
  function sizeStage() {
    const center = $('[data-center]'); const stage = $('[data-stage]'); const frame = $('[data-canvas]');
    if (isMobile()) {
      // Phones/tablets: real page width at 1:1 so the page renders readable, not shrunk.
      const W = Math.max(320, center.clientWidth); const H = Math.max(300, center.clientHeight);
      scale = 1; frame.style.width = `${W}px`; frame.style.height = `${H}px`; frame.style.transform = 'none';
      stage.style.width = `${W}px`; stage.style.height = `${H}px`; stage.dataset.device = 'fit';
      if (canvasDoc) canvasDoc.body.classList.add('sc-touch');
      requestAnimationFrame(() => drawOverlay()); return;
    }
    if (canvasDoc) canvasDoc.body.classList.remove('sc-touch');
    const availW = center.clientWidth - 28; const availH = center.clientHeight - 28;
    const W = device === 'phone' ? PHONE : DESK;
    scale = device === 'phone' ? Math.min(1, availW / (PHONE + 16)) : Math.min(1, availW / DESK);
    const H = Math.max(400, Math.floor(availH / scale));
    frame.style.width = `${W}px`; frame.style.height = `${H}px`; frame.style.transform = `scale(${scale})`;
    stage.style.width = `${(W + (device === 'phone' ? 16 : 0)) * scale}px`; stage.style.height = `${(H + (device === 'phone' ? 16 : 0)) * scale}px`;
    stage.dataset.device = device;
    requestAnimationFrame(() => drawOverlay());
  }
  let lastMobile = null;
  window.addEventListener('resize', () => { const m = isMobile(); if (m !== lastMobile) { lastMobile = m; if (!m) closeSheet(); } sizeStage(); });

  // ---------- palette ----------
  function renderPalette() {
    const host = $('[data-palette]'); host.innerHTML = '';
    const lay = canLayout();
    $('[data-left-sub]').textContent = lay ? 'Drag onto the page' : 'You can change words, links and pictures. Adding blocks needs the “can also change layout” permission.';
    for (const [group, items] of PALETTE) {
      host.append(el('div', { class: 'st-group', text: group }));
      const tiles = el('div', { class: 'st-tiles' });
      for (const def of items) {
        const [key, icon, name, make, , flag] = def;
        const soon = flag === 'soon'; const adminOnly = flag === 'admin';
        if (adminOnly && !isAdmin()) { tiles.append(el('button', { type: 'button', class: 'st-tile', disabled: true, title: 'HTML is for Super Admins only' }, el('span', { class: 'st-soon', text: 'admin' }), el('span', { class: 'st-ti', 'aria-hidden': 'true', text: icon }), el('span', { class: 'st-tn', text: name }))); tiles.lastChild.setAttribute('aria-label', name); continue; }
        const t = el('button', { type: 'button', class: 'st-tile', 'data-tile': key, disabled: soon || !lay || !make, title: soon ? `${name}: coming soon` : `Drag ${name} onto the page (or click to add it at the end)` },
          soon ? el('span', { class: 'st-soon', text: 'soon' }) : null, el('span', { class: 'st-ti', 'aria-hidden': 'true', text: icon }), el('span', { class: 'st-tn', text: name }));
        t.setAttribute('aria-label', name);
        if (!soon && make) {
          let moved = false; let downAt = null;
          t.addEventListener('click', () => { if (isMobile()) addAfter(def); });
          t.addEventListener('pointerdown', (e) => { if (isMobile()) return; moved = false; downAt = [e.clientX, e.clientY];
            const onMove = (ev) => { if (!moved && Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5) { moved = true; t.removeEventListener('pointermove', onMove); startPaletteDrag(ev, def); } };
            t.addEventListener('pointermove', onMove);
            t.setPointerCapture?.(e.pointerId);
            t.addEventListener('pointerup', () => { t.removeEventListener('pointermove', onMove); if (!moved) addAtEnd(def); }, { once: true });
          });
          Object.defineProperty(t, '_def', { value: def });
        }
        tiles.append(t);
      }
      host.append(tiles);
    }
  }

  // ---------- inspector (CARD SETTINGS) ----------
  const kv = (label, control) => el('div', { class: 'st-kv' }, el('span', { text: label }), control);
  const select = (opts, value, onChange, disabled) => {
    const s = el('select', { disabled });
    opts.forEach(([v, t]) => s.append(el('option', { value: v, text: t })));
    s.value = String(value); s.addEventListener('change', () => onChange(s.value)); return s;
  };
  const field = (label, value, onInput, { multi = false, code = false, attrs = {} } = {}) => {
    const i = el(multi ? 'textarea' : 'input', { ...attrs, class: code ? 'st-code' : null }); i.value = value ?? '';
    i.addEventListener('input', () => { onInput(i.value); changed({ panel: false, coalesce: true }); });
    return el('label', { class: 'st-field' }, label, i);
  };
  const ordinal = (n) => ['1st', '2nd', '3rd'][n - 1] || `${n}th`;
  function contentFields(host, b, depth = 0) {
    const p = b.props || (b.props = {});
    if (b.type === 'heading') host.append(field('Heading text', p.text, (v) => { p.text = v; }, { attrs: { 'data-sync': b.id } }));
    if (b.type === 'text') host.append(field('Text (blank line = new paragraph)', textOf(p.rich), (v) => { p.rich = richFrom(v); }, { multi: true, attrs: { 'data-sync': b.id } }));
    if (b.type === 'button') { host.append(field('Button words', p.label, (v) => { p.label = v; }, { attrs: { 'data-sync': b.id } })); host.append(kv('Link', (() => { const i = el('input', { value: p.href || '', 'aria-label': 'Link', style: 'width:96px;border:0;text-align:right' }); i.addEventListener('change', () => { p.href = i.value.trim(); changed({ panel: false }); }); return i; })())); }
    if (b.type === 'image') {
      host.append(field('Describe the picture (alt text)', p.alt, (v) => { p.alt = v; }));
      const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp' });
      file.addEventListener('change', async () => {
        const f = file.files[0]; if (!f) return;
        if (f.size > 10 * 1024 * 1024) { toast('Images must be 10 MB or smaller.', true); return; }
        const fd = new FormData(); fd.append('file', f); toast('Uploading…');
        try { const out = await call(`${api}/upload`, 'POST', null, fd); p.src = out.src; changed(); toast('Image uploaded'); } catch (e) { toast(e.message, true); }
      });
      host.append(el('label', { class: 'st-field' }, 'Replace picture (max 10 MB)', file));
      if (isAdmin()) host.append(el('div', { class: 'st-adv' }, field('Image URL', p.src, (v) => { p.src = v; })));
    }
    if (b.type === 'html') {
      if (isAdmin()) host.append(el('div', { class: depth ? '' : 'st-adv' }, field('HTML (Super Admin)', p.html, (v) => { p.html = v; p.locked = false; }, { multi: true, code: true })));
      if (!isAdmin() || mode === 'simple') host.append(el('p', { class: 'st-lock', text: p.locked ? '🔒 Original page markup. Only a Super Admin can change it (Advanced mode).' : 'Custom HTML (Super Admin only).' }));
    }
    if (b.type === 'el') {
      const segs = textSegs(p.html);
      segs.forEach((seg, k) => {
        if (!decode(seg.text).trim()) return;
        host.append(field(segs.length > 1 ? `Words (${k + 1})` : 'Words', decode(seg.text), (v) => {
          const texts = textSegs(p.html).map((t) => decode(t.text)); texts[k] = v; const next = withTexts(p.html, texts); if (next != null) p.html = next; scheduleRender();
        }, { attrs: { 'data-sync': `${b.id}:${k}` } }));
      });
      openTags(p.html).forEach((t, ti) => {
        const href = tagAttr(t, 'href'); const src = tagAttr(t, 'src'); const alt = tagAttr(t, 'alt');
        if (href != null) { const i = el('input', { value: href, 'aria-label': 'Link', 'data-link-field': b.id, style: 'width:150px;border:0;text-align:right' }); i.addEventListener('change', () => { p.html = withAttr(p.html, ti, 'href', i.value.trim()); changed({ panel: false }); }); host.append(kv('Link', i)); }
        if (alt != null && /^<img/i.test(t)) host.append(field('Describe the picture (alt text)', alt, (v) => { p.html = withAttr(p.html, ti, 'alt', v); scheduleRender(); }));
        if (src != null && /^<img/i.test(t) && isAdmin()) host.append(el('div', { class: 'st-adv' }, field('Image URL', src, (v) => { p.html = withAttr(p.html, ti, 'src', v); scheduleRender(); })));
      });
      if (!segs.some((t) => decode(t.text).trim()) && !openTags(p.html).some((t) => /\s(href|alt)="/.test(t))) host.append(el('p', { class: 'st-note', text: 'Decoration from the original design. Move or resize it, or hide it with Delete.' }));
      if (isAdmin()) host.append(el('div', { class: 'st-adv' }, field('HTML (Super Admin)', p.html, (v) => { p.html = v; }, { multi: true, code: true })));
    }
    if (b.type === 'group') {
      host.append(el('p', { class: 'st-note', text: `A container from the original design with ${(p.children || []).length} parts. Click a part inside it to edit, move or resize it.` }));
      if (isAdmin()) host.append(el('div', { class: 'st-adv' }, field('Opening tag (Super Admin)', p.open, (v) => { p.open = v; }, { code: true })));
    }
    if (b.type === 'live') {
      const info = liveInfo(b);
      host.append(el('p', { class: 'st-live', 'data-live-badge': p.source }, '⚡ Live data from ', el('b', { text: info.label })));
      host.append(el('p', { class: 'st-note', text: 'This part fills in by itself from its source and updates automatically, so its words cannot be typed over here. You can move it, resize it, hide it or change its settings.' }));
      host.append(el('p', {}, el('a', { class: 'st-linkbtn', href: info.admin, target: '_blank', rel: 'noopener', 'data-live-source-link': '', text: `Edit ${info.label} ↗` })));
      const lay = canLayout();
      const show = el('input', { type: 'checkbox', checked: !p.hidden, disabled: !lay, 'aria-label': 'Show on page' });
      show.addEventListener('click', () => { if (show.checked) delete p.hidden; else p.hidden = true; changed(); });
      host.append(kv('Show on page', show));
      if (info.limit) {
        const cur = p.limit || 0;
        host.append(kv('Number of items', select([['0', 'Default'], ...Array.from({ length: 12 }, (_, i) => [String(i + 1), String(i + 1)])], cur, (v) => { const n = Number(v); if (n) p.limit = n; else delete p.limit; changed(); }, !lay)));
      }
    }
    if (b.type === 'logos') host.append(el('p', { class: 'st-note', text: 'Shows the school logo and the Blue Regiment mark automatically.' }));
    if (b.type === 'card') {
      (p.children || []).forEach((kid, i) => {
        const fs = el('fieldset', { class: 'st-kid' }, el('legend', { text: `${TYPE_NAMES[kid.type] || kid.type}` }));
        fs.style.cssText = 'border:1px solid #d6dce8;border-radius:7px;padding:4px 6px;margin:0 0 6px;font-size:10px';
        contentFields(fs, kid, depth + 1);
        if (canLayout()) fs.append(el('div', { class: 'st-actions' }, el('button', { type: 'button', class: 'danger', text: 'Remove', onclick: () => { p.children.splice(i, 1); changed(); } })));
        host.append(fs);
      });
      if (canLayout()) {
        const s = el('select', { 'aria-label': 'Add to card' }); [['text', 'Text'], ['heading', 'Heading'], ['button', 'Button'], ['image', 'Image'], ['divider', 'Divider']].forEach(([v, t]) => s.append(el('option', { value: v, text: t })));
        host.append(el('div', { class: 'st-actions' }, s, el('button', { type: 'button', text: '+ Add to card', onclick: () => {
          const mk = { text: () => ({ rich: rich('Card text') }), heading: () => ({ level: 3, text: 'Heading' }), button: () => ({ label: 'Learn more', href: '/contact.html' }), image: () => ({ src: '/assets/efhs-photo-1.png', alt: 'Band photo' }), divider: () => ({}) }[s.value];
          p.children.push({ id: uid('c'), type: s.value, props: mk() }); changed();
        } })));
      }
    }
  }
  function syncPanelText() {
    const found = selected && findBlock(selected); if (!found) return;
    const all = found.block.type === 'card' ? found.block.props.children : [found.block];
    if (found.block.type === 'el') { textSegs(found.block.props.html).forEach((seg, k) => { const i = $(`[data-sync="${CSS.escape(found.block.id)}:${k}"]`); if (i && document.activeElement !== i) i.value = decode(seg.text); }); return; }
    all.forEach((b) => { const i = $(`[data-sync="${CSS.escape(b.id)}"]`); if (!i || document.activeElement === i) return; i.value = b.type === 'text' ? textOf(b.props.rich) : b.type === 'button' ? b.props.label : b.props.text; });
  }
  function renderInspector() {
    const host = $('[data-inspector]'); host.innerHTML = '';
    const found = selected && findBlock(selected);
    if (!found) {
      host.append(el('h2', { text: 'Page settings' }), el('p', { class: 'st-selname', text: `${state?.page?.title || slug} · nothing selected` }));
      host.append(el('p', { class: 'st-note', text: 'Click anything on the page to select it. Click selected words to type. Drag ⠿ Move to move a block and the blue corner to resize it.' }));
      host.append(el('div', { class: 'st-group', text: 'Page' }), kv('Address', el('b', { text: state?.page?.path || '' })), kv('Live editor', el('b', { text: state?.page?.editor || 'legacy' })), kv('Sections', el('b', { text: String(layout?.sections?.length || 0) })));
      host.append(el('div', { class: 'st-group', text: 'Who can edit' }), kv('Text', el('b', { text: `page:${slug}` })), kv('Layout', el('b', { text: `🔒 layout:${slug}` })));
      host.append(el('p', { class: 'st-note', text: `You can ${canLayout() ? 'change words and layout' : 'change words, links and pictures'} here.` }));
      return;
    }
    const { section, block: b } = found; const grid = isGrid(section); const lay = canLayout();
    const name = TYPE_NAMES[b.type] || b.type;
    host.append(el('h2', { text: `${b.type === 'card' ? 'Card' : TREE.has(b.type) ? typeName(b).replace(/ · .*/, '') : name} settings` }), el('p', { class: 'st-selname', text: `“${short(labelOf(b), 26)}” · selected` }));
    if (lay) {
      const span = section.nested ? (b.props?.span || 12) : b.w;
      const setW = (d) => {
        if (section.nested) { const n = Math.max(1, Math.min(12, (b.props.span || 12) + d)); if (n >= 12) delete b.props.span; else b.props.span = n; changed(); return; }
        if (grid) { const w = Math.max(1, Math.min(12 - b.x, b.w + d)); if (w !== b.w) setRect({ w }); else toast('No more room on that side.', true); return; }
        toast('This section is always full width.', true);
      };
      host.append(el('div', { class: 'st-quick st-m-only', 'data-quick': '' },
        el('button', { type: 'button', 'data-quick-act': 'up', text: '↑ Move up', onclick: () => nudge(section, b, -1) }),
        el('button', { type: 'button', 'data-quick-act': 'down', text: '↓ Move down', onclick: () => nudge(section, b, 1) }),
        el('span', { class: 'st-stepper' },
          el('button', { type: 'button', 'data-quick-act': 'narrower', 'aria-label': 'Narrower', text: '−', onclick: () => setW(-1) }),
          el('b', { 'data-quick-width': '', text: `${span}/12 wide` }),
          el('button', { type: 'button', 'data-quick-act': 'wider', 'aria-label': 'Wider', text: '+', onclick: () => setW(1) }))));
    }
    // SIZE & PLACE
    host.append(el('div', { class: 'st-group', text: 'Size & place' }));
    const setRect = (r) => { const t = { ...b, ...r }; if (t.x < 0 || t.w < 1 || t.x + t.w > COLS || t.h < 1) return toast('That does not fit on the 12-column grid.', true); const hit = section.blocks.find((o) => o !== b && overlaps(t, o)); if (hit) { toast(`No overlap: “${short(labelOf(hit), 20)}” stays put.`, true); renderInspector(); return; } Object.assign(b, r); changed(); };
    if (grid) {
      const opts = Array.from({ length: 12 }, (_, i) => [String(i + 1), String(i + 1)]);
      const cols = el('span', { class: 'st-sw' }, select(opts, b.x + 1, (v) => setRect({ x: Number(v) - 1, w: Math.max(1, b.x + b.w - (Number(v) - 1)) }), !lay), el('b', { text: '–' }), select(opts, b.x + b.w, (v) => setRect({ w: Number(v) - b.x }), !lay));
      host.append(kv('Columns', cols));
      host.append(kv('Rows', select(Array.from({ length: 16 }, (_, i) => [String(i + 1), `${i + 1} tall`]), b.h, (v) => setRect({ h: Number(v) }), !lay)));
    } else if (section.nested) {
      host.append(kv('Width', select([['12', 'Original (full)'], ...Array.from({ length: 11 }, (_, i) => [String(11 - i), `${11 - i} of 12 columns`])], b.props?.span || 12, (v) => { const n = Number(v); if (n >= 12) delete b.props.span; else b.props.span = n; changed(); }, !lay)));
      host.append(el('p', { class: 'st-note' }, 'Inside an original-design container: drag ⠿ to reorder it, the blue corner to resize. ', el('button', { type: 'button', class: 'st-linkbtn', text: 'Select the container', 'data-select-parent': '', onclick: () => { selected = section._owner.id; afterSelect(); } })));
    } else {
      host.append(kv('Columns', el('b', { text: '1 – 12' })), kv('Rows', el('b', { text: 'auto' })));
    }
    const phoneVal = b.mobile?.hidden ? 'hide' : Number.isInteger(b.mobile?.order) ? String(b.mobile.order) : 'same';
    host.append(kv('On phone', select([['same', 'Full width, same'], ...[1, 2, 3, 4, 5, 6].map((n) => [String(n), `Full width, ${ordinal(n)}`]), ['hide', 'Hidden']], phoneVal, (v) => {
      const m = { ...(b.mobile || {}) }; delete m.order; delete m.hidden;
      if (v === 'hide') m.hidden = true; else if (v !== 'same') m.order = Number(v);
      if (Object.keys(m).length) b.mobile = m; else delete b.mobile; changed();
    }, !lay || !grid)));
    if (!grid && lay && !section.raw) host.append(el('p', { class: 'st-note' }, 'This section keeps the original layout (full width, drag ⠿ to reorder). ', el('button', { type: 'button', class: 'st-linkbtn', text: 'Make it a free grid', onclick: () => { if (!confirm('Switch this section to the free 12-column grid? Its look may change slightly. You can undo.')) return; section.flow = false; delete section.wrap; delete section.wrapClass; changed(); } })));
    if (section.raw) host.append(el('p', { class: 'st-note', text: 'Part of the original page. Drop new elements below it, or drag ⠿ to reorder.' }));
    // LOOK
    host.append(el('div', { class: 'st-group', text: 'Look' }));
    const look = b.look || {};
    const setLook = (k, v) => { const l = { ...(b.look || {}) }; if (v == null || v === '') delete l[k]; else l[k] = v; if (Object.keys(l).length) b.look = l; else delete b.look; changed(); };
    const lookOk = grid && lay;
    const color = (k, def) => { const i = el('input', { type: 'color', value: look[k] || def, disabled: !lookOk, 'aria-label': k }); i.addEventListener('change', () => setLook(k, i.value)); return el('span', { class: 'st-sw' }, look[k] && lookOk ? el('button', { type: 'button', title: 'Use site default', text: '✕', onclick: () => setLook(k, null) }) : null, i); };
    host.append(kv('Background', color('bg', '#ffffff')), kv('Accent', color('accent', '#c8102e')));
    host.append(kv('Corners', select([['', 'Site default'], ['square', 'Square'], ['round', 'Round'], ['pill', 'Extra round']], look.radius || '', (v) => setLook('radius', v), !lookOk)));
    host.append(kv('Shadow', select([['', 'Site default'], ['none', 'None'], ['soft', 'Soft'], ['strong', 'Strong']], look.shadow || '', (v) => setLook('shadow', v), !lookOk)));
    if (!grid) host.append(el('p', { class: 'st-note', text: 'Look settings work in free grid sections.' }));
    // CONTENT
    host.append(el('div', { class: 'st-group', text: 'Content' }));
    host.append(kv('Linked data', b.type === 'live' ? el('a', { href: liveInfo(b).admin, target: '_blank', rel: 'noopener', text: liveInfo(b).label }) : el('b', { text: 'None (typed here)' })));
    contentFields(host, b);
    // WHO CAN EDIT
    host.append(el('div', { class: 'st-group', text: 'Who can edit' }), kv('Text', el('b', { text: `page:${slug}` })), kv('Layout', el('b', { text: `🔒 layout:${slug}` })));
    // ADVANCED
    if (lay) {
      const adv = el('div', { class: 'st-adv' }, el('div', { class: 'st-group', text: 'Advanced' }));
      if (!section.nested) ['x', 'y', 'w', 'h'].forEach((k) => { const i = el('input', { type: 'number', value: b[k], min: 0, max: k === 'h' ? 99 : 12 }); i.addEventListener('change', () => setRect({ [k]: Number.parseInt(i.value, 10) })); adv.append(kv(k.toUpperCase(), i)); });
      adv.append(kv('Section', el('b', { text: `${section.id} · ${section.raw ? 'original' : grid ? 'grid' : 'flow'}` })));
      host.append(adv);
      const locked = (b.type === 'html' && b.props?.locked && !isAdmin()) || (TREE.has(b.type) && !isAdmin());
      host.append(el('div', { class: 'st-actions' },
        el('button', { type: 'button', text: 'Duplicate', disabled: locked, onclick: () => duplicate(section, b) }),
        el('button', { type: 'button', text: '↑', title: 'Move up', onclick: () => nudge(section, b, -1) }),
        el('button', { type: 'button', text: '↓', title: 'Move down', onclick: () => nudge(section, b, 1) }),
        el('button', { type: 'button', class: 'danger', text: 'Delete', disabled: locked && !TREE.has(b.type), onclick: () => del(section, b) })));
    }
  }
  function duplicate(section, b) {
    const copy = JSON.parse(JSON.stringify(b)); copy.id = uid();
    const reid = (x) => (x.props?.children || []).forEach((k) => { k.id = uid('c'); reid(k); }); reid(copy);
    if (section.nested) { const order = sorted(section); order.splice(order.indexOf(b) + 1, 0, copy); section.blocks = order; selected = copy.id; changed(); return; }
    if (isGrid(section)) { copy.y = Math.max(0, ...section.blocks.map((o) => o.y + o.h)); section.blocks.push(copy); }
    else { const order = sorted(section); order.splice(order.indexOf(b) + 1, 0, copy); renumberFlow(section, order); }
    selected = copy.id; changed();
  }
  function nudge(section, b, dir) {
    // Move up/down always gives feedback: it moves the block (re-selected + scrolled into view) or says why not.
    const done = (msg) => { selected = b.id; scrollToSel = true; changed(); toast(msg); requestAnimationFrame(() => requestAnimationFrame(revealSelected)); };
    const edge = () => toast(dir < 0 ? 'Already at the top.' : 'Already at the bottom.');
    if (section.nested) { const order = sorted(section); const i = order.indexOf(b); const j = i + dir; if (j < 0 || j >= order.length) return edge(); [order[i], order[j]] = [order[j], order[i]]; section.blocks = order; return done(dir < 0 ? 'Moved up' : 'Moved down'); }
    if (isGrid(section)) {
      // Grid sections: swap places with the previous/next block in reading order (rows, then columns).
      const order = [...section.blocks].sort((p, q) => p.y - q.y || p.x - q.x); const i = order.indexOf(b);
      for (let j = i + dir; j >= 0 && j < order.length; j += dir) {
        const n = order[j]; const tb = { ...b, x: n.x, y: n.y }; const tn = { ...n, x: b.x, y: b.y };
        if (tb.x + tb.w > 12) tb.x = 12 - tb.w; if (tn.x + tn.w > 12) tn.x = 12 - tn.w;
        const others = section.blocks.filter((o) => o !== b && o !== n);
        if (!overlaps(tb, tn) && !others.some((o) => overlaps(tb, o) || overlaps(tn, o))) { [b.x, b.y, n.x, n.y] = [tb.x, tb.y, tn.x, tn.y]; return done(dir < 0 ? 'Moved up' : 'Moved down'); }
      }
      if (i + dir < 0 || i + dir >= order.length) return edge();
      return toast('No room to swap there. Try dragging ⠿ Move instead.', true);
    }
    const order = sorted(section); const i = order.indexOf(b); const j = i + dir; if (j < 0 || j >= order.length) return edge();
    [order[i], order[j]] = [order[j], order[i]]; renumberFlow(section, order); done(dir < 0 ? 'Moved up' : 'Moved down');
  }
  function del(section, b) {
    section.blocks = section.blocks.filter((x) => x !== b);
    if (!section.blocks.length && layout.sections.length > 1 && !section.flow) layout.sections = layout.sections.filter((s) => s !== section);
    selected = null; changed(); toast('Deleted. Press Undo to bring it back.');
  }

  // ---------- history panel ----------
  function renderHistory() {
    const ol = $('[data-history]'); ol.innerHTML = '';
    if (isDirty()) ol.append(el('li', {}, el('b', { text: 'Unpublished draft' }), `Autosaved ${lastSaved ? ago(lastSaved) : 'earlier'}. Visitors do not see it until you press Publish.`));
    (state.versions || []).forEach((v) => {
      const when = new Date(`${String(v.created_at).replace(' ', 'T')}Z`).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
      const live = v.id === state.page.live_version_id;
      ol.append(el('li', { class: live ? 'is-live' : null }, el('b', { text: `${v.kind === 'restore' ? 'Restored' : 'Published'}${live ? ' · live now' : ''}` }), `${v.created_by_name || '?'} · ${when} ET`,
        live ? null : el('div', {}, el('button', { type: 'button', class: 'st-btn', text: 'Restore this version', onclick: async () => {
          if (!confirm('Restore this version? It becomes the live page.')) return;
          try { await call(`${api}/restore`, 'POST', { version_id: v.id }); await load(true); toast('Restored'); } catch (e) { toast(e.message, true); }
        } }))));
    });
    if (!(state.versions || []).length) ol.append(el('li', { text: 'No published versions yet.' }));
  }
  const renderJson = () => { const t = $('[data-json]'); if (t && document.activeElement !== t) t.value = JSON.stringify(layout, null, 2); };

  // ---------- modes, toolbar, menu ----------
  function setMode(m) {
    mode = m; localStorage.setItem('studio-mode', m); document.body.dataset.mode = m;
    $$('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    renderPalette(); renderInspector();
  }
  function keys(e) {
    const t = e.target; const typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && selected && canLayout()) { const f = findBlock(selected); if (f && !(f.block.type === 'html' && f.block.props?.locked && !isAdmin()) && !(f.block.type === 'group' && !isAdmin())) { e.preventDefault(); del(f.section, f.block); } }
    if (e.key === 'Escape' && !typing) { if (sheet) { closeSheet(); return; } selected = null; afterSelect(); }
  }
  document.addEventListener('keydown', keys);
  async function preview() {
    const w = window.open('', '_blank');
    try {
      const html = await renderHtml(false);
      const d = template.cloneNode(true); $('#sc-editor-style', d)?.remove(); $('main', d).innerHTML = html;
      const bar = d.createElement('div'); bar.setAttribute('style', 'position:sticky;top:0;z-index:9999;background:#c8102e;color:#fff;font:700 14px/1.2 system-ui;padding:8px 14px;text-align:center'); bar.textContent = 'Preview of your draft. Not live until you press Publish.';
      d.body.prepend(bar);
      if (w) { w.document.open(); w.document.write(`<!doctype html>${d.documentElement.outerHTML}`); w.document.close(); }
    } catch (e) { if (w) w.close(); toast(e.message, true); }
  }
  async function discardAll() {
    if (!state.live_layout) return toast('Nothing is live yet.', true);
    if (!isDirty()) return;
    if (!confirm('Throw away all unpublished changes and go back to the live page?')) return;
    clearTimeout(saveTimer); saveTimer = 0;
    try {
      await call(`${api}/draft`, 'DELETE');
      undoStack = []; redoStack = []; selected = null; saveError = ''; lastSaved = null;
      await load(true);
      undoStack = []; redoStack = [];
      renderInspector(); updateChrome(); toast('Discarded. Back to the live page.');
    } catch (e) { toast(`Not discarded: ${e.message}`, true); }
  }
  async function publish() {
    clearTimeout(saveTimer);
    try {
      const pub = $('[data-act="publish"]'); pub.disabled = true; pub.textContent = 'Publishing…';
      await call(`${api}/publish`, 'POST', { layout });
      await load(true); toast('Published. The live page is updated.');
    } catch (e) { toast(`Not published: ${e.message}`, true); updateChrome(); }
  }
  document.addEventListener('click', (e) => {
    const sb = e.target.closest('button[data-sheet]'); if (sb) { if (sheet === sb.dataset.sheet) closeSheet(); else openSheet(sb.dataset.sheet); return; }
    if (e.target.closest('[data-close-sheet],[data-scrim]')) { closeSheet(); return; }
    if (isMobile() && e.target.closest('[data-history-panel] [data-act="history"]')) { e.stopImmediatePropagation(); closeSheet(); }
  }, true);
  document.addEventListener('click', async (e) => {
    const menu = $('[data-menu]');
    if (!e.target.closest('.st-more')) { menu.hidden = true; $('[data-act="more"]').setAttribute('aria-expanded', 'false'); }
    const t = e.target.closest('[data-act],[data-mode],[data-device]'); if (!t || t.closest('[data-palette]')) return;
    if (t.dataset.mode) { setMode(t.dataset.mode); menu.hidden = true; return; }
    if (t.dataset.device) { device = t.dataset.device; $$('[data-device]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.device === device))); sizeStage(); return; }
    const act = t.dataset.act;
    if (act === 'more') { menu.hidden = !menu.hidden; t.setAttribute('aria-expanded', String(!menu.hidden)); return; }
    if (act === 'undo') return undo();
    if (act === 'redo') return redo();
    if (act === 'grid') { showGrid = !showGrid; t.setAttribute('aria-pressed', String(showGrid)); $('[data-gridnote]').textContent = showGrid ? 'Grid: 12 columns · snap on' : 'Grid hidden · snap on'; drawOverlay(); return; }
    if (act === 'preview') return preview();
    if (act === 'publish') return publish();
    if (act === 'history') { const p = $('[data-history-panel]'); p.hidden = !p.hidden; $$('[data-act="history"].st-btn').forEach((b) => b.setAttribute('aria-pressed', String(!p.hidden))); if (!p.hidden) renderHistory(); return; }
    if (act === 'json') { menu.hidden = true; renderJson(); $('[data-json-dialog]').showModal(); return; }
    if (act === 'apply-json') { try { layout = JSON.parse($('[data-json]').value); selected = null; changed(); $('[data-json-dialog]').close(); } catch { toast('That JSON could not be read.', true); } return; }
    if (act === 'migrate') { menu.hidden = true; if (!confirm('Rebuild this draft from the current page? You can undo.')) return; try { layout = (await call(`${api}/migrate`, 'POST', {})).layout; selected = null; changed(); toast('Rebuilt from the current page'); } catch (er) { toast(er.message, true); } return; }
    if (act === 'discard') return discardAll();
    if (act === 'grid-m') { menu.hidden = true; showGrid = !showGrid; drawOverlay(); return; }
  });
  $('[data-editor]').addEventListener('change', async (e) => { try { await call(`${api}/editor`, 'POST', { editor: e.target.value }); await load(true); toast(`Live editor: ${e.target.value}`); } catch (er) { toast(er.message, true); } });
  $('[data-page-pick]').addEventListener('change', (e) => { if (e.target.value !== slug) window.location.href = `/admin/studio/${encodeURIComponent(e.target.value)}`; });
  async function loadPages() {
    try {
      const me = await call('/api/admin/me', 'GET'); const sel = $('[data-page-pick]'); sel.innerHTML = '';
      (me.pages || []).forEach((p) => sel.append(el('option', { value: p.slug, text: p.title || p.slug })));
      if (![...sel.options].some((o) => o.value === slug)) sel.prepend(el('option', { value: slug, text: state?.page?.title || slug }));
      sel.value = slug;
    } catch { /* keep default */ }
  }

  async function load(reload) {
    state = await call(api, 'GET');
    liveJson = JSON.stringify(state.live_layout || null);
    if (!reload) {
      loadPanels();
      const starter = JSON.parse($('#studio-starter').textContent || 'null');
      layout = state.draft?.layout || state.live_layout || starter;
      if (!layout && state.can_html) { try { layout = (await call(`${api}/migrate`, 'POST', {})).layout; } catch { /* fall through */ } }
      if (!layout) layout = { version: 1, sections: [{ id: 'main', variant: 'content', blocks: [] }] };
      if (state.draft?.updated_at) lastSaved = new Date(`${String(state.draft.updated_at).replace(' ', 'T')}Z`).getTime() || null;
      if (!mode) mode = state.can_html ? 'advanced' : 'simple';
    } else {
      layout = state.draft?.layout || state.live_layout || layout;
    }
    lastSnap = snapshot(); pseudo = new WeakMap();
    $('[data-admin-only]').hidden = !state.can_html;
    if (state.can_flag) $('[data-editor]').value = state.page.editor || 'legacy';
    document.title = `Site Studio: ${state.page.title || slug}`;
    if (!template) await loadTemplate();
    setMode(mode); renderJson(); updateChrome();
    if (!$('[data-history-panel]').hidden) renderHistory();
    firstRender = firstRender || !canvasDoc; await renderCanvas(); makeEditable();
  }
  window.__studio = { find: (id) => findBlock(id), get layout() { return layout; }, get selected() { return selected; }, get undo() { return undoStack.length; }, get redo() { return redoStack.length; }, get scale() { return scale; }, get sheet() { return sheet; }, get pick() { return pick && { id: pick.id, k: pick.k }; }, get dirty() { return isDirty(); }, select: (id) => { selected = id; afterSelect(); } };
  load().then(loadPages).catch((e) => { $('[data-pill]').textContent = `Could not load: ${e.message}`; });

  const CANVAS_CSS = `
.site-header,.home-sticky-nav,[data-sticky-nav]{position:relative!important;top:auto!important}
#sc-layer{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483000}
#sc-layer>div{position:absolute;box-sizing:border-box}
.sc-grid{pointer-events:none}
.sc-col{position:absolute;top:0;bottom:0;background:rgba(47,125,225,.045);border-left:1px solid rgba(47,125,225,.16);border-right:1px solid rgba(47,125,225,.16)}
.sc-hover{border:1.5px dashed rgba(47,125,225,.7);border-radius:8px}
.sc-sel{border:2.5px solid #2f7de1;border-radius:9px;box-shadow:0 0 0 4px rgba(47,125,225,.14)}
.sc-sel.is-dragging{opacity:.45}
.sc-name{position:absolute;left:-2px;top:-24px;display:flex;gap:4px;font:700 12px/1 "Work Sans",system-ui,sans-serif;white-space:nowrap}
.sc-name>span{background:#2f7de1;color:#fff;padding:5px 7px;border-radius:6px 6px 0 0}
.sc-lifted{opacity:.5!important;box-shadow:0 18px 40px rgba(10,30,70,.38)!important;outline:3px dashed #2f7de1!important;outline-offset:2px;position:relative;z-index:50;transition:none}
body.sc-picked{touch-action:none;-webkit-user-select:none;user-select:none}
#sc-dropline{position:absolute;height:4px;background:#c8102e;border-radius:2px;z-index:99999;pointer-events:none;box-shadow:0 0 0 2px #fff}
.sc-move{pointer-events:auto;cursor:grab;background:#0b2a5b!important;touch-action:none}
.sc-resize{touch-action:none}
body.sc-touch .sc-name{top:-34px;font-size:14px}
body.sc-touch .sc-name>span{padding:9px 11px}
body.sc-touch .sc-resize{width:28px;height:28px;right:-14px;bottom:-14px}
body.sc-touch{overflow-x:hidden}
.sc-resize{position:absolute;right:-8px;bottom:-8px;width:16px;height:16px;border-radius:50%;background:#2f7de1;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);pointer-events:auto;cursor:nwse-resize}
.sc-ghost{border:2.5px dashed #c8102e;border-radius:10px;background:rgba(200,16,46,.05)}
.sc-ghost.is-bad{border-color:#c8102e;background:rgba(200,16,46,.18)}
.sc-nb{border:2px solid rgba(47,125,225,.5);border-radius:9px;background:rgba(47,125,225,.07)}
.sc-line{background:#c8102e;border-radius:3px}
.sc-hint,.sc-hint2{transform:translate(-100%,-50%);font:800 13px/1 "Work Sans",system-ui,sans-serif;padding:6px 9px;border-radius:6px;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,.2)}
.sc-hint{background:#ffd21f;color:#0b2a5b}
.sc-hint.is-bad{background:#c8102e;color:#fff}
.sc-hint2{transform:translate(0,-50%);background:#d6e7ff;color:#0b2a5b}
[data-sc-block]{cursor:pointer}
.sc-name>span.sc-live-tag{background:#0f7a43}
.studio-live-hidden{border:2px dashed #0f7a43;border-radius:10px;padding:12px;color:#0f7a43;font:700 14px/1.3 "Work Sans",system-ui,sans-serif;text-align:center;background:rgba(15,122,67,.06)}
.sc-editable{outline:1.5px dashed rgba(47,125,225,.55);outline-offset:3px;cursor:text!important;border-radius:3px}
.sc-editable:focus{outline:2px solid #ffd21f;background:rgba(255,210,31,.12)}
body.sc-dragging,body.sc-dragging *{cursor:grabbing!important;user-select:none}
html{scroll-behavior:auto!important}
*{animation-play-state:paused!important}
.reveal,[data-reveal]{opacity:1!important;transform:none!important}
`;
})();
