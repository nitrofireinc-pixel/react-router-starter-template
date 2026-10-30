// Site Studio Form Builder (plan 2.21). v2 forms live in cms_forms with builder = 1.
import { buildFormEmail, buildFormPdfBase64, normalizeFormDefinition } from './form-builder.mjs';

export const FS_SCHEMA_KEY = 'form_studio_schema_version';
export const FS_SCHEMA_VERSION = '2026-10-24.s4';
export const FS_MAX_FIELDS = 60;
export const FS_MAX_RECIPIENTS = 3;
export const FS_RETENTION_DAYS = 548;
export const FS_PURGE_PER_NIGHT = 500;
export const FS_DRAFT_MIN_SECONDS = 55;
export const FS_DRAFT_MAX_PER_DAY = 300;
export const FS_DRAFT_LOCK_SECONDS = 600;
export const FS_RATE_LIMIT = 5;
export const FS_RATE_WINDOW_S = 600;
export const MAIL_DAY_CAP = 80;
export const MAIL_MONTH_CAP = 2700;
export const MAIL_QUEUE_PER_RUN = 10;
export const LINK_MAX_PER_SAVE = 20;
export const LINK_RECHECK_PER_RUN = 20;
export const SUBREQUEST_BUDGET = 45;
export const FS_VERSIONS_KEPT = 20;
export const FS_FIELD_TYPES = ['text', 'textarea', 'email', 'phone', 'number', 'date', 'select', 'radio', 'checkbox', 'heading', 'note', 'pricing'];
export const FS_INPUT_TYPES = ['text', 'textarea', 'email', 'phone', 'number', 'date', 'select', 'radio', 'checkbox'];
export const BUILTIN_BLOCKLIST = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at', 'tiny.cc', 'wetransfer.com', 'we.tl', 'sendspace.com', 'mediafire.com', 'anonfiles.com', 'file.io'];
export const SAFE_BROWSING_REFERER = 'https://efhsband.org/';
export const SUBMIT_DELETE_PERMISSIONS = ['president', 'vice-president', 'director'];

const FORM_COLS = [
  ['draft_json', 'ALTER TABLE cms_forms ADD COLUMN draft_json TEXT'],
  ['draft_saved_at', 'ALTER TABLE cms_forms ADD COLUMN draft_saved_at TEXT'],
  ['draft_by', 'ALTER TABLE cms_forms ADD COLUMN draft_by INTEGER'],
  ['draft_by_name', "ALTER TABLE cms_forms ADD COLUMN draft_by_name TEXT NOT NULL DEFAULT ''"],
  ['draft_base_version', 'ALTER TABLE cms_forms ADD COLUMN draft_base_version INTEGER'],
  ['draft_writes_day', "ALTER TABLE cms_forms ADD COLUMN draft_writes_day TEXT NOT NULL DEFAULT ''"],
  ['draft_writes', 'ALTER TABLE cms_forms ADD COLUMN draft_writes INTEGER NOT NULL DEFAULT 0'],
  ['version', 'ALTER TABLE cms_forms ADD COLUMN version INTEGER NOT NULL DEFAULT 1'],
  ['deleted_at', 'ALTER TABLE cms_forms ADD COLUMN deleted_at TEXT'],
  ['builder', 'ALTER TABLE cms_forms ADD COLUMN builder INTEGER NOT NULL DEFAULT 0'],
  ['legacy_kind', "ALTER TABLE cms_forms ADD COLUMN legacy_kind TEXT NOT NULL DEFAULT ''"],
  ['created_by', 'ALTER TABLE cms_forms ADD COLUMN created_by INTEGER'],
  ['updated_by_name', "ALTER TABLE cms_forms ADD COLUMN updated_by_name TEXT NOT NULL DEFAULT ''"],
];
const SUB_COLS = [
  ['form_id', 'ALTER TABLE form_submissions ADD COLUMN form_id INTEGER'],
  ['status', "ALTER TABLE form_submissions ADD COLUMN status TEXT NOT NULL DEFAULT 'new'"],
  ['staff_note', "ALTER TABLE form_submissions ADD COLUMN staff_note TEXT NOT NULL DEFAULT ''"],
  ['ip_hash', "ALTER TABLE form_submissions ADD COLUMN ip_hash TEXT NOT NULL DEFAULT ''"],
  ['purge_after', 'ALTER TABLE form_submissions ADD COLUMN purge_after TEXT'],
  ['mail_state', "ALTER TABLE form_submissions ADD COLUMN mail_state TEXT NOT NULL DEFAULT ''"],
];
export function formStudioTableStatements() {
  return [
    'CREATE INDEX IF NOT EXISTS idx_fs_form_created ON form_submissions (form_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_fs_form_status ON form_submissions (form_id, status)',
    "CREATE TABLE IF NOT EXISTS cms_form_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, form_id INTEGER NOT NULL, version INTEGER NOT NULL, definition_json TEXT NOT NULL, saved_by INTEGER, saved_by_name TEXT NOT NULL DEFAULT '', saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    'CREATE INDEX IF NOT EXISTS idx_cfv_form ON cms_form_versions (form_id, version)',
    'CREATE TABLE IF NOT EXISTS form_rate (bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL DEFAULT 0)',
    'CREATE TABLE IF NOT EXISTS mail_counter (day TEXT PRIMARY KEY, sent INTEGER NOT NULL DEFAULT 0)',
    "CREATE TABLE IF NOT EXISTS form_mail_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, submission_id INTEGER NOT NULL, kind TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at TEXT)",
    "CREATE TABLE IF NOT EXISTS link_checks (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL, url_hash TEXT NOT NULL UNIQUE, final_url TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', reason TEXT NOT NULL DEFAULT '', threats_json TEXT NOT NULL DEFAULT '[]', http_status INTEGER, checked_at TEXT, next_check_at TEXT)",
    'CREATE INDEX IF NOT EXISTS idx_link_checks_next ON link_checks (next_check_at)',
    "CREATE TABLE IF NOT EXISTS link_blocklist (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT NOT NULL UNIQUE, reason TEXT NOT NULL DEFAULT '', created_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS link_uses (id INTEGER PRIMARY KEY AUTOINCREMENT, url_hash TEXT NOT NULL, page_id INTEGER, form_id INTEGER, block_id TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'form', added_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    'CREATE INDEX IF NOT EXISTS idx_link_uses_hash ON link_uses (url_hash)',
    "CREATE TABLE IF NOT EXISTS link_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, url_hash TEXT NOT NULL, requested_by INTEGER, reason TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', decided_by INTEGER, decided_at TEXT, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS studio_notices (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, text TEXT NOT NULL, link TEXT NOT NULL DEFAULT '', read_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  ];
}

let fsReady = false;
let fsPromise = null;
export function resetFormStudioSchemaMemo() { fsReady = false; fsPromise = null; }
export async function ensureFormStudioSchema(env) {
  if (fsReady) return;
  if (!fsPromise) {
    fsPromise = (async () => {
      const row = await env.DB.prepare('SELECT value FROM site_content WHERE key = ?').bind(FS_SCHEMA_KEY).first().catch(() => null);
      if (row?.value === FS_SCHEMA_VERSION) return;
      const stmts = [];
      for (const [table, cols] of [['cms_forms', FORM_COLS], ['form_submissions', SUB_COLS]]) {
        const have = new Set(((await env.DB.prepare(`PRAGMA table_info(${table})`).all()).results || []).map((c) => c.name));
        if (!have.size) throw new Error(`${table} missing`);
        for (const [name, sql] of cols) if (!have.has(name)) stmts.push(sql);
      }
      stmts.push(...formStudioTableStatements());
      await env.DB.batch(stmts.map((sql) => env.DB.prepare(sql)));
      await env.DB.prepare('INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .bind(FS_SCHEMA_KEY, FS_SCHEMA_VERSION).run();
    })().then(() => { fsReady = true; }).finally(() => { fsPromise = null; });
  }
  await fsPromise;
}

// ---------- helpers ----------
export function esc(v = '') {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const trim = (v, max = 240) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const trimMulti = (v, max = 2000) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
const rid = () => Math.random().toString(36).slice(2, 10);
export async function sha256(value) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function moneyCents(v) {
  const m = String(v ?? '').replace(/[,\s]/g, '').match(/^\$?(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] || '0').padEnd(2, '0'));
}
const centsLabel = (c) => `$${(c / 100).toFixed(2)}`;
const nameOk = (n) => /^[a-z][a-z0-9_]{0,47}$/.test(n);

// ---------- definition (v2) ----------
function normOption(o, used) {
  const src = typeof o === 'string' ? { label: o } : (o || {});
  const label = trim(src.label ?? src.value, 60);
  if (!label) return null;
  let id = trim(src.id, 20).replace(/[^a-z0-9_-]/gi, '') || `o${rid()}`;
  while (used.has(id)) id = `o${rid()}`;
  used.add(id);
  return { id, label, value: trim(src.value ?? label, 60) || label };
}

export function normalizeField(input = {}, usedNames = new Set(), usedIds = new Set()) {
  const s = input && typeof input === 'object' ? input : {};
  const type = s.type === 'choice' ? 'radio' : s.type === 'dropdown' ? 'select' : FS_FIELD_TYPES.includes(s.type) ? s.type : 'text';
  let id = trim(s.id, 24).replace(/[^a-z0-9_-]/gi, '') || `f${rid()}`;
  while (usedIds.has(id)) id = `f${rid()}`;
  usedIds.add(id);
  let name = String(s.name || s.label || type).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^[^a-z]+|_+$/g, '').slice(0, 40) || type;
  const base = name; let n = 2;
  while (usedNames.has(name)) name = `${base}_${n++}`;
  usedNames.add(name);
  const input_ = FS_INPUT_TYPES.includes(type);
  const f = {
    id, type, name,
    label: trim(s.label ?? (type === 'heading' ? 'Section' : type === 'note' ? '' : 'Untitled'), 160),
    help: trim(s.help, 300),
    placeholder: trim(s.placeholder, 120),
    required: input_ && Boolean(s.required),
    width: s.width === 'half' ? 'half' : s.width === 'full' ? 'full' : (s.full === false ? 'half' : (s.full || ['textarea', 'radio', 'checkbox', 'heading', 'note', 'pricing'].includes(type) ? 'full' : 'half')),
  };
  if (type === 'note') { f.text = trimMulti(s.text ?? s.label, 1200); f.style = ['strong', 'italic'].includes(s.style) ? s.style : (s.emphasize ? 'strong' : s.italic ? 'italic' : ''); }
  if (type === 'radio' || type === 'select' || type === 'checkbox') {
    const used = new Set();
    f.options = (Array.isArray(s.options) ? s.options : []).slice(0, 30).map((o) => normOption(o, used)).filter(Boolean);
    if (!f.options.length) f.options = [normOption('Option 1', used), normOption('Option 2', used)];
    if (type === 'radio') f.display = 'buttons';
  }
  if (type === 'pricing') {
    f.items = (Array.isArray(s.items) ? s.items : []).slice(0, 12).map((it) => ({
      label: trim(it?.label, 80) || 'Price',
      price: trim(it?.price, 20),
      values: (Array.isArray(it?.values) ? it.values : String(it?.sizes || '').split(/[\s,]+/)).map((x) => trim(x, 60)).filter(Boolean),
    }));
  }
  if (input_ && s.price_check && typeof s.price_check === 'object') {
    const from = String(s.price_check.from || '').trim();
    if (from) f.price_check = { from, autofill: s.price_check.autofill !== false };
  } else if (input_ && s.price_from) f.price_check = { from: 'jacket_size', autofill: true };
  return f;
}

export function normalizeDefinition(input = {}, fallbackTitle = 'Untitled form') {
  const s = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const usedNames = new Set(); const usedIds = new Set();
  const fields = (Array.isArray(s.fields) ? s.fields : []).slice(0, FS_MAX_FIELDS).map((f) => normalizeField(f, usedNames, usedIds));
  const email = s.email && typeof s.email === 'object' ? s.email : {};
  const to = [...new Set((Array.isArray(email.to_user_ids) ? email.to_user_ids : []).map(Number).filter((x) => Number.isInteger(x) && x > 0))];
  return {
    version: 2,
    title: trim(s.title || fallbackTitle, 160) || fallbackTitle,
    kicker: trim(s.kicker ?? 'Band Boosters', 80),
    heading: trim(s.heading ?? 'East Forsyth Band Boosters', 120),
    intro: trimMulti(s.intro, 1200),
    submit_label: trim(s.submit_label || 'Submit', 60) || 'Submit',
    success_message: trim(s.success_message, 300),
    fields,
    email: {
      to_user_ids: to.slice(0, FS_MAX_RECIPIENTS),
      reply_to_field: trim(email.reply_to_field, 48),
      subject: trim(email.subject, 200),
      intro: trimMulti(email.intro, 600),
      confirm_copy: email.confirm_copy !== false,
    },
  };
}

export function validateDefinition(def) {
  const errors = [];
  if (!def.title) errors.push('The form needs a title.');
  const names = new Map(def.fields.map((f) => [f.name, f]));
  for (const f of def.fields) {
    if (!nameOk(f.name)) errors.push(`Token name ${f.name} must be lowercase letters, numbers or _.`);
    if (f.price_check) {
      const src = names.get(f.price_check.from);
      if (!src || !['radio', 'select'].includes(src.type)) errors.push(`${f.label}: price check needs a radio or dropdown field named ${f.price_check.from}.`);
      if (!def.fields.some((p) => p.type === 'pricing')) errors.push(`${f.label}: price check needs a price list.`);
    }
  }
  if ((def.email?.to_user_ids || []).length > FS_MAX_RECIPIENTS) errors.push(`At most ${FS_MAX_RECIPIENTS} staff recipients.`);
  return errors;
}

/** v1 (legacy form-builder) definition -> v2. Field names keep the v1 ids so stored values match. */
export function convertV1Definition(v1 = {}, recipientIds = []) {
  const src = normalizeFormDefinition(v1);
  const fields = src.fields.map((f) => {
    const out = { id: `f_${f.id}`.slice(0, 24), name: f.id, type: f.type, label: f.label, required: f.required, full: f.full, placeholder: f.placeholder };
    if (f.type === 'note') { out.text = f.text; out.style = f.emphasize ? 'strong' : f.italic ? 'italic' : ''; out.label = ''; }
    if (f.options?.length) out.options = f.options.map((o, i) => ({ id: `o${i + 1}`, label: o, value: o }));
    if (f.type === 'pricing') out.items = f.items.map((it) => ({ label: it.label, price: it.price, values: String(it.sizes || '').split(/[\s,]+/).filter(Boolean) }));
    if (f.price_from) out.price_check = { from: 'jacket_size', autofill: true };
    return out;
  });
  return normalizeDefinition({
    title: src.title, kicker: src.kicker, heading: src.heading, intro: src.intro, submit_label: src.submit_label, fields,
    email: { to_user_ids: recipientIds, reply_to_field: fields.find((f) => f.type === 'email')?.name || '', confirm_copy: true },
  }, src.title);
}

/** v2 -> v1 shape so the legacy email/PDF builders produce the identical layout. */
export function toV1Definition(def) {
  return {
    kicker: def.kicker, heading: def.heading, title: def.title, intro: def.intro, submit_label: def.submit_label,
    fields: def.fields.map((f) => ({
      id: f.name,
      type: f.type === 'radio' ? 'choice' : f.type === 'select' ? 'dropdown' : f.type,
      label: f.type === 'note' ? '' : f.label,
      text: f.text || '',
      required: f.required,
      full: f.width === 'full',
      placeholder: f.placeholder,
      emphasize: f.style === 'strong', italic: f.style === 'italic',
      options: (f.options || []).map((o) => o.label),
      items: (f.items || []).map((it) => ({ label: it.label, price: it.price, sizes: it.values.join(', ') })),
    })),
  };
}

export function priceForValue(def, value) {
  const key = String(value || '').trim().toUpperCase();
  if (!key) return null;
  for (const f of def.fields) {
    if (f.type !== 'pricing') continue;
    for (const it of f.items) if (it.values.map((v) => v.toUpperCase()).includes(key)) return it;
  }
  return null;
}

// ---------- links inside a definition ----------
const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/gi;
export function definitionLinks(def) {
  const out = new Set();
  const scan = (t) => { for (const m of String(t || '').match(URL_RE) || []) out.add(m.replace(/[.,;:!?]+$/, '')); };
  scan(def.intro); scan(def.success_message);
  for (const f of def.fields) { scan(f.help); scan(f.text); scan(f.label); }
  return [...out];
}

function linkify(text, statuses) {
  // statuses: Map(url -> status). Only ok/approved become clickable; everything else stays plain text (fail closed).
  return esc(text).replace(/\bhttps?:\/\/[^\s<>"')]+/gi, (raw) => {
    const url = raw.replace(/&amp;/g, '&').replace(/[.,;:!?]+$/, '');
    const st = statuses?.get(url);
    if (st === 'ok' || st === 'approved') return `<a href="${esc(url)}" rel="noopener" target="_blank">${esc(url)}</a>${raw.slice(esc(url).length)}`;
    return `<span class="fs-link-off" title="Link unavailable">${raw}</span>`;
  });
}

// ---------- public render ----------
export const FORM_STUDIO_CSS = `.fs-form .rgp{border:0;padding:0;margin:0;min-width:0}.fs-form .rgp legend{font-weight:700;margin-bottom:6px;padding:0}.rgp-row{display:flex;flex-wrap:wrap;gap:8px}.rpl{position:relative;display:inline-flex}.rpl input{position:absolute;opacity:0;width:1px;height:1px;margin:0}.rpl span{display:inline-flex;align-items:center;justify-content:center;min-width:56px;min-height:44px;padding:0 16px;border:2px solid #014990;border-radius:999px;background:#fff;color:#014990;font-weight:700;cursor:pointer;user-select:none}.rpl input:checked+span{background:#014990;color:#fff}.rpl input:focus-visible+span{outline:3px solid #f2b800;outline-offset:2px}.rgp-clear{margin-top:6px;background:none;border:0;color:#014990;text-decoration:underline;cursor:pointer;padding:4px 0;min-height:32px}.fs-help{display:block;font-size:.9em;color:#4a5b70;margin-top:2px}.fs-link-off{color:#6b7684}.fs-form .fs-err{color:#b00020;font-size:.9em}.fs-form .full{grid-column:1/-1}@media (max-width:720px){.rpl span{min-width:52px}}.fs-form.form-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.fs-form.form-grid>label{display:grid;gap:6px;font-weight:800;min-width:0}.fs-break{grid-column:1/-1;height:0;margin:0;padding:0;border:0;overflow:hidden}.fb-preview-break{grid-column:1/-1;border-top:2px dashed #8aa0c4;margin:6px 0 2px;padding-top:2px;color:#5b6b84;font-size:12px;font-weight:700}.fb-break-line{display:block;border-top:2px dashed #8aa0c4;margin:8px 0;color:#5b6b84;font-size:12px;font-weight:700}@media(max-width:720px){.fs-form.form-grid{grid-template-columns:1fr}}.fb-app .fb-people{display:grid;grid-template-columns:1fr;gap:0;margin:6px 0 10px}.fb-app .fb-people h3{margin:14px 0 4px;font-size:13px;color:#0b2a5b}.fb-app .fb-person{display:grid;grid-template-columns:minmax(0,1fr);gap:2px;padding:6px 0;border-bottom:1px solid #e6ebf3}.fb-app .fb-person .fb-check{margin:0}.fb-app .fb-person small,.fb-app .fb-person-email{color:#5b6680;font-weight:500}.fb-app .fb-person input[type=email]{font:inherit;font-weight:400;padding:6px 8px;border:1px solid #c4cbd9;border-radius:8px;width:100%;box-sizing:border-box}`;

function fieldHtml(f, statuses) {
  const full = f.width === 'full' ? 'full' : '';
  const req = f.required ? ' required aria-required="true"' : '';
  const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
  const help = f.help ? `<span class="fs-help" id="h-${esc(f.id)}">${linkify(f.help, statuses)}</span>` : '';
  const desc = f.help ? ` aria-describedby="h-${esc(f.id)}"` : '';
  const opt = '';
  if (f.type === 'heading') return `<h3 class="full letterman-section">${esc(f.label)}</h3>`;
  if (f.type === 'note') {
    const cls = ['full', 'letterman-note', f.style === 'strong' ? 'letterman-note-strong' : '', f.style === 'italic' ? 'letterman-thanks' : ''].filter(Boolean).join(' ');
    const body = linkify(f.text, statuses);
    return `<p class="${cls}">${f.style === 'strong' ? `<b>${body}</b>` : f.style === 'italic' ? `<em>${body}</em>` : body}</p>`;
  }
  if (f.type === 'pricing') {
    return `<div class="full letterman-pricing" data-fs-pricing>${f.items.map((it) => `<div data-letterman-price data-price-sizes="${esc(it.values.join(', '))}"><span>${esc(it.label)}</span><b>${esc(it.price)}</b></div>`).join('')}</div>`;
  }
  if (f.type === 'radio') {
    const pills = f.options.map((o) => `<label class="rpl"><input type="radio" name="${esc(f.name)}" value="${esc(o.value)}"${f.required ? ' required' : ''}><span>${esc(o.label)}</span></label>`).join('');
    return `<fieldset class="full rgp letterman-choices" data-fs-radio${f.required ? ' data-required="1"' : ''}${desc}><legend>${esc(f.label)}${f.required ? '' : ' <span class="muted">(optional)</span>'}</legend><div class="rgp-row" role="radiogroup" aria-label="${esc(f.label)}">${pills}</div>${f.required ? '' : '<button type="button" class="rgp-clear" data-fs-clear hidden>Clear choice</button>'}${help}</fieldset>`;
  }
  if (f.type === 'checkbox') {
    const boxes = f.options.map((o) => `<label class="letterman-choice"><input type="checkbox" name="${esc(f.name)}" value="${esc(o.value)}"> ${esc(o.label)}</label>`).join('');
    return `<fieldset class="full letterman-choices"${desc}><legend>${esc(f.label)}${f.required ? ' *' : ''}</legend><div class="letterman-choice-row">${boxes}</div>${help}</fieldset>`;
  }
  if (f.type === 'select') {
    const o = ['<option value="">Select</option>', ...f.options.map((x) => `<option value="${esc(x.value)}">${esc(x.label)}</option>`)].join('');
    return `<label class="${full || 'full'}">${esc(f.label)}${opt}<select name="${esc(f.name)}"${req}${desc}>${o}</select>${help}</label>`;
  }
  if (f.type === 'textarea') return `<label class="full">${esc(f.label)}<textarea name="${esc(f.name)}" rows="4" maxlength="2000"${req}${ph}${desc}></textarea>${help}</label>`;
  const t = { date: 'date', email: 'email', phone: 'tel', number: 'number' }[f.type] || 'text';
  const price = f.price_check ? ` data-fs-amount="${esc(f.price_check.from)}"` : '';
  const max = t === 'date' || t === 'number' ? '' : t === 'tel' ? ' maxlength="40"' : ' maxlength="200"';
  const ac = t === 'email' ? ' autocomplete="email"' : t === 'tel' ? ' autocomplete="tel"' : '';
  return `<label class="${full}">${esc(f.label)}<input name="${esc(f.name)}" type="${t}"${req}${max}${ph}${ac}${price}${desc}>${help}</label>`;
}

export function renderFormHtml(form, { statuses = new Map(), turnstileSiteKey = '', assetVersion = '' } = {}) {
  const def = form.definition;
  const ts = turnstileSiteKey ? `<div class="full cf-turnstile" data-sitekey="${esc(turnstileSiteKey)}"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : '';
  return `<style>${FORM_STUDIO_CSS}</style><article class="card inkind-card letterman-card fs-card">
    ${def.kicker ? `<span class="tag">${esc(def.kicker)}</span>` : ''}
    <h2>${esc(def.title)}</h2>
    ${def.intro ? `<p>${linkify(def.intro, statuses)}</p>` : ''}
    <form class="inkind-form letterman-form form-grid fs-form" data-fs-form="${Number(form.id)}" action="/api/forms-v2/${Number(form.id)}/submit" method="post" novalidate>
  ${def.fields.map((f) => fieldHtml(f, statuses)).join('\n  ')}
  <p class="full inkind-honeypot" hidden><label>Company<input name="company" tabindex="-1" autocomplete="off"></label></p>
  ${ts}
  <div class="full inkind-form-actions">
    <button class="btn primary" type="submit">${esc(def.submit_label)}</button>
    <p class="status" data-fs-status role="status" aria-live="polite"></p>
  </div>
</form></article><script src="/form-studio.js?v=${esc(assetVersion)}" defer></script>`;
}

export const FORM_BLOCK_RE = /<div class="studio-form-block" data-cms-form-v2="(\d+)"><\/div>/g;

export async function fillFormBlocks(env, html, opts = {}) {
  if (!html || !html.includes('data-cms-form-v2=')) return html;
  const ids = [...new Set([...html.matchAll(FORM_BLOCK_RE)].map((m) => Number(m[1])))].slice(0, 10);
  if (!ids.length) return html;
  await ensureFormStudioSchema(env);
  const rows = (await env.DB.prepare(`SELECT id, title, definition_json FROM cms_forms WHERE builder = 1 AND deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results || [];
  const forms = new Map(rows.map((r) => [Number(r.id), { id: r.id, definition: normalizeDefinition(safeJson(r.definition_json), r.title) }]));
  const urls = [...new Set([...forms.values()].flatMap((f) => definitionLinks(f.definition)))];
  const statuses = await linkStatuses(env, urls);
  return html.replace(FORM_BLOCK_RE, (_, id) => {
    const form = forms.get(Number(id));
    if (!form) return '<div class="studio-form-block" data-form-missing></div>';
    return `<div class="studio-form-block">${renderFormHtml(form, { ...opts, statuses })}</div>`;
  });
}

function safeJson(t, fb = {}) { try { return JSON.parse(t || '') ?? fb; } catch { return fb; } }

// ---------- payload ----------
export function normalizeSubmission(payload = {}, def) {
  const data = {}; const errors = [];
  const byName = new Map(def.fields.map((f) => [f.name, f]));
  for (const f of def.fields) {
    if (!FS_INPUT_TYPES.includes(f.type)) continue;
    const raw = payload?.[f.name];
    let value = ''; let label = '';
    if (f.type === 'checkbox') {
      const vals = (Array.isArray(raw) ? raw : String(raw ?? '').split(/[\n,]+/)).map((x) => trim(x, 60)).filter(Boolean);
      const picked = f.options.filter((o) => vals.includes(o.value));
      if (vals.length !== picked.length) errors.push(`${f.label}: please pick from the list.`);
      value = picked.map((o) => o.value).join(', '); label = picked.map((o) => o.label).join(', ');
    } else if (f.type === 'radio' || f.type === 'select') {
      const v = trim(raw, 60);
      const o = f.options.find((x) => x.value === v);
      if (v && !o) errors.push(`${f.label}: please pick from the list.`);
      value = o ? o.value : ''; label = o ? o.label : '';
    } else {
      value = f.type === 'textarea' ? trimMulti(raw, 2000) : trim(raw, f.type === 'phone' ? 40 : 200);
      if (f.type === 'email') value = value.toLowerCase();
      label = value;
    }
    if (f.price_check) {
      const src = byName.get(f.price_check.from);
      const chosen = trim(payload?.[f.price_check.from], 60);
      const item = src ? priceForValue(def, chosen) : null;
      if (item) {
        const want = moneyCents(item.price);
        if (!value && f.price_check.autofill) { value = item.price; label = value; }
        const got = moneyCents(value);
        if (value && want != null && got !== want) errors.push(`Amount enclosed should be ${centsLabel(want)} for ${String(src.label).toLowerCase()} ${chosen}.`);
      }
    }
    if (f.required && !value) { errors.push(`${f.label || 'This field'} is required.`); continue; }
    if (f.type === 'email' && value && !isEmail(value)) errors.push('A valid email is required.');
    if (f.type === 'number' && value && !/^-?\d+(\.\d+)?$/.test(value)) errors.push(`${f.label}: enter a number.`);
    if (f.type === 'date' && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors.push(`${f.label}: enter a date.`);
    data[f.name] = { value, label: f.label, ...(label !== value ? { option: label } : {}) };
  }
  return { ok: errors.length === 0, errors, data };
}

export const flatValues = (data) => Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, v && typeof v === 'object' ? String(v.value ?? '') : String(v ?? '')]));

export function renderTokens(tpl, flat, def) {
  return String(tpl || '').replace(/\{([a-z][a-z0-9_]*)\}/g, (_, k) => (k === 'title' ? def.title : (flat[k] ?? ''))).replace(/\s+/g, ' ').trim().slice(0, 200);
}

export function buildStaffMail(def, data, siteTitle) {
  const flat = flatValues(data);
  const v1 = toV1Definition(def);
  const mail = buildFormEmail({ data: flat, siteTitle, definition: v1 });
  if (def.email.subject) mail.subject = renderTokens(def.email.subject, flat, def) || mail.subject;
  if (def.email.intro) {
    mail.html = mail.html.replace(/^<p>[^<]*<\/p>/, `<p>${esc(def.email.intro)}</p>`);
    mail.text = mail.text.replace(/^[^\n]*/, def.email.intro);
  }
  mail.pdf = buildFormPdfBase64(flat, { definition: v1 });
  return mail;
}

export function buildConfirmMail(def, data, siteTitle) {
  const rows = def.fields.filter((f) => FS_INPUT_TYPES.includes(f.type) && data[f.name]?.value).map((f) => [f.label, data[f.name].option || data[f.name].value]);
  const subject = `We received your ${def.title}`;
  const text = [`Thank you. ${siteTitle} received your ${def.title}.`, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', 'You do not need to reply to this email.'].join('\n');
  const html = `<p>Thank you. ${esc(siteTitle)} received your ${esc(def.title)}.</p><table style="border-collapse:collapse;width:100%;max-width:560px;font-family:Georgia,serif;font-size:15px;color:#10233c">${rows.map(([k, v]) => `<tr><th align="left" style="padding:8px 10px 8px 0;border-bottom:1px solid #e1e8f1;width:38%;color:#014990">${esc(k)}</th><td style="padding:8px 0;border-bottom:1px solid #e1e8f1">${esc(v)}</td></tr>`).join('')}</table><p>You do not need to reply to this email.</p>`;
  return { subject, text, html };
}

// ---------- mail guard (shared D1 counter) ----------
const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
export async function mailHeadroom(env, now = new Date()) {
  const day = utcDay(now);
  const row = await env.DB.prepare('SELECT (SELECT sent FROM mail_counter WHERE day = ?) AS d, (SELECT COALESCE(SUM(sent),0) FROM mail_counter WHERE day LIKE ?) AS m').bind(day, `${day.slice(0, 7)}%`).first();
  const d = Number(row?.d || 0); const m = Number(row?.m || 0);
  return Math.max(0, Math.min(MAIL_DAY_CAP - d, MAIL_MONTH_CAP - m));
}
async function countMail(env, n, now = new Date(), floorFromHeader = null) {
  const day = utcDay(now);
  await env.DB.prepare('INSERT INTO mail_counter (day, sent) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET sent = MAX(sent + excluded.sent, ?)').bind(day, n, Number(floorFromHeader) || 0).run();
}

/** Sends one message if the guard allows. Returns 'sent' | 'queued' | 'off' | 'failed:...'. */
export async function guardedSend(env, deps, msg) {
  if (!env.RESEND_API_KEY) return 'off';
  const cost = msg.to.length;
  if ((await mailHeadroom(env)) < cost) return 'queued';
  try {
    const res = await deps.sendMail(env, msg);
    const quota = Number(res?.headers?.get?.('x-resend-daily-quota') || 0) || null;
    await countMail(env, cost, new Date(), quota);
    return 'sent';
  } catch (e) {
    if (/429|quota/i.test(String(e?.message || e))) return 'queued';
    return `failed:${String(e?.message || e).slice(0, 160)}`;
  }
}

// ---------- link checks ----------
export function urlProblem(raw) {
  let u;
  if (String(raw).length > 2048) return 'too long';
  try { u = new URL(raw); } catch { return 'not a web address'; }
  if (u.protocol !== 'https:') return 'must start with https';
  if (u.username || u.password) return 'has a username or password';
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.localhost') || h.endsWith('.internal')) return 'local address';
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.startsWith('[')) return 'IP address';
  return '';
}
export function hostBlocked(host, patterns) {
  const h = String(host).toLowerCase();
  return patterns.find((p) => h === p || h.endsWith(`.${p}`)) || '';
}

/** Checks up to LINK_MAX_PER_SAVE urls with a hard subrequest counter. */
export async function checkLinks(env, urls, { fetchImpl = fetch, budget = SUBREQUEST_BUDGET } = {}) {
  let used = 0;
  const take = () => (used < budget ? (++used, true) : false);
  const blockRows = (await env.DB.prepare('SELECT pattern FROM link_blocklist').all().catch(() => ({ results: [] }))).results || [];
  const patterns = [...BUILTIN_BLOCKLIST, ...blockRows.map((r) => String(r.pattern).toLowerCase())];
  const results = [];
  for (const url of urls.slice(0, LINK_MAX_PER_SAVE)) {
    const r = { url, final_url: url, status: 'pending', reason: '', http_status: null, threats: [] };
    const bad = urlProblem(url);
    if (bad) { r.status = 'blocked'; r.reason = bad; results.push(r); continue; }
    const b = hostBlocked(new URL(url).hostname, patterns);
    if (b) { r.status = 'blocked'; r.reason = `on the blocklist (${b})`; results.push(r); continue; }
    let current = url; let hops = 0;
    try {
      for (;;) {
        if (!take()) { r.status = 'pending'; r.reason = 'check budget used; finished by the scheduled recheck'; break; }
        let res = await fetchImpl(current, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5000) });
        if ((res.status === 405 || res.status === 501) && take()) {
          res = await fetchImpl(current, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000) });
          try { res.body?.cancel?.(); } catch { /* ignore */ }
        }
        r.http_status = res.status;
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
          if (hops >= 1) { r.status = 'ok'; break; }
          const next = new URL(res.headers.get('location'), current).toString();
          const p = urlProblem(next) || (hostBlocked(new URL(next).hostname, patterns) ? 'redirects to a blocked site' : '');
          if (p) { r.status = 'blocked'; r.reason = `redirect: ${p}`; break; }
          current = next; r.final_url = next; hops += 1; continue;
        }
        if (res.status < 400) r.status = 'ok';
        else if ([401, 403, 429].includes(res.status)) { r.status = 'unconfirmed'; r.reason = `couldn't be checked: ${res.status}`; }
        else { r.status = 'unreachable'; r.reason = `doesn't answer (${res.status})`; }
        break;
      }
    } catch (e) { r.status = 'unreachable'; r.reason = /timeout|abort/i.test(String(e?.name || e)) ? "doesn't answer (timeout)" : "doesn't answer"; }
    results.push(r);
  }
  // Safe Browsing: one call for every url still ok. No key or any API error => 'unconfirmed' (never fail open).
  const sbTargets = results.filter((r) => r.status === 'ok');
  if (sbTargets.length) {
    let sbProblem = '';
    if (!env.GOOGLE_SAFE_BROWSING) sbProblem = 'Safe Browsing unavailable (no key)';
    else if (!take()) sbProblem = 'Safe Browsing unavailable (check budget)';
    else {
      try {
        const entries = [...new Set(sbTargets.flatMap((r) => [r.url, r.final_url]))].map((url) => ({ url }));
        const res = await fetchImpl(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(env.GOOGLE_SAFE_BROWSING)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', Referer: SAFE_BROWSING_REFERER },
          body: JSON.stringify({
            client: { clientId: 'efhsband-site-studio', clientVersion: '1.0' },
            threatInfo: { threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'], platformTypes: ['ANY_PLATFORM'], threatEntryTypes: ['URL'], threatEntries: entries },
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          let why = '';
          try { why = (await res.text()).includes('API_KEY_HTTP_REFERRER_BLOCKED') ? ' referrer blocked' : ''; } catch { /* ignore */ }
          sbProblem = `Safe Browsing unavailable (${res.status}${why})`;
        } else {
          const body = await res.json().catch(() => null);
          if (!body || typeof body !== 'object') sbProblem = 'Safe Browsing unavailable (bad reply)';
          else for (const m of body.matches || []) {
            const hit = sbTargets.find((r) => r.url === m.threat?.url || r.final_url === m.threat?.url);
            if (hit) { hit.status = 'blocked'; hit.threats.push(m.threatType); hit.reason = `Google Safe Browsing lists it (${m.threatType}). Advisory provided by Google.`; }
          }
        }
      } catch { sbProblem = 'Safe Browsing unavailable (no answer)'; }
    }
    if (sbProblem) for (const r of sbTargets) { r.status = 'unconfirmed'; r.reason = sbProblem; r.safe_browsing_unavailable = true; }
  }
  return { results, subrequests: used };
}

export async function linkStatuses(env, urls) {
  const map = new Map();
  if (!urls.length) return map;
  const hashes = await Promise.all(urls.map((u) => sha256(u)));
  const rows = (await env.DB.prepare(`SELECT url, status FROM link_checks WHERE url_hash IN (${hashes.map(() => '?').join(',')})`).bind(...hashes).all().catch(() => ({ results: [] }))).results || [];
  for (const r of rows) map.set(r.url, r.status);
  return map;
}

/** Store results; anything not ok goes to the Super Admin review queue (one pending row per url). */
export async function storeLinkResults(env, results, { formId = null, userId = null } = {}) {
  const now = new Date();
  const next = new Date(now.getTime() + 7 * 864e5).toISOString();
  const stmts = [];
  for (const r of results) {
    const h = await sha256(r.url);
    const keepApproved = r.status === 'unconfirmed' || r.status === 'pending';
    stmts.push(env.DB.prepare(`INSERT INTO link_checks (url, url_hash, final_url, status, reason, threats_json, http_status, checked_at, next_check_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(url_hash) DO UPDATE SET final_url = excluded.final_url,
      status = CASE WHEN link_checks.status = 'approved' AND ${keepApproved ? 1 : 0} = 1 THEN 'approved' ELSE excluded.status END,
      reason = excluded.reason, threats_json = excluded.threats_json, http_status = excluded.http_status, checked_at = excluded.checked_at, next_check_at = excluded.next_check_at`)
      .bind(r.url, h, r.final_url || r.url, r.status, r.reason || '', JSON.stringify(r.threats || []), r.http_status, now.toISOString(), r.status === 'ok' ? next : now.toISOString()));
    if (formId) {
      stmts.push(env.DB.prepare("INSERT INTO link_uses (url_hash, form_id, kind, added_by) SELECT ?, ?, 'form', ? WHERE NOT EXISTS (SELECT 1 FROM link_uses WHERE url_hash = ? AND form_id = ?)").bind(h, formId, userId, h, formId));
    }
    if (r.status !== 'ok') {
      stmts.push(env.DB.prepare("INSERT INTO link_reviews (url_hash, requested_by, reason) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM link_reviews WHERE url_hash = ? AND status = 'pending') AND NOT EXISTS (SELECT 1 FROM link_checks WHERE url_hash = ? AND status = 'approved')")
        .bind(h, userId, r.reason || r.status, h, h));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
}

// ---------- scheduled jobs ----------
export async function purgeOldSubmissions(env, now = new Date()) {
  await ensureFormStudioSchema(env);
  const cutoff = now.toISOString().replace('T', ' ').slice(0, 19);
  const legacy = ((await env.DB.prepare("SELECT legacy_kind FROM cms_forms WHERE builder = 1 AND legacy_kind != ''").all()).results || []).map((r) => r.legacy_kind).filter((k) => k && k !== 'inkind');
  const kindSql = legacy.length ? ` OR (form_id IS NULL AND kind IN (${legacy.map(() => '?').join(',')}))` : '';
  const ids = ((await env.DB.prepare(`SELECT id FROM form_submissions WHERE kind != 'inkind' AND (form_id IS NOT NULL${kindSql})
    AND COALESCE(purge_after, datetime(created_at, '+${FS_RETENTION_DAYS} days')) < ? ORDER BY id LIMIT ${FS_PURGE_PER_NIGHT}`).bind(...legacy, cutoff).all()).results || []).map((r) => r.id);
  if (!ids.length) return 0;
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM form_mail_queue WHERE submission_id IN (${ids.map(() => '?').join(',')})`).bind(...ids),
    env.DB.prepare(`DELETE FROM form_submissions WHERE kind != 'inkind' AND id IN (${ids.map(() => '?').join(',')})`).bind(...ids),
  ]);
  return ids.length;
}

export async function drainMailQueue(env, deps) {
  await ensureFormStudioSchema(env);
  if (!env.RESEND_API_KEY) return { sent: 0, left: 0 };
  // Staff copies before confirmations.
  const rows = (await env.DB.prepare("SELECT q.id, q.submission_id, q.kind FROM form_mail_queue q WHERE q.sent_at IS NULL AND q.attempts < 5 ORDER BY CASE q.kind WHEN 'staff' THEN 0 ELSE 1 END, q.id LIMIT ?").bind(MAIL_QUEUE_PER_RUN).all()).results || [];
  let sent = 0;
  for (const q of rows) {
    const sub = await env.DB.prepare('SELECT s.id, s.payload_json, s.mail_state, f.title, f.definition_json FROM form_submissions s JOIN cms_forms f ON f.id = s.form_id WHERE s.id = ?').bind(q.submission_id).first();
    if (!sub) { await env.DB.prepare('DELETE FROM form_mail_queue WHERE id = ?').bind(q.id).run(); continue; }
    const def = normalizeDefinition(safeJson(sub.definition_json), sub.title);
    const msg = await deps.composeMail(env, def, safeJson(sub.payload_json), q.kind, q.submission_id);
    if (!msg) { await env.DB.prepare('DELETE FROM form_mail_queue WHERE id = ?').bind(q.id).run(); continue; }
    const result = await guardedSend(env, deps, msg);
    if (result === 'queued') break;
    const state = { ...safeJson(sub.mail_state), [q.kind]: result === 'sent' ? 'sent' : result };
    await env.DB.batch([
      env.DB.prepare(result === 'sent' ? 'UPDATE form_mail_queue SET sent_at = CURRENT_TIMESTAMP, attempts = attempts + 1 WHERE id = ?' : 'UPDATE form_mail_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?').bind(...(result === 'sent' ? [q.id] : [result, q.id])),
      env.DB.prepare(`UPDATE form_submissions SET mail_state = ?${q.kind === 'staff' && result === 'sent' ? ', delivered = 1' : ''} WHERE id = ?`).bind(JSON.stringify(state), q.submission_id),
    ]);
    if (result === 'sent') sent += 1;
  }
  return { sent, left: Math.max(0, rows.length - sent) };
}

export async function recheckLinks(env, { fetchImpl = fetch } = {}) {
  await ensureFormStudioSchema(env);
  const rows = (await env.DB.prepare("SELECT url, status FROM link_checks WHERE url_hash IN (SELECT url_hash FROM link_uses) ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, COALESCE(checked_at, '') LIMIT ?").bind(LINK_RECHECK_PER_RUN).all()).results || [];
  if (!rows.length) return { checked: 0, wentBad: [] };
  const before = new Map(rows.map((r) => [r.url, r.status]));
  const { results } = await checkLinks(env, rows.map((r) => r.url), { fetchImpl });
  await storeLinkResults(env, results);
  const wentBad = results.filter((r) => ['ok', 'approved'].includes(before.get(r.url)) && ['blocked', 'unreachable'].includes(r.status));
  return { checked: results.length, wentBad, sbUnavailable: results.some((r) => r.safe_browsing_unavailable) };
}
