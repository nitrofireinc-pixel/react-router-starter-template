/* Join visual editor pilot — Wix-style on-page canvas. GrapesJS engine, custom chrome. */
(function startVisualEditor() {
  const statusEl = document.querySelector('[data-visual-status]');
  const addDrawer = document.querySelector('[data-visual-add-drawer]');
  const addGrid = document.querySelector('[data-visual-add-grid]');
  const historyDrawer = document.querySelector('[data-visual-versions]');
  const imageModal = document.querySelector('[data-visual-image-modal]');
  const photoGrid = document.querySelector('[data-visual-photo-grid]');
  const uploadInput = document.querySelector('[data-visual-upload]');
  const linkModal = document.querySelector('[data-visual-link-modal]');
  const linkForm = document.querySelector('[data-visual-link-form]');
  const deviceSelect = document.querySelector('[data-visual-device-select]');
  const ASSET_VERSION = (() => {
    try {
      const script = document.currentScript || document.querySelector('script[src*="admin-visual.js"]');
      return new URL(script?.src || '', window.location.origin).searchParams.get('v') || '';
    } catch {
      return '';
    }
  })();
  function versionedAsset(path) {
    if (!ASSET_VERSION || /[?&]v=/.test(path)) return path;
    return `${path}${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(ASSET_VERSION)}`;
  }

  const SITE_PHOTOS = [
    { url: '/assets/efhs-logo.png', alt_text: 'EFHS logo' },
    { url: '/assets/efhs-blue-regiment-mark.png', alt_text: 'Blue Regiment mark' },
    { url: '/assets/efhs-icon.png', alt_text: 'EFHS icon' },
    { url: '/assets/efhs-header-banner.jpg', alt_text: 'Header banner' },
    { url: '/assets/efhs-home-hero.jpg', alt_text: 'Home hero' },
    { url: '/assets/efhs-hero.png', alt_text: 'Hero photo' },
    { url: '/assets/efhs-photo-1.png', alt_text: 'Band photo 1' },
    { url: '/assets/efhs-photo-2.png', alt_text: 'Band photo 2' },
    { url: '/assets/home/band-2024-25.jpg', alt_text: 'Band 2024-25' },
    { url: '/assets/home/mattress-flyer.jpg', alt_text: 'Mattress fundraiser flyer' },
    { url: '/assets/home/aireserv.jpg', alt_text: 'Aire Serv' },
    { url: '/assets/home/home2-13.jpg', alt_text: 'Band performance' },
    { url: '/assets/home/home2-17.jpg', alt_text: 'Color guard' },
    { url: '/assets/home/perf-5.jpg', alt_text: 'Marching band' },
    { url: '/assets/home/perf-6.jpg', alt_text: 'Home game performance' },
    { url: '/assets/home/woodwind-practice.jpg', alt_text: 'Woodwind practice' },
    { url: '/assets/home/percussion-practice.png', alt_text: 'Percussion practice' },
    { url: '/assets/home/brass-practice.jpg', alt_text: 'Brass practice' },
    { url: '/assets/home/march-on.jpg', alt_text: 'March on' },
    { url: '/assets/home/glenn-1.jpg', alt_text: 'Away game at Glenn' },
    { url: '/assets/home/glenn-8.jpg', alt_text: 'Away game at Glenn' },
    { url: '/assets/home/home1-1.jpg', alt_text: 'First home game' },
    { url: '/assets/home/home1-4.jpg', alt_text: 'First home game' },
    { url: '/assets/home/home1-5.jpg', alt_text: 'First home game' },
    { url: '/assets/home/home1-6.jpg', alt_text: 'Home game' },
    { url: '/assets/home/booster-president.jpg', alt_text: 'Booster president' },
    { url: '/assets/home/booster-vp.jpg', alt_text: 'Booster vice president' },
  ];

  const BLOCKS = [
    {
      id: 'hero',
      label: 'Hero',
      hint: 'Title and intro',
      html: '<section class="page-hero" data-visual-block="hero"><div class="page-title"><div class="kicker">Join</div><h1>Join the Band</h1><p>Tell families what happens next.</p></div></section>',
    },
    {
      id: 'hero-card',
      label: 'Hero card',
      hint: 'Photo and list',
      html: '<aside class="hero-card" data-visual-block="hero-card"><img src="/assets/efhs-blue-regiment-mark.png" alt="East Forsyth Blue Regiment"><h2>Hero card</h2><ul><li>First point</li><li>Second point</li></ul></aside>',
    },
    {
      id: 'text',
      label: 'Text',
      hint: 'Heading and paragraph',
      html: '<div class="card" data-visual-block="text"><h2>Heading</h2><p>Add a short paragraph. Double-click text to edit.</p></div>',
    },
    {
      id: 'photo',
      label: 'Photo',
      hint: 'Image and caption',
      html: '<figure data-visual-block="photo"><img src="/assets/home/band-2024-25.jpg" alt="East Forsyth High School Band"><figcaption>Replace this with a photo from the site library.</figcaption></figure>',
    },
    {
      id: 'button',
      label: 'Button',
      hint: 'Link button',
      html: '<p><a class="btn gold" href="/contact.html">Contact the band</a></p>',
    },
    {
      id: 'accordion',
      label: 'Dropdown',
      hint: 'Question and answer',
      html: '<details class="visual-accordion" data-visual-block="accordion"><summary>Question</summary><div class="visual-accordion-body"><p>Answer</p></div></details>',
    },
  ];

  let dirty = false;
  let applyingResponsive = false;
  let bootstrapped = false;

  function markDirty() {
    if (bootstrapped) dirty = true;
    syncHistoryButtons();
  }

  function clearDirty() {
    dirty = false;
  }

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.hidden = !message;
    statusEl.textContent = message || '';
    statusEl.classList.toggle('is-error', Boolean(isError));
  }

  async function jsonFetch(url, options) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        accept: 'application/json',
        ...(options?.body && !(options.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
        ...(options?.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.detail || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function formatHistoryTime(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const iso = /Z|[+-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return raw;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(date);
  }

  function fallbackChrome(draftHtml) {
    return `<div class="utility"><div class="wrap"><span>East Forsyth Band</span></div></div><header class="site-header"><div class="header-inner"><a class="brand" href="/"><img class="brand-logo" src="/assets/efhs-logo.png" alt="East Forsyth Band logo"><span>East Forsyth Band</span><img class="brand-mark" src="/assets/efhs-blue-regiment-mark.png" alt="East Forsyth Blue Regiment"></a></div><nav id="site-nav" aria-label="Main navigation"><a href="/">Home</a><a href="/join.html">Join</a><a href="/contact.html">Contact</a></nav></header><main id="main">${draftHtml}</main><footer class="footer"><div class="wrap"><h3>East Forsyth Band</h3><small>School colors and imagery sourced from East Forsyth High School assets provided with permission.</small></div></footer>`;
  }

  async function loadLiveCanvasHtml(draftHtml) {
    try {
      const response = await fetch('/join.html', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('Live page unavailable');
      const liveHtml = await response.text();
      const doc = new DOMParser().parseFromString(liveHtml, 'text/html');
      doc.querySelectorAll('script').forEach((node) => node.remove());
      const main = doc.querySelector('#main') || doc.querySelector('main');
      if (!main) throw new Error('Live page has no main');
      main.innerHTML = draftHtml;
      doc.body.classList.add('efhs-theme', 'coming-soon-page', 'visual-page-join');
      return { html: doc.body.innerHTML, bodyClass: doc.body.className };
    } catch (_) {
      return {
        html: fallbackChrome(draftHtml),
        bodyClass: 'efhs-theme coming-soon-page visual-page-join',
      };
    }
  }

  function setDrawer(el, open) {
    if (!el) return;
    el.hidden = !open;
  }

  if (typeof grapesjs === 'undefined') {
    setStatus('GrapesJS failed to load. Check the vendor files and reload.', true);
    return;
  }

  const editor = grapesjs.init({
    container: '#gjs',
    height: '100%',
    width: 'auto',
    fromElement: false,
    storageManager: false,
    noticeOnUnload: false,
    showDevices: false,
    showOffsets: true,
    avoidInlineStyle: true,
    forceClass: false,
    panels: { defaults: [] },
    blockManager: { blocks: [] },
    layerManager: { appendTo: '#visual-gjs-sink' },
    styleManager: { appendTo: '#visual-gjs-sink' },
    traitManager: { appendTo: '#visual-gjs-sink' },
    selectorManager: { componentFirst: true, appendTo: '#visual-gjs-sink' },
    deviceManager: {
      devices: [
        { id: 'Desktop', name: '1920', width: '' },
        { id: 'Laptop', name: '1280', width: '1280px', widthMedia: '1280px' },
        { id: 'Tablet', name: '768', width: '768px', widthMedia: '768px' },
        { id: 'Phone', name: '390', width: '390px', widthMedia: '390px' },
        { id: 'Small', name: '320', width: '320px', widthMedia: '320px' },
      ],
    },
    canvas: {
      styles: [
        'https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Work+Sans:wght@400;500;700;800&display=swap',
        versionedAsset('/styles.css'),
        versionedAsset('/public-theme.css'),
        versionedAsset('/home-redesign.css'),
        versionedAsset('/admin-visual.css'),
      ],
    },
    richTextEditor: {
      actions: ['bold', 'italic', 'underline', 'wrap', 'link'],
    },
  });

  function isWrapper(comp) {
    return !comp || comp === editor.getWrapper() || comp.get('type') === 'wrapper';
  }

  function isMain(comp) {
    if (!comp || isWrapper(comp)) return false;
    const tag = String(comp.get('tagName') || '').toLowerCase();
    const id = String(comp.getAttributes()?.id || '');
    return tag === 'main' || id === 'main';
  }

  function isInsideMain(comp) {
    let current = comp;
    while (current) {
      if (isMain(current)) return true;
      current = current.parent();
    }
    return false;
  }

  function lockChrome(comp) {
    comp.set({
      selectable: false,
      hoverable: false,
      highlightable: false,
      draggable: false,
      droppable: false,
      copyable: false,
      removable: false,
      editable: false,
      resizable: false,
      locked: true,
    });
  }

  function lockMainFrame(comp) {
    comp.set({
      selectable: false,
      hoverable: false,
      highlightable: false,
      draggable: false,
      droppable: true,
      copyable: false,
      removable: false,
      editable: false,
      resizable: false,
    });
  }

  function makeEditable(comp) {
    const tag = String(comp.get('tagName') || '').toLowerCase();
    if (tag === 'summary') {
      comp.set({
        selectable: false,
        hoverable: false,
        highlightable: false,
        draggable: false,
        copyable: false,
        removable: false,
        editable: true,
        resizable: false,
        droppable: false,
      });
      return;
    }
    const textTags = ['p', 'h1', 'h2', 'h3', 'h4', 'li', 'span', 'figcaption', 'a'];
    const isDetails = tag === 'details';
    comp.set({
      selectable: true,
      hoverable: true,
      highlightable: true,
      draggable: true,
      copyable: true,
      removable: true,
      editable: textTags.includes(tag),
      droppable: ['section', 'div', 'article', 'aside', 'figure'].includes(tag),
      resizable: {
        tl: 1, tc: 1, tr: 1, cl: 1, cr: 1, bl: 1, bc: 1, br: 1,
        minDim: 24,
      },
    });
    if (isDetails) {
      comp.set({
        droppable: false,
        editable: false,
      });
    }
  }

  function applyComponentRules(comp) {
    if (isWrapper(comp)) return;
    if (isMain(comp)) {
      lockMainFrame(comp);
      return;
    }
    if (isInsideMain(comp)) {
      makeEditable(comp);
      return;
    }
    lockChrome(comp);
  }

  function applyRulesTree(comp) {
    applyComponentRules(comp);
    (comp.components?.() || []).forEach(applyRulesTree);
  }

  function findMain() {
    const wrapper = editor.getWrapper();
    return wrapper.find('#main')[0] || wrapper.find('main')[0] || null;
  }

  function findContentWrap() {
    const main = findMain();
    if (!main) return null;
    return main.find('.visual-join-wrap')[0]
      || main.find('section.content .wrap')[0]
      || main.find('.content .wrap')[0]
      || main.find('.content')[0]
      || null;
  }

  function currentMediaText() {
    const em = editor.em || editor.getModel?.();
    if (typeof em?.getCurrentMedia === 'function') return String(em.getCurrentMedia() || '');
    const device = editor.Devices?.get?.(editor.getDevice());
    const widthMedia = device?.get?.('widthMedia');
    return widthMedia ? `(max-width: ${String(widthMedia).replace(/px$/i, '')}px)` : '';
  }

  function clearInlineBoxStyle(comp) {
    if (!comp) return;
    const stored = { ...(comp.get('style') || {}) };
    ['width', 'max-width', 'min-width', 'height', 'max-height', 'min-height'].forEach((prop) => {
      delete stored[prop];
    });
    comp.set('style', stored);
    const el = comp.view?.el || comp.getEl?.();
    if (el?.style) {
      el.style.width = '';
      el.style.maxWidth = '';
      el.style.minWidth = '';
      el.style.height = '';
      el.style.maxHeight = '';
    }
  }

  function writeDeviceBox(comp, box = {}) {
    if (!comp) return;
    const id = comp.getId();
    const media = currentMediaText();
    const tag = String(comp.get('tagName') || '').toLowerCase();
    const next = {};
    if (box.width && /^\s*\d+(\.\d+)?px\s*$/i.test(box.width)) {
      next['max-width'] = box.width.trim();
      next.width = tag === 'img' ? 'auto' : '100%';
    }
    if (box.height && /^\s*\d+(\.\d+)?px\s*$/i.test(box.height)) {
      next.height = box.height.trim();
    }
    clearInlineBoxStyle(comp);
    if (media) {
      const base = editor.Css.getIdRule(id);
      if (base) {
        const baseStyle = { ...(base.getStyle() || {}) };
        delete baseStyle.width;
        delete baseStyle['max-width'];
        delete baseStyle.height;
        base.setStyle(baseStyle);
      }
    }
    const existing = editor.Css.getIdRule(id, { mediaText: media });
    editor.Css.setIdRule(id, { ...(existing?.getStyle?.() || {}), ...next }, { mediaText: media });
  }

  function makeWidthResponsive(comp) {
    if (!comp || applyingResponsive || resizeSession) return;
    const style = comp.getStyle() || {};
    const width = String(style.width || '');
    if (!/^\s*\d+(\.\d+)?px\s*$/i.test(width)) return;
    applyingResponsive = true;
    writeDeviceBox(comp, { width: width.trim(), height: style.height });
    applyingResponsive = false;
  }

  function walkResponsive(comp) {
    makeWidthResponsive(comp);
    (comp.components?.() || []).forEach(walkResponsive);
  }

  function stripLegacyInlineWidths(comp) {
    clearInlineBoxStyle(comp);
    (comp.components?.() || []).forEach(stripLegacyInlineWidths);
  }

  function splitVisualCss(html = '') {
    const source = String(html || '');
    const match = source.match(/<style\b[^>]*data-visual-css[^>]*>([\s\S]*?)<\/style>/i);
    return {
      css: match?.[1] || '',
      html: source.replace(/<style\b[^>]*data-visual-css[^>]*>[\s\S]*?<\/style>/gi, ''),
    };
  }

  function exportEditableHtml() {
    const main = findMain();
    if (!main) return editor.getHtml();
    walkResponsive(main);
    const html = main.components().map((comp) => comp.toHTML()).join('');
    const css = String(editor.getCss({ clearStyles: false }) || '').trim();
    return css ? `<style data-visual-css>${css}</style>${html}` : html;
  }

  function selectableParent(comp) {
    let current = comp?.parent?.();
    while (current && !isWrapper(current) && !isMain(current)) {
      if (isInsideMain(current)) return current;
      current = current.parent();
    }
    return null;
  }

  function detailsOf(comp) {
    let current = comp;
    while (current) {
      if (String(current.get('tagName') || '').toLowerCase() === 'details') return current;
      current = current.parent();
    }
    return null;
  }

  function renderVersions(versions) {
    if (!historyDrawer) return;
    const rows = Array.isArray(versions) ? versions : [];
    historyDrawer.innerHTML = `<div class="visual-add-drawer-head"><h2>History</h2><button type="button" data-visual-history-close>Close</button></div><p>Keeps the last 20 saves.</p>${
      rows.length
        ? rows.map((row) => (
          `<button type="button" data-restore="${row.id}"><b>${row.kind === 'publish' ? 'Published' : 'Draft'}</b> <small>${formatHistoryTime(row.created_at)}${row.created_by_name ? ` · ${row.created_by_name}` : ''}</small></button>`
        )).join('')
        : '<p>No versions yet.</p>'
    }`;
    historyDrawer.querySelector('[data-visual-history-close]')?.addEventListener('click', () => setDrawer(historyDrawer, false));
    historyDrawer.querySelectorAll('[data-restore]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!window.confirm('Restore this version into the draft?')) return;
        try {
          const state = await jsonFetch('/api/admin/visual-pages/join/restore', {
            method: 'POST',
            body: JSON.stringify({ version_id: Number(button.dataset.restore) }),
          });
          await loadCanvas(state.draft_html || '');
          renderVersions(state.versions);
          setDrawer(historyDrawer, false);
          markDirty();
          setStatus('Draft restored. Publish when you want it on the public join page.');
        } catch (error) {
          setStatus(error.message, true);
        }
      });
    });
  }

  function insertBlock(block) {
    const main = findMain();
    if (!main) {
      editor.addComponents(block.html);
      return;
    }
    if (block.id === 'hero') {
      const content = main.find('section.content')[0] || main.find('.content')[0];
      if (content?.parent?.()) {
        content.parent().components().add(block.html, { at: content.index() });
      } else {
        main.append(block.html);
      }
      return;
    }
    let wrap = findContentWrap();
    if (!wrap) {
      main.append('<section class="content"><div class="wrap visual-join-wrap"></div></section>');
      wrap = findContentWrap();
    }
    (wrap || main).append(block.html);
  }

  function renderAddGallery() {
    if (!addGrid) return;
    addGrid.innerHTML = BLOCKS.map((block) => (
      `<button type="button" class="visual-add-card" data-add-block="${block.id}">
        <span class="visual-add-card-preview" data-preview="${block.id}"></span>
        <b>${block.label}</b>
        <small>${block.hint}</small>
      </button>`
    )).join('');
    addGrid.querySelectorAll('[data-add-block]').forEach((button) => {
      button.addEventListener('click', () => {
        const block = BLOCKS.find((item) => item.id === button.dataset.addBlock);
        if (!block) return;
        insertBlock(block);
        setDrawer(addDrawer, false);
        markDirty();
        setStatus(`Added ${block.label}. Click it on the page to move, resize, or delete.`);
      });
    });
  }

  function syncHistoryButtons() {
    const undo = document.querySelector('[data-visual-undo]');
    const redo = document.querySelector('[data-visual-redo]');
    const canUndo = Boolean(editor.UndoManager?.hasUndo?.());
    const canRedo = Boolean(editor.UndoManager?.hasRedo?.());
    if (undo) undo.disabled = !canUndo;
    if (redo) redo.disabled = !canRedo;
  }

  function clearLoadHistory() {
    editor.UndoManager?.clear?.();
    syncHistoryButtons();
  }

  function canvasIsNearEmpty() {
    const text = String(exportEditableHtml() || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return !/[a-z0-9]/i.test(text);
  }

  async function loadCanvas(draftHtml) {
    editor.UndoManager?.stop?.();
    const split = splitVisualCss(draftHtml);
    const frame = await loadLiveCanvasHtml(split.html);
    editor.setComponents(frame.html);
    if (split.css) editor.setStyle(split.css);
    const doc = editor.Canvas.getDocument();
    if (doc?.body) doc.body.className = frame.bodyClass;
    applyRulesTree(editor.getWrapper());
    stripLegacyInlineWidths(findMain() || editor.getWrapper());
    editor.UndoManager?.start?.();
    clearLoadHistory();
  }

  editor.on('load', () => {
    const doc = editor.Canvas.getDocument();
    if (doc?.body) doc.body.classList.add('efhs-theme', 'coming-soon-page', 'visual-page-join');
    applyRulesTree(editor.getWrapper());
  });

  editor.on('component:add', (comp) => {
    applyComponentRules(comp);
    (comp.components?.() || []).forEach(applyRulesTree);
    markDirty();
  });

  editor.on('component:remove', () => markDirty());
  editor.on('component:update', () => markDirty());
  editor.on('component:styleUpdate', (comp) => {
    if (resizeSession) return;
    makeWidthResponsive(comp);
    markDirty();
  });

  let resizeSession = null;

  function cloneStyle(comp) {
    return { ...(comp?.getStyle?.() || {}) };
  }

  editor.on('component:resize', (opts = {}) => {
    const comp = opts.component || editor.getSelected();
    if (opts.type === 'start' && comp) {
      resizeSession = {
        comp,
        media: currentMediaText(),
        before: cloneStyle(comp),
      };
      editor.UndoManager.stop();
      return;
    }
    if (opts.type === 'end' && resizeSession) {
      const target = resizeSession.comp || comp;
      const before = resizeSession.before || {};
      const media = resizeSession.media || currentMediaText();
      const after = cloneStyle(target);
      resizeSession = null;
      editor.UndoManager.start();
      if (!target) return;
      editor.UndoManager.skip(() => {
        const id = target.getId();
        const existing = editor.Css.getIdRule(id, { mediaText: media });
        if (existing) existing.setStyle(before);
        clearInlineBoxStyle(target);
      });
      writeDeviceBox(target, after);
      markDirty();
      clampSelectionToolbarSoon();
    }
  });

  function clampSelectionToolbarSoon() {
    requestAnimationFrame(() => {
      clampSelectionToolbar();
      requestAnimationFrame(clampSelectionToolbar);
    });
  }

  function clampSelectionToolbar() {
    const toolbar = document.querySelector('.gjs-toolbar');
    const frame = document.querySelector('.gjs-frame-wrapper');
    if (!toolbar || !frame || toolbar.style.display === 'none') return;
    const limit = frame.getBoundingClientRect();
    if (!limit.width) return;
    const minWidth = 240;
    const maxInside = Math.max(minWidth, Math.floor(limit.width - 8));
    toolbar.style.minWidth = `${minWidth}px`;
    toolbar.style.width = 'max-content';
    toolbar.style.maxWidth = `${Math.min(304, maxInside)}px`;
    const box = toolbar.getBoundingClientRect();
    if (!box.width) return;
    let shift = 0;
    if (box.left < limit.left + 4) shift += (limit.left + 4) - box.left;
    if (box.right + shift > limit.right - 4) shift -= (box.right + shift) - (limit.right - 4);
    if (!shift) return;
    const left = Number.parseFloat(toolbar.style.left || '0') || 0;
    toolbar.style.left = `${left + shift}px`;
  }

  editor.Commands.add('visual-image', {
    run() {
      setDrawer(imageModal, true);
    },
  });

  editor.Commands.add('visual-link', {
    run() {
      const selected = editor.getSelected();
      const current = selected?.getAttributes?.().href
        || selected?.closest?.('a')?.getAttributes?.().href
        || '';
      const input = linkForm?.querySelector('input[name="href"]');
      if (input) input.value = current;
      setDrawer(linkModal, true);
      input?.focus();
    },
  });

  editor.Commands.add('visual-parent', {
    run() {
      const selected = editor.getSelected();
      const parent = selectableParent(selected);
      if (parent) editor.select(parent);
    },
  });

  editor.on('component:selected', (comp) => {
    if (!comp || isWrapper(comp) || isMain(comp) || !isInsideMain(comp)) {
      editor.select(null);
      return;
    }
    const tag = String(comp.get('tagName') || '').toLowerCase();
    if (tag === 'summary') {
      const details = detailsOf(comp);
      if (details && details !== comp) {
        editor.select(details);
        return;
      }
    }
    const toolbar = [];
    const svgIcon = (path) => `<svg class="visual-tool-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="${path}"/></svg>`;
    const tool = (command, title, icon) => ({
      command,
      label: `<span title="${title}" aria-label="${title}">${icon}</span>`,
    });
    if (selectableParent(comp)) {
      toolbar.push(tool('visual-parent', 'Select parent', svgIcon('M8 2.2 2.8 7.2h2.6V13.8h5.2V7.2h2.6z')));
    }
    toolbar.push(tool('tlb-move', 'Move', svgIcon('M8.7 1.4h-1.4l-2 2 1 1L7.3 3.6v2.7H4.6l.8-1-1-1-2 2 2 2 1-1-.8-1h2.7v2.7l-1.1-1.1-1 1 2 2 2-2-1-1-1.1 1.1V8.3h2.7l-.8 1 1 1 2-2-2-2-1 1 .8 1H8.7V3.6l1.1 1.1 1-1z')));
    toolbar.push(tool('tlb-clone', 'Copy', svgIcon('M6 3.2h7.2v7.2H6zm-2.4 2.4h1.6v6.4h6.4v1.6H3.6z')));
    if (tag === 'img' || (comp.find && comp.find('img').length)) {
      toolbar.push(tool('visual-image', 'Image', svgIcon('M2.2 3.2h11.6v9.6H2.2zm1.6 1.6v6.4h8.4V4.8zM4.6 9.2l2-2.2 1.5 1.6 2.1-2.4 2 2.2v2H4.6zm2.2-3.4a1 1 0 1 0 0 2 1 1 0 0 0 0-2z')));
    }
    toolbar.push(tool('visual-link', 'Link', svgIcon('M6.3 8.9a2.6 2.6 0 0 1 0-3.7l1.6-1.6a2.6 2.6 0 0 1 3.7 3.7l-.8.8-1.1-1.1.8-.8a1.1 1.1 0 1 0-1.5-1.5L7.4 6.3A1.1 1.1 0 0 0 9 7.8l-1.1 1.1zm3.4-1.8a2.6 2.6 0 0 1 0 3.7L8.1 12.4a2.6 2.6 0 1 1-3.7-3.7l.8-.8 1.1 1.1-.8.8a1.1 1.1 0 1 0 1.5 1.5l1.6-1.6a1.1 1.1 0 0 0-1.6-1.5z')));
    toolbar.push(tool('tlb-delete', 'Delete', svgIcon('M3.2 4.2h9.6v1.3H3.2zm2 2.2h1.3v6.2H5.2zm4.3 0h1.3v6.2H9.5zM6.1 2.2h3.8l.7 1.1H5.4z')));
    comp.set('toolbar', toolbar);
    clampSelectionToolbarSoon();
  });

  function setActiveDevice(id) {
    editor.setDevice(id);
    if (deviceSelect) deviceSelect.value = id;
    clampSelectionToolbarSoon();
  }
  deviceSelect?.addEventListener('change', () => setActiveDevice(deviceSelect.value));
  setActiveDevice('Desktop');

  document.querySelector('[data-visual-undo]')?.addEventListener('click', () => {
    if (!editor.UndoManager.hasUndo()) return;
    editor.UndoManager.undo();
    syncHistoryButtons();
  });
  document.querySelector('[data-visual-redo]')?.addEventListener('click', () => {
    if (!editor.UndoManager.hasRedo()) return;
    editor.UndoManager.redo();
    syncHistoryButtons();
  });
  editor.on('update', syncHistoryButtons);
  syncHistoryButtons();
  document.querySelector('[data-visual-add]')?.addEventListener('click', () => {
    setDrawer(historyDrawer, false);
    setDrawer(addDrawer, Boolean(addDrawer?.hidden));
  });
  document.querySelector('[data-visual-add-close]')?.addEventListener('click', () => setDrawer(addDrawer, false));
  document.querySelector('[data-visual-history]')?.addEventListener('click', () => {
    setDrawer(addDrawer, false);
    setDrawer(historyDrawer, Boolean(historyDrawer?.hidden));
  });
  document.querySelector('[data-visual-image-close]')?.addEventListener('click', () => setDrawer(imageModal, false));
  document.querySelector('[data-visual-link-close]')?.addEventListener('click', () => setDrawer(linkModal, false));
  document.querySelector('[data-visual-exit]')?.addEventListener('click', (event) => {
    if (!dirty) return;
    if (!window.confirm('You have unsaved changes. Leave anyway?')) event.preventDefault();
  });
  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  renderAddGallery();

  async function save(action) {
    if (canvasIsNearEmpty()) {
      setStatus('Add some page content before saving.', true);
      return;
    }
    try {
      setStatus(action === 'publish' ? 'Publishing…' : 'Saving draft…');
      const state = await jsonFetch('/api/admin/visual-pages/join', {
        method: 'PUT',
        body: JSON.stringify({ action, html: exportEditableHtml() }),
      });
      renderVersions(state.versions);
      clearDirty();
      setStatus(action === 'publish' ? 'Published to the live page.' : 'Draft saved.');
    } catch (error) {
      setStatus(error.message, true);
    }
  }
  document.querySelector('[data-visual-draft]')?.addEventListener('click', () => save('draft'));
  document.querySelector('[data-visual-publish]')?.addEventListener('click', () => {
    if (!window.confirm("Publishing replaces this page's content on the live page.")) return;
    save('publish');
  });

  function selectedImage() {
    const selected = editor.getSelected();
    if (!selected) return null;
    if (String(selected.get('tagName') || '').toLowerCase() === 'img') return selected;
    return selected.find?.('img')[0] || null;
  }

  async function applyImage(url) {
    const image = selectedImage();
    if (!image || !url) return;
    image.addAttributes({ src: url });
    image.set('src', url);
    setDrawer(imageModal, false);
    markDirty();
    setStatus('Image updated.');
  }

  async function renderPhotos() {
    if (!photoGrid) return;
    const photos = await jsonFetch('/api/photos').catch(() => []);
    const seen = new Set();
    const list = [];
    [...(Array.isArray(photos) ? photos : []), ...SITE_PHOTOS].forEach((photo) => {
      if (!photo?.url || seen.has(photo.url)) return;
      seen.add(photo.url);
      list.push(photo);
    });
    photoGrid.innerHTML = list.map((photo) => (
      `<button type="button" data-photo-src="${photo.url}"><img src="${photo.url}" alt="${photo.alt_text || photo.filename || 'Photo'}"></button>`
    )).join('');
    photoGrid.querySelectorAll('[data-photo-src]').forEach((button) => {
      button.addEventListener('click', () => applyImage(button.dataset.photoSrc));
    });
  }

  uploadInput?.addEventListener('change', async () => {
    const file = uploadInput.files?.[0];
    uploadInput.value = '';
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    body.append('alt_text', file.name.replace(/\.[^.]+$/, '') || 'Photo');
    try {
      const stored = await jsonFetch('/api/admin/photos', { method: 'POST', body });
      if (stored?.url) {
        await renderPhotos();
        await applyImage(stored.url);
      }
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  linkForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const href = String(new FormData(linkForm).get('href') || '').trim();
    const selected = editor.getSelected();
    if (!selected || !href) return;
    if (/^(javascript:|data:|blob:)/i.test(href) || !/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(href)) {
      setStatus('Use a page path like /contact.html, or https://, mailto:, tel:, or #.', true);
      return;
    }
    if (String(selected.get('tagName') || '').toLowerCase() === 'a') {
      selected.addAttributes({ href });
    } else {
      const nested = selected.closest?.('a');
      if (nested) nested.addAttributes({ href });
      else selected.replaceWith(`<a href="${href}">${selected.toHTML()}</a>`);
    }
    setDrawer(linkModal, false);
    markDirty();
    setStatus('Link updated.');
  });

  (async function boot() {
    try {
      const state = await jsonFetch('/api/admin/visual-pages/join');
      await loadCanvas(state.draft_html || '');
      renderVersions(state.versions);
      await renderPhotos().catch(() => {});
      clearDirty();
      clearLoadHistory();
      bootstrapped = true;
      setStatus('Click any part of the page to select it, then move, resize, add, or delete.');
    } catch (error) {
      if (error.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      setStatus(error.message, true);
    }
  }());
}());
