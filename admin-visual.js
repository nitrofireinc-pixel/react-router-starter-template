/* Join visual editor pilot — GrapesJS canvas. Admin-only. */
(function startVisualEditor() {
  const statusEl = document.querySelector('[data-visual-status]');
  const versionEl = document.querySelector('[data-visual-versions]');

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

  function block(id, label, html) {
    return { id, label, category: 'East Forsyth', content: html };
  }

  const BLOCKS = [
    block('hero', 'Hero', '<section class="page-hero" data-visual-block="hero"><div class="page-title"><div class="kicker">Join</div><h1>Join the Band</h1><p>Tell families what happens next.</p></div></section>'),
    block('hero-card', 'Hero card', '<aside class="hero-card" data-visual-block="hero-card"><img src="/assets/efhs-blue-regiment-mark.png" alt="East Forsyth Blue Regiment"><h2>Hero card</h2><ul><li>First point</li><li>Second point</li></ul></aside>'),
    block('text', 'Text', '<div class="card" data-visual-block="text"><h2>Heading</h2><p>Add a short paragraph. Select text to bold, italicize, or add a link.</p></div>'),
    block('photo', 'Photo', '<figure data-visual-block="photo"><a href="/join.html"><img src="/assets/home/band-2024-25.jpg" alt="East Forsyth High School Band"></a><figcaption>Replace this with a photo from the site library.</figcaption></figure>'),
    block('button', 'Button', '<p><a class="btn gold" href="/contact.html">Contact the band</a></p>'),
    block('accordion', 'Dropdown', '<details class="visual-accordion" data-visual-block="accordion"><summary>Question</summary><div class="visual-accordion-body"><p>Answer</p></div></details>'),
  ];

  function renderVersions(versions) {
    if (!versionEl) return;
    const rows = Array.isArray(versions) ? versions : [];
    versionEl.innerHTML = `<h2>Version history</h2>${
      rows.length
        ? rows.map((row) => (
          `<button type="button" data-restore="${row.id}"><b>${row.kind === 'publish' ? 'Published' : 'Draft'}</b><small>${row.created_at || ''}${row.created_by_name ? ` · ${row.created_by_name}` : ''}</small></button>`
        )).join('')
        : '<p>No versions yet.</p>'
    }`;
    versionEl.querySelectorAll('[data-restore]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!window.confirm('Restore this version into the draft?')) return;
        try {
          const state = await jsonFetch('/api/admin/visual-pages/join/restore', {
            method: 'POST',
            body: JSON.stringify({ version_id: Number(button.dataset.restore) }),
          });
          editor.setComponents(state.draft_html || '');
          renderVersions(state.versions);
          setStatus('Draft restored. Publish when you want it on the public join page.');
        } catch (error) {
          setStatus(error.message, true);
        }
      });
    });
  }

  if (typeof grapesjs === 'undefined') {
    setStatus('GrapesJS failed to load. Check the network and reload.', true);
    return;
  }

  const editor = grapesjs.init({
    container: '#gjs',
    height: '100%',
    fromElement: false,
    storageManager: false,
    noticeOnUnload: false,
    selectorManager: { componentFirst: true },
    deviceManager: {
      devices: [
        { id: 'Desktop', name: 'Desktop', width: '' },
        { id: 'Tablet', name: 'Tablet', width: '768px', widthMedia: '980px' },
        { id: 'Phone', name: 'Phone', width: '390px', widthMedia: '420px' },
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
    assetManager: {
      upload: false,
      embedAsBase64: false,
    },
    richTextEditor: {
      actions: ['bold', 'italic', 'underline', 'wrap', 'link'],
    },
    blockManager: { blocks: BLOCKS },
  });

  editor.on('load', () => {
    const doc = editor.Canvas.getDocument();
    if (doc?.body) doc.body.classList.add('efhs-theme', 'coming-soon-page', 'visual-page-join');
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

  async function save(action) {
    try {
      setStatus(action === 'publish' ? 'Publishing…' : 'Saving draft…');
      const state = await jsonFetch('/api/admin/visual-pages/join', {
        method: 'PUT',
        body: JSON.stringify({ action, html: editor.getHtml() }),
      });
      renderVersions(state.versions);
      setStatus(action === 'publish' ? 'Published to the preview site.' : 'Draft saved.');
    } catch (error) {
      setStatus(error.message, true);
    }
  }
  document.querySelector('[data-visual-draft]')?.addEventListener('click', () => save('draft'));
  document.querySelector('[data-visual-publish]')?.addEventListener('click', () => save('publish'));

  editor.AssetManager.addType('image', {
    view: {
      onRender({ model }) {
        return model;
      },
    },
  });

  const addImageInput = document.createElement('input');
  addImageInput.type = 'file';
  addImageInput.accept = 'image/*';
  addImageInput.hidden = true;
  document.body.appendChild(addImageInput);
  addImageInput.addEventListener('change', async () => {
    const file = addImageInput.files?.[0];
    addImageInput.value = '';
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    body.append('alt_text', file.name.replace(/\.[^.]+$/, '') || 'Photo');
    try {
      const stored = await jsonFetch('/api/admin/photos', { method: 'POST', body });
      if (stored?.url) editor.AssetManager.add(stored.url);
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  editor.on('asset:upload:start', () => addImageInput.click());
  const assetPanel = editor.Panels.getButton('options', 'open-am');
  editor.Panels.addButton('options', {
    id: 'efhs-upload',
    className: 'fa fa-upload',
    command: () => addImageInput.click(),
    attributes: { title: 'Upload a site photo' },
  });
  if (!assetPanel) {
    editor.Panels.addButton('options', {
      id: 'efhs-assets',
      className: 'fa fa-image',
      command: 'open-assets',
      attributes: { title: 'Site photos' },
    });
  }

  (async function boot() {
    try {
      const state = await jsonFetch('/api/admin/visual-pages/join');
      editor.setComponents(state.draft_html || '');
      renderVersions(state.versions);
      const photos = await jsonFetch('/api/photos').catch(() => []);
      (Array.isArray(photos) ? photos : []).forEach((photo) => {
        if (photo?.url) editor.AssetManager.add({ src: photo.url, name: photo.alt_text || photo.filename || 'Photo' });
      });
      [
        '/assets/efhs-logo.png',
        '/assets/efhs-blue-regiment-mark.png',
        '/assets/home/band-2024-25.jpg',
      ].forEach((src) => editor.AssetManager.add(src));
      setStatus('Editing Join the Band. Save draft or publish to this preview Worker.');
    } catch (error) {
      if (error.status === 401) {
        window.location.href = '/admin/login';
        return;
      }
      setStatus(error.message, true);
    }
  }());
}());
