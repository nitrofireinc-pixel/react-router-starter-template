// Plan 2.26 News card + /news page (17a). Images go to R2 (env.FILES, key news/<uuid>.<ext>), 10 MB max.
export const NEWS_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const NEWS_IMAGE_TYPES = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' });
export const NEWS_CACHE_KEYS = Object.freeze(['news:home', 'news:list']);
const COLS = 'id, headline, teaser, body_html, photo_url, link_url, news_date, published, pinned, show_on_home, expires_at, sort_order, updated_at';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function sniffNewsImage(bytes) {
  const b = bytes || new Uint8Array();
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return '';
}

/** Returns { error } or { mime, ext }. */
export function validateNewsImage(size, headBytes) {
  if (!size) return { error: 'The file is empty.' };
  if (size > NEWS_IMAGE_MAX_BYTES) return { error: `That photo is ${(size / 1048576).toFixed(1)} MB. Photos must be 10 MB or smaller.` };
  const mime = sniffNewsImage(headBytes);
  if (!mime) return { error: 'Only JPG, PNG, WebP or GIF photos can be uploaded.' };
  return { mime, ext: NEWS_IMAGE_TYPES[mime] };
}

export function isNewsLive(item, today) {
  return Boolean(item && Number(item.published) === 1 && (!item.expires_at || String(item.expires_at) >= today));
}

/** Pinned first, then newest news_date, then sort_order. */
export function sortNews(items = []) {
  return [...items].sort((a, b) => (Number(b.pinned) - Number(a.pinned))
    || String(b.news_date || '').localeCompare(String(a.news_date || ''))
    || (Number(a.sort_order) - Number(b.sort_order)) || (Number(b.id) - Number(a.id)));
}

export function pickHomeNews(items = [], today) {
  return [...items].filter((i) => isNewsLive(i, today) && Number(i.show_on_home) === 1)
    .sort((a, b) => String(b.news_date || '').localeCompare(String(a.news_date || '')) || Number(b.id) - Number(a.id))[0] || null;
}

function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

export function safeNewsLink(v) {
  const s = String(v || '').trim();
  return /^\/(?!\/)[\w\-./?=&#%]*$/.test(s) ? s : '';
}
export function safeNewsPhoto(v) {
  const s = String(v || '').trim();
  return /^\/api\/news\/image\/[a-f0-9-]{36}\.(jpg|png|webp|gif)$/.test(s) || /^\/uploads\/[\w\-.%]+$/.test(s) ? s : '';
}

export function normalizeNewsPayload(p = {}) {
  const headline = String(p.headline || '').trim().slice(0, 140);
  if (!headline) throw Object.assign(new Error('Add a headline.'), { status: 422 });
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
  return {
    headline,
    teaser: String(p.teaser || '').trim().slice(0, 160),
    body_html: String(p.body_html || '').slice(0, 20000),
    photo_url: safeNewsPhoto(p.photo_url),
    link_url: safeNewsLink(p.link_url),
    news_date: date(p.news_date) || new Date().toISOString().slice(0, 10),
    published: p.published ? 1 : 0,
    pinned: p.pinned ? 1 : 0,
    show_on_home: p.show_on_home ? 1 : 0,
    expires_at: date(p.expires_at) || null,
    sort_order: Number.isFinite(Number(p.sort_order)) ? Math.trunc(Number(p.sort_order)) : 0,
  };
}

const STRIP_CSS = '<style id="news-strip-css">.news-strip{background:#fff;border-bottom:3px solid #f2c200}.news-strip .wrap{display:flex;align-items:center;gap:16px;padding:10px 0}.news-strip .news-tag{background:#0b2a5b;color:#fff;font:700 12px/1 system-ui,sans-serif;letter-spacing:.08em;padding:6px 10px;border-radius:4px}.news-strip .news-main{flex:1;min-width:0}.news-strip .news-head{color:#0b2a5b;font-weight:700;text-decoration:none}.news-strip .news-meta{color:#555;font-size:13px;margin:2px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.news-strip .news-all{color:#0b2a5b;font-weight:700;text-decoration:none;white-space:nowrap}@media(max-width:640px){.news-strip .wrap{flex-wrap:wrap;gap:6px 10px}.news-strip .news-meta{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}}</style>';

export function renderHomeNewsStripHtml(item) {
  if (!item) return '';
  return `${STRIP_CSS}<section class="news-strip" aria-label="Latest news"><div class="wrap"><span class="news-tag">NEWS</span><div class="news-main"><a class="news-head" href="/news/${Number(item.id)}">${esc(item.headline)}</a><p class="news-meta">${esc(fmtDate(item.news_date))}${item.teaser ? ` · ${esc(item.teaser)}` : ''}</p></div><a class="news-all" href="/news">All news →</a></div></section>`;
}

const PAGE_CSS = '<style>.news-page{max-width:880px;margin:32px auto;padding:0 16px}.news-card{display:flex;gap:18px;background:#fff;border:1px solid #dde3ee;border-radius:12px;padding:16px;margin:0 0 16px}.news-card.pinned{border:2px solid #f2c200}.news-card img{width:200px;height:130px;object-fit:cover;border-radius:8px}.news-card h2{margin:0 0 4px;font-size:1.25rem}.news-card h2 a{color:#0b2a5b;text-decoration:none}.news-date{color:#666;font-size:.9rem}.news-article img{max-width:100%;border-radius:10px}@media(max-width:640px){.news-card{flex-direction:column}.news-card img{width:100%;height:180px}}</style>';

export function renderNewsListBody(items = []) {
  const cards = items.map((i) => `<article class="news-card${Number(i.pinned) ? ' pinned' : ''}">${i.photo_url ? `<img src="${esc(i.photo_url)}" alt="" loading="lazy">` : ''}<div><p class="news-date">${Number(i.pinned) ? '📌 ' : ''}${esc(fmtDate(i.news_date))}</p><h2><a href="/news/${Number(i.id)}">${esc(i.headline)}</a></h2><p>${esc(i.teaser)}</p></div></article>`).join('');
  return `${PAGE_CSS}<section class="news-page"><h1>News</h1>${cards || '<p>No news yet. Check back soon.</p>'}</section>`;
}

export function renderNewsItemBody(item, sanitize = (h) => esc(h)) {
  return `${PAGE_CSS}<section class="news-page news-article"><p><a href="/news">← All news</a></p><p class="news-date">${esc(fmtDate(item.news_date))}</p><h1>${esc(item.headline)}</h1>${item.photo_url ? `<img src="${esc(item.photo_url)}" alt="">` : ''}<div>${sanitize(item.body_html || '')}</div>${item.link_url ? `<p><a class="btn primary" href="${esc(item.link_url)}">Learn more →</a></p>` : ''}</section>`;
}

export async function listPublicNews(env, today) {
  const res = await env.DB.prepare(`SELECT ${COLS} FROM news_items WHERE published = 1 AND (expires_at IS NULL OR expires_at >= ?) ORDER BY pinned DESC, news_date DESC, sort_order ASC, id DESC LIMIT 50`).bind(today).all();
  return res?.results || [];
}
/** Up to 5 published home candidates (newest first, trimmed fields). Stored in site_content.news_home_json. */
export async function loadHomeNewsCandidates(env) {
  const res = await env.DB.prepare('SELECT id, headline, teaser, news_date, expires_at, published, show_on_home FROM news_items WHERE published = 1 AND show_on_home = 1 ORDER BY news_date DESC, id DESC LIMIT 5').all();
  return res?.results || [];
}

/** /api/admin/news*, /api/news/image/*. deps: { requireNews, json, audit(request,user,action,before,after), purge(), sameOrigin } */
export async function routeNewsApi(request, env, url, deps) {
  const p = url.pathname;
  const img = p.match(/^\/api\/news\/image\/([a-f0-9-]{36}\.(?:jpg|png|webp|gif))$/);
  if (img && (request.method === 'GET' || request.method === 'HEAD')) {
    const obj = env.FILES ? await env.FILES.get(`news/${img[1]}`) : null;
    if (!obj) return new Response('Not found', { status: 404 });
    return new Response(request.method === 'HEAD' ? null : obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
  }
  if (!p.startsWith('/api/admin/news')) return null;
  const auth = await deps.requireNews(request, env);
  if (auth.response) return auth.response;
  const user = auth.user;
  if (request.method !== 'GET' && !deps.sameOrigin(request, url)) return deps.json({ detail: 'Cross-site request blocked' }, 403);
  if (p === '/api/admin/news/upload' && request.method === 'POST') {
    if (!env.FILES) return deps.json({ detail: 'Photo storage is not set up' }, 503);
    const len = Number(request.headers.get('content-length') || 0);
    if (len > NEWS_IMAGE_MAX_BYTES + 64 * 1024) return deps.json({ detail: 'Photos must be 10 MB or smaller.' }, 413);
    let file;
    try { file = (await request.formData()).get('file'); } catch { return deps.json({ detail: 'Expected a photo upload' }, 400); }
    if (!file || typeof file === 'string') return deps.json({ detail: 'Choose a photo to upload' }, 422);
    const buf = await file.arrayBuffer();
    const check = validateNewsImage(buf.byteLength, new Uint8Array(buf, 0, Math.min(16, buf.byteLength)));
    if (check.error) return deps.json({ detail: check.error }, 422);
    const name = `${crypto.randomUUID()}.${check.ext}`;
    await env.FILES.put(`news/${name}`, buf, { httpMetadata: { contentType: check.mime } });
    await deps.audit(request, user, 'news.photo_upload', null, { key: `news/${name}`, bytes: buf.byteLength });
    return deps.json({ url: `/api/news/image/${name}` }, 201);
  }
  if (p === '/api/admin/news' && request.method === 'GET') {
    const res = await env.DB.prepare(`SELECT ${COLS} FROM news_items ORDER BY pinned DESC, news_date DESC, sort_order ASC, id DESC LIMIT 200`).all();
    return deps.json({ items: res?.results || [] });
  }
  if (p === '/api/admin/news/reorder' && request.method === 'POST') {
    const ids = ((await request.json().catch(() => ({}))).ids || []).map(Number).filter(Boolean).slice(0, 200);
    await env.DB.batch(ids.map((id, i) => env.DB.prepare('UPDATE news_items SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(i, id)));
    await deps.audit(request, user, 'news.reorder', null, { ids });
    await deps.purge();
    return deps.json({ ok: true });
  }
  const one = p.match(/^\/api\/admin\/news(?:\/(\d+))?$/);
  if (one && (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE')) {
    const id = Number(one[1] || 0);
    const before = id ? await env.DB.prepare(`SELECT ${COLS} FROM news_items WHERE id = ?`).bind(id).first() : null;
    if (id && !before) return deps.json({ detail: 'News item not found' }, 404);
    if (request.method === 'DELETE') {
      await env.DB.prepare('UPDATE news_items SET published = 0, show_on_home = 0, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(user.id, id).run();
      await deps.audit(request, user, 'news.delete', before, { ...before, published: 0, show_on_home: 0 });
      await deps.purge();
      return deps.json({ ok: true });
    }
    let item;
    try { item = normalizeNewsPayload(await request.json()); } catch (e) { return deps.json({ detail: e.message || 'Bad request' }, e.status || 400); }
    item.body_html = deps.sanitize(item.body_html);
    const v = [item.headline, item.teaser, item.body_html, item.photo_url, item.link_url, item.news_date, item.published, item.pinned, item.show_on_home, item.expires_at, item.sort_order, user.id];
    let savedId = id;
    if (id) {
      await env.DB.prepare('UPDATE news_items SET headline=?, teaser=?, body_html=?, photo_url=?, link_url=?, news_date=?, published=?, pinned=?, show_on_home=?, expires_at=?, sort_order=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(...v, id).run();
    } else {
      const r = await env.DB.prepare('INSERT INTO news_items (headline, teaser, body_html, photo_url, link_url, news_date, published, pinned, show_on_home, expires_at, sort_order, updated_by, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...v, user.id).run();
      savedId = Number(r?.meta?.last_row_id || 0);
    }
    const action = !id ? 'news.create' : (before.published !== item.published ? (item.published ? 'news.publish' : 'news.unpublish') : (before.pinned !== item.pinned ? 'news.pin' : 'news.update'));
    await deps.audit(request, user, action, before, { id: savedId, ...item });
    await deps.purge();
    const saved = await env.DB.prepare(`SELECT ${COLS} FROM news_items WHERE id = ?`).bind(savedId).first();
    return deps.json(saved, id ? 200 : 201);
  }
  return deps.json({ detail: 'Not found' }, 404);
}

/** Studio → 📰 News screen (17a). chrome = { head, top, sidebar } HTML from admin-chrome. pages = [{title,path}] for the link picker. */
export function renderNewsAdminHtml(assetVersion, chrome = {}, pages = []) {
  const v = esc(assetVersion);
  const opts = pages.map((pg) => `<option value="${esc(pg.path)}">${esc(pg.title)}</option>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>News | EFHS Band CMS</title>${chrome.head || ''}
<style>.nw-wrap{display:grid;grid-template-columns:260px 1fr 320px;gap:16px;padding:16px}.nw-card{background:#fff;border:1px solid #dde3ee;border-radius:12px;padding:14px;margin-bottom:14px}.nw-card h2{font-size:1rem;margin:0 0 8px}.nw-list button.nw-item{display:block;width:100%;text-align:left;border:1px solid transparent;background:none;padding:8px;border-radius:8px;cursor:grab}.nw-list button.nw-item.active{background:#fff6cc;border-color:#f2c200}.nw-item small{display:block;color:#2a7a2a}.nw-wrap label{display:block;font-weight:600;font-size:.85rem;margin:8px 0 4px}.nw-wrap input[type=text],.nw-wrap input[type=date],.nw-wrap select,.nw-wrap textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid #c9d2e0;border-radius:8px}.nw-drop{border:2px dashed #9fb0cc;border-radius:10px;padding:14px;display:flex;gap:12px;align-items:center}.nw-drop.over{background:#eef4ff}.nw-photo img{max-width:100%;max-height:160px;border-radius:8px;margin-top:8px}.nw-err{color:#a00;background:#fde8e8;border-radius:8px;padding:8px;margin-top:8px}.nw-err:empty{display:none}.nw-check{display:flex!important;gap:8px;font-weight:400!important}@media(max-width:1000px){.nw-wrap{grid-template-columns:1fr}}</style></head>
<body class="admin-body sn-body"><main class="admin-shell cms-shell">${chrome.top || ''}${chrome.sidebar || ''}<section class="admin-workspace">
<div class="nw-wrap">
 <aside class="nw-card"><h2>📰 News</h2><button class="btn primary" type="button" id="nw-new">+ New item</button><div class="nw-list" id="nw-list"></div><p class="muted" style="font-size:.8rem">Drag to set order. Pinned stays on top.</p></aside>
 <form id="nw-form" autocomplete="off"><input type="hidden" name="id"><input type="hidden" name="photo_url">
  <div class="nw-card"><h2 id="nw-title">New news item</h2><label>Headline<input type="text" name="headline" maxlength="140" required></label><label>Teaser (shows on home card, 160 max)<textarea name="teaser" maxlength="160" rows="2"></textarea></label><label>Body</label><div id="nw-body" contenteditable="true" class="form-rich-editor" style="min-height:120px;border:1px solid #c9d2e0;border-radius:8px;padding:8px"></div></div>
  <div class="nw-card"><h2>Photo</h2><div class="nw-drop" id="nw-drop"><button class="btn primary" type="button" id="nw-upload">⬆ Upload photo</button><span>or drag a photo here · <b>max 10 MB</b> · JPG, PNG, WebP, GIF</span><input type="file" id="nw-file" accept="image/jpeg,image/png,image/webp,image/gif" hidden></div><div class="nw-photo" id="nw-photo"></div><button class="btn outline" type="button" id="nw-photo-clear" hidden>Remove photo</button><div class="nw-err" id="nw-photo-err"></div></div>
  <div class="nw-card"><h2>Button link (optional)</h2><select name="link_url"><option value="">No button</option>${opts}</select><p class="muted" style="font-size:.8rem">Pick a page. No typing web addresses.</p></div>
 </form>
 <aside><div class="nw-card"><h2>Publish</h2><label class="nw-check"><input type="checkbox" name="published" form="nw-form"> Published (unticked = Draft)</label><label>News date<input type="date" name="news_date" form="nw-form"></label><label>Hide after (optional)<input type="date" name="expires_at" form="nw-form"></label></div>
 <div class="nw-card"><h2>Where it shows</h2><label class="nw-check"><input type="checkbox" name="show_on_home" form="nw-form"> Show on home page card</label><label class="nw-check"><input type="checkbox" name="pinned" form="nw-form"> Pin to top of News page</label><p class="muted" style="font-size:.8rem">Only one item shows on the home card: the newest one with this ticked.</p></div>
 <div class="nw-card"><h2>Preview</h2><div id="nw-preview"></div></div>
 <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn outline" type="button" id="nw-delete" hidden>Hide item</button><button class="btn primary" type="submit" form="nw-form" id="nw-save">Save</button></div><p class="status" id="nw-status" aria-live="polite"></p></aside>
</div></section></main>${chrome.scripts || ''}<script src="/api/news/admin.js?v=${v}"></script></body></html>`;
}

export const NEWS_ADMIN_JS = `(() => {
const MAX = ${NEWS_IMAGE_MAX_BYTES}, TYPES = ['image/jpeg','image/png','image/webp','image/gif'];
const $ = (s) => document.querySelector(s), f = $('#nw-form'), st = $('#nw-status');
let items = [], cur = null;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Date().toLocaleDateString('en-CA');
async function api(path, opts = {}) { const r = await fetch(path, { credentials: 'same-origin', ...opts }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.detail || 'Request failed'); return j; }
function field(n) { return document.querySelector('[name="' + n + '"]'); }
function label(i) { if (!Number(i.published)) return 'Draft'; if (i.expires_at && i.expires_at < today()) return 'Expired ' + i.expires_at; return 'Published' + (Number(i.pinned) ? ' · Pinned' : '') + (Number(i.show_on_home) ? ' · Home ★' : ''); }
function renderList() { $('#nw-list').innerHTML = items.map((i) => '<button type="button" draggable="true" class="nw-item' + (cur && cur.id === i.id ? ' active' : '') + '" data-id="' + i.id + '">⠿ ' + (Number(i.pinned) ? '📌 ' : '') + esc(i.headline) + '<small>' + esc(label(i)) + '</small></button>').join('') || '<p class="muted">No news yet.</p>'; }
function setPhoto(url) { field('photo_url').value = url || ''; $('#nw-photo').innerHTML = url ? '<img src="' + esc(url) + '" alt="">' : ''; $('#nw-photo-clear').hidden = !url; preview(); }
function preview() { $('#nw-preview').innerHTML = '<div style="border-bottom:3px solid #f2c200;padding:6px 0;display:flex;gap:8px;align-items:center"><b style="background:#0b2a5b;color:#fff;font-size:11px;padding:4px 8px;border-radius:4px">NEWS</b><span style="flex:1;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(field('headline').value || 'Headline') + '</span><b>All news →</b></div>'; }
function load(i) { cur = i; f.reset(); field('id').value = i ? i.id : ''; $('#nw-title').textContent = i ? 'Edit news item' : 'New news item';
  ['headline','teaser','link_url','news_date','expires_at'].forEach((k) => { field(k).value = (i && i[k]) || ''; });
  if (!i) field('news_date').value = today();
  ['published','pinned','show_on_home'].forEach((k) => { field(k).checked = Boolean(i && Number(i[k])); });
  $('#nw-body').innerHTML = (i && i.body_html) || ''; setPhoto(i && i.photo_url); $('#nw-delete').hidden = !i; $('#nw-photo-err').textContent = ''; st.textContent = ''; renderList(); }
async function refresh(selectId) { items = (await api('/api/admin/news')).items || []; load(items.find((i) => i.id === selectId) || null); }
async function upload(file) { const err = $('#nw-photo-err'); err.textContent = '';
  if (!file) return; if (!TYPES.includes(file.type)) { err.textContent = '"' + file.name + '" is not a JPG, PNG, WebP or GIF photo.'; return; }
  if (file.size > MAX) { err.textContent = '"' + file.name + '" is ' + (file.size / 1048576).toFixed(1) + ' MB. Photos must be 10 MB or smaller.'; return; }
  const fd = new FormData(); fd.append('file', file); st.textContent = 'Uploading photo…';
  try { const j = await api('/api/admin/news/upload', { method: 'POST', body: fd }); setPhoto(j.url); st.textContent = 'Photo uploaded. Click Save to keep it.'; } catch (e) { err.textContent = e.message; st.textContent = ''; } }
$('#nw-upload').onclick = () => $('#nw-file').click();
$('#nw-file').onchange = (e) => { upload(e.target.files[0]); e.target.value = ''; };
const drop = $('#nw-drop');
drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); upload(e.dataTransfer.files[0]); };
$('#nw-photo-clear').onclick = () => setPhoto('');
$('#nw-new').onclick = () => load(null);
field('headline').oninput = preview;
$('#nw-list').onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) load(items.find((i) => i.id === Number(b.dataset.id))); };
let dragId = null;
$('#nw-list').ondragstart = (e) => { dragId = Number(e.target.closest('[data-id]')?.dataset.id); };
$('#nw-list').ondragover = (e) => e.preventDefault();
$('#nw-list').ondrop = async (e) => { e.preventDefault(); const t = Number(e.target.closest('[data-id]')?.dataset.id); if (!dragId || !t || dragId === t) return;
  const from = items.findIndex((i) => i.id === dragId), to = items.findIndex((i) => i.id === t); items.splice(to, 0, items.splice(from, 1)[0]); renderList();
  try { await api('/api/admin/news/reorder', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: items.map((i) => i.id) }) }); st.textContent = 'Order saved.'; } catch (err) { st.textContent = err.message; } };
f.onsubmit = async (e) => { e.preventDefault(); const id = field('id').value;
  const body = { headline: field('headline').value, teaser: field('teaser').value, body_html: $('#nw-body').innerHTML, photo_url: field('photo_url').value, link_url: field('link_url').value, news_date: field('news_date').value, expires_at: field('expires_at').value, published: field('published').checked, pinned: field('pinned').checked, show_on_home: field('show_on_home').checked, sort_order: cur ? cur.sort_order : 0 };
  st.textContent = 'Saving…';
  try { const saved = await api('/api/admin/news' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); await refresh(saved.id); st.textContent = 'Saved. The home card updates within a minute.'; } catch (err) { st.textContent = err.message; } };
$('#nw-delete').onclick = async () => { if (!cur || !confirm('Hide this news item from the site?')) return;
  try { await api('/api/admin/news/' + cur.id, { method: 'DELETE' }); await refresh(cur.id); st.textContent = 'Hidden (set to Draft).'; } catch (err) { st.textContent = err.message; } };
refresh().catch((e) => { st.textContent = e.message; });
})();`;
