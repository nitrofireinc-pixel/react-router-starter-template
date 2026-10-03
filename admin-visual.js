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
    avoidInlineStyle: false,
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
        { id: 'Phone', name: '390', width: '390px', widthMedia: '420px' },
        { id: 'Small', name: '320', width: '320px', widthMedia: '360px' },
      ],
    },
    canvas: {
      styles: [
        'https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Work+Sans:wght@400;500;700;800&display=swap',
        '/styles.css',
        '/public-theme.css',
        '/home-redesign.css',
        '/admin-visual.css',
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
    const textTags = ['p', 'h1', 'h2', 'h3', 'h4', 'li', 'span', 'summary', 'figcaption', 'a'];
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

  function exportEditableHtml() {
    const main = findMain();
    if (!main) return editor.getHtml();
    return main.components().map((comp) => comp.toHTML()).join('');
  }

  function renderVersions(versions) {
    if (!historyDrawer) return;
    const rows = Array.isArray(versions) ? versions : [];
    historyDrawer.innerHTML = `<div class="visual-add-drawer-head"><h2>History</h2><button type="button" data-visual-history-close>Close</button></div>${
      rows.length
        ? rows.map((row) => (
          `<button type="button" data-restore="${row.id}"><b>${row.kind === 'publish' ? 'Published' : 'Draft'}</b><small>${row.created_at || ''}${row.created_by_name ? ` · ${row.created_by_name}` : ''}</small></button>`
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
          setStatus('Draft restored. Publish when you want it on the public join page.');
        } catch (error) {
          setStatus(error.message, true);
        }
      });
    });
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
        const main = findMain();
        if (main) main.append(block.html);
        else editor.addComponents(block.html);
        setDrawer(addDrawer, false);
        setStatus(`Added ${block.label}. Click it on the page to move, resize, or delete.`);
      });
    });
  }

  async function loadCanvas(draftHtml) {
    const frame = await loadLiveCanvasHtml(draftHtml);
    editor.setComponents(frame.html);
    const doc = editor.Canvas.getDocument();
    if (doc?.body) doc.body.className = frame.bodyClass;
    applyRulesTree(editor.getWrapper());
  }

  editor.on('load', () => {
    const doc = editor.Canvas.getDocument();
    if (doc?.body) doc.body.classList.add('efhs-theme', 'coming-soon-page', 'visual-page-join');
    applyRulesTree(editor.getWrapper());
  });

  editor.on('component:add', (comp) => {
    applyComponentRules(comp);
    (comp.components?.() || []).forEach(applyRulesTree);
  });

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

  editor.on('component:selected', (comp) => {
    if (!comp || isWrapper(comp) || isMain(comp) || !isInsideMain(comp)) {
      editor.select(null);
      return;
    }
    const tag = String(comp.get('tagName') || '').toLowerCase();
    const toolbar = [
      { command: 'tlb-move', label: 'Move' },
      { command: 'tlb-clone', label: 'Copy' },
    ];
    if (tag === 'img' || (comp.find && comp.find('img').length)) {
      toolbar.push({ command: 'visual-image', label: 'Image' });
    }
    toolbar.push({ command: 'visual-link', label: 'Link' });
    toolbar.push({ command: 'tlb-delete', label: 'Delete' });
    comp.set('toolbar', toolbar);
  });

  document.querySelectorAll('[data-device]').forEach((button) => {
    button.addEventListener('click', () => {
      editor.setDevice(button.dataset.device);
      document.querySelectorAll('[data-device]').forEach((node) => node.classList.toggle('is-active', node === button));
    });
  });
  document.querySelector('[data-device="Desktop"]')?.classList.add('is-active');

  document.querySelector('[data-visual-undo]')?.addEventListener('click', () => editor.UndoManager.undo());
  document.querySelector('[data-visual-redo]')?.addEventListener('click', () => editor.UndoManager.redo());
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

  renderAddGallery();

  async function save(action) {
    try {
      setStatus(action === 'publish' ? 'Publishing…' : 'Saving draft…');
      const state = await jsonFetch('/api/admin/visual-pages/join', {
        method: 'PUT',
        body: JSON.stringify({ action, html: exportEditableHtml() }),
      });
      renderVersions(state.versions);
      setStatus(action === 'publish' ? 'Published to the preview site.' : 'Draft saved.');
    } catch (error) {
      setStatus(error.message, true);
    }
  }
  document.querySelector('[data-visual-draft]')?.addEventListener('click', () => save('draft'));
  document.querySelector('[data-visual-publish]')?.addEventListener('click', () => save('publish'));

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
    setStatus('Image updated.');
  }

  async function renderPhotos() {
    if (!photoGrid) return;
    const photos = await jsonFetch('/api/photos').catch(() => []);
    const extras = [
      { url: '/assets/efhs-logo.png', alt_text: 'EFHS logo' },
      { url: '/assets/efhs-blue-regiment-mark.png', alt_text: 'Blue Regiment mark' },
      { url: '/assets/home/band-2024-25.jpg', alt_text: 'Band photo' },
    ];
    const list = [...(Array.isArray(photos) ? photos : []), ...extras];
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
    if (String(selected.get('tagName') || '').toLowerCase() === 'a') {
      selected.addAttributes({ href });
    } else {
      const nested = selected.closest?.('a');
      if (nested) nested.addAttributes({ href });
      else selected.replaceWith(`<a href="${href}">${selected.toHTML()}</a>`);
    }
    setDrawer(linkModal, false);
    setStatus('Link updated.');
  });

  (async function boot() {
    try {
      const state = await jsonFetch('/api/admin/visual-pages/join');
      await loadCanvas(state.draft_html || '');
      renderVersions(state.versions);
      await renderPhotos().catch(() => {});
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
