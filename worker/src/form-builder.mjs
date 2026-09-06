import { buildMultiPageTextPdfBase64 } from './admin-audit-log.mjs';

export const MAX_CMS_FORMS = 40;
export const MAX_FORM_FIELDS = 40;
export const FORM_INPUT_TYPES = ['text', 'textarea', 'email', 'phone', 'number', 'date', 'dropdown', 'choice', 'checkbox'];
export const FORM_FIELD_TYPES = [
  { type: 'heading', label: 'Heading' },
  { type: 'text', label: 'Short Text' },
  { type: 'textarea', label: 'Long Text' },
  { type: 'email', label: 'Email' },
  { type: 'phone', label: 'Phone' },
  { type: 'number', label: 'Number' },
  { type: 'date', label: 'Date Picker' },
  { type: 'dropdown', label: 'Dropdown' },
  { type: 'choice', label: 'Single Choice' },
  { type: 'checkbox', label: 'Multiple Choice' },
  { type: 'note', label: 'Paragraph' },
  { type: 'pricing', label: 'Price List' },
];
export const RESERVED_FORM_SLUGS = new Set([
  'home', 'index', 'calendar', 'gallery', 'contact', 'boosters', 'fundraising', 'sponsors',
  'become-a-sponsor', 'in-kind', 'directors', 'ensembles', 'resources', 'admin', 'login',
  'maintenance', 'qr', 'dues-dev', 'caldev', 'sponsor-payment-complete',
]);

const formBySlugCache = new Map();
const FORM_CACHE_MS = 30_000;

function trimText(value, max = 240) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function trimMultiline(value, max = 4000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export function slugFromFormTitle(title, fallback = 'form') {
  const slug = String(title || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

export function formPathFromSlug(slug) {
  return `/${slugFromFormTitle(slug, 'form')}.html`;
}

export function isReservedFormSlug(slug) {
  return RESERVED_FORM_SLUGS.has(String(slug || '').trim().toLowerCase());
}

function uniqueFieldId(preferred, used) {
  const base = String(preferred || 'field')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'field';
  let next = base;
  let index = 2;
  while (used.has(next)) {
    next = `${base}_${index}`.slice(0, 56);
    index += 1;
  }
  used.add(next);
  return next;
}

function normalizeOptions(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\n,]+/);
  const seen = new Set();
  const options = [];
  for (const item of raw) {
    const option = trimText(item, 40);
    if (!option) continue;
    const key = option.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(option);
    if (options.length >= 20) break;
  }
  return options;
}

function normalizePricingItems(value) {
  const raw = Array.isArray(value) ? value : [];
  const items = [];
  for (const item of raw) {
    const label = trimText(item?.label, 80);
    const price = trimText(item?.price, 40);
    const sizes = trimText(item?.sizes, 80);
    if (!label && !price) continue;
    items.push({ label: label || 'Price', price, sizes });
    if (items.length >= 8) break;
  }
  return items;
}

export function normalizeFormField(input = {}, used = new Set()) {
  const source = input && typeof input === 'object' ? input : {};
  const allowed = new Set(FORM_FIELD_TYPES.map((item) => item.type));
  const type = allowed.has(source.type) ? source.type : 'text';
  const id = uniqueFieldId(source.id || source.label || type, used);
  const field = {
    id,
    type,
    label: trimText(source.label || (type === 'heading' ? 'Heading' : type === 'note' ? '' : 'Untitled'), 120),
    required: Boolean(source.required) && FORM_INPUT_TYPES.includes(type),
    full: source.full !== false && (Boolean(source.full) || type === 'heading' || type === 'note' || type === 'pricing' || type === 'textarea' || type === 'choice' || type === 'checkbox'),
    optional: Boolean(source.optional),
    placeholder: trimText(source.placeholder, 120),
    autocomplete: trimText(source.autocomplete, 40),
    price_from: Boolean(source.price_from) || id === 'amount_enclosed',
    emphasize: Boolean(source.emphasize),
    italic: Boolean(source.italic),
    text: type === 'note' ? trimMultiline(source.text || source.label, 800) : '',
    options: [],
    items: [],
  };
  if (type === 'choice' || type === 'dropdown' || type === 'checkbox') {
    field.options = normalizeOptions(source.options);
    if (!field.options.length) field.options = ['Option 1', 'Option 2'];
  }
  if (type === 'pricing') {
    field.items = normalizePricingItems(source.items);
    if (!field.items.length) field.items = [{ label: 'Item', price: '$0.00', sizes: '' }];
  }
  return field;
}

export function createFormField(type = 'text') {
  const meta = FORM_FIELD_TYPES.find((item) => item.type === type) || FORM_FIELD_TYPES[1];
  return normalizeFormField({
    type: meta.type,
    label: meta.type === 'heading' ? 'Heading' : meta.type === 'note' ? '' : meta.label,
    text: meta.type === 'note' ? 'Add your text.' : '',
    required: FORM_INPUT_TYPES.includes(meta.type) && meta.type !== 'checkbox',
  });
}

export function normalizeFormDefinition(input = {}, fallbackTitle = 'Untitled Form') {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const title = trimText(source.title || fallbackTitle, 160) || fallbackTitle;
  const used = new Set();
  const fields = Array.isArray(source.fields)
    ? source.fields.slice(0, MAX_FORM_FIELDS).map((item) => normalizeFormField(item, used))
    : [];
  return {
    kicker: trimText(source.kicker || 'Band Boosters', 80) || 'Band Boosters',
    heading: trimText(source.heading || 'East Forsyth Band', 120) || 'East Forsyth Band',
    title,
    intro: trimMultiline(source.intro, 800),
    submit_label: trimText(source.submit_label || 'Submit', 80) || 'Submit',
    fields,
  };
}

export function emptyFormDefinition(title = 'Untitled Form') {
  return normalizeFormDefinition({
    title,
    intro: '',
    fields: [
      { type: 'heading', label: title },
      { type: 'text', label: 'Name', required: true, full: true },
      { type: 'email', label: 'Email', required: true },
    ],
  });
}

export function rememberFormRecord(record) {
  if (!record?.slug) return record;
  formBySlugCache.set(record.slug, { at: Date.now(), record });
  return record;
}

export function forgetFormRecord(slug) {
  if (slug) formBySlugCache.delete(slug);
}

export function parseFormRecord(row) {
  if (!row) return null;
  let definition = {};
  try {
    definition = JSON.parse(row.definition_json || '{}') || {};
  } catch {
    definition = {};
  }
  let recipient_user_ids = [];
  try {
    recipient_user_ids = JSON.parse(row.recipient_user_ids || '[]') || [];
  } catch {
    recipient_user_ids = [];
  }
  const record = {
    id: Number(row.id),
    slug: String(row.slug || ''),
    path: String(row.path || ''),
    title: String(row.title || ''),
    page_id: row.page_id == null ? null : Number(row.page_id),
    definition: normalizeFormDefinition(definition, row.title || 'Untitled Form'),
    recipient_user_ids: (Array.isArray(recipient_user_ids) ? recipient_user_ids : [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0),
    created_at: row.created_at || '',
    updated_at: row.updated_at || '',
  };
  return rememberFormRecord(record);
}

export async function listCmsFormsSummary(env) {
  const rows = await env.DB.prepare(
    'SELECT id, slug, path, title, page_id, updated_at FROM cms_forms ORDER BY datetime(updated_at) DESC, id DESC',
  ).all();
  return rows.results || [];
}

export async function getFormBySlug(env, slug, { allowCache = true } = {}) {
  const key = String(slug || '').trim();
  if (!key) return null;
  if (allowCache) {
    const hit = formBySlugCache.get(key);
    if (hit && Date.now() - hit.at < FORM_CACHE_MS) return hit.record;
  }
  const row = await env.DB.prepare('SELECT * FROM cms_forms WHERE slug = ?').bind(key).first();
  return parseFormRecord(row);
}

export async function getFormById(env, id) {
  const row = await env.DB.prepare('SELECT * FROM cms_forms WHERE id = ?').bind(Number(id)).first();
  return parseFormRecord(row);
}

function priceForSize(definition, size) {
  const key = String(size || '').trim().toUpperCase();
  if (!key) return '';
  for (const field of definition.fields || []) {
    if (field.type !== 'pricing') continue;
    for (const item of field.items || []) {
      const sizes = String(item.sizes || '').split(/[\s,]+/).map((part) => part.trim().toUpperCase()).filter(Boolean);
      if (sizes.includes(key)) return String(item.price || '');
    }
  }
  return '';
}

function fieldValue(payload, field) {
  if (field.type === 'checkbox') {
    const raw = payload?.[field.id];
    const values = Array.isArray(raw) ? raw : String(raw || '').split(/[\n,]+/);
    return values.map((item) => trimText(item, 40)).filter((item) => field.options.includes(item)).join(', ');
  }
  const raw = payload?.[field.id];
  if (field.type === 'textarea') return trimMultiline(raw, 800);
  if (field.type === 'email') return trimText(raw, 160).toLowerCase();
  if (field.type === 'choice' || field.type === 'dropdown') {
    const value = trimText(raw, 40);
    return field.options.includes(value) ? value : '';
  }
  return trimText(raw, field.type === 'phone' ? 40 : 160);
}

export function normalizeFormPayload(payload = {}, definition = emptyFormDefinition()) {
  const form = normalizeFormDefinition(definition);
  const data = {};
  const errors = [];
  for (const field of form.fields) {
    if (!FORM_INPUT_TYPES.includes(field.type)) continue;
    let value = fieldValue(payload, field);
    if (field.price_from && !value) value = priceForSize(form, payload.jacket_size || data.jacket_size);
    data[field.id] = value;
    if (field.required && !value) {
      errors.push(`${field.label || 'This field'} is required.`);
      continue;
    }
    if (field.type === 'email' && value && !isValidEmail(value)) errors.push('A valid email is required.');
  }
  return { ok: errors.length === 0, errors, data };
}

function renderFieldHtml(field) {
  const full = field.full ? ' full' : '';
  const required = field.required ? ' required' : '';
  const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : '';
  const autocomplete = field.autocomplete ? ` autocomplete="${escapeHtml(field.autocomplete)}"` : '';
  const optional = field.optional ? ' <span class="muted">(optional)</span>' : '';
  if (field.type === 'heading') return `<h3 class="full letterman-section">${escapeHtml(field.label)}</h3>`;
  if (field.type === 'note') {
    const cls = ['full', 'letterman-note', field.emphasize ? 'letterman-note-strong' : '', field.italic ? 'letterman-thanks' : ''].filter(Boolean).join(' ');
    const body = field.emphasize ? `<b>${escapeHtml(field.text)}</b>` : field.italic ? `<em>${escapeHtml(field.text)}</em>` : escapeHtml(field.text);
    return `<p class="${cls}">${body}</p>`;
  }
  if (field.type === 'pricing') {
    const items = field.items.map((item) => (
      `<div data-letterman-price data-price-sizes="${escapeHtml(item.sizes)}"><span>${escapeHtml(item.label)}</span><b>${escapeHtml(item.price)}</b></div>`
    )).join('');
    return `<div class="full letterman-pricing" data-letterman-pricing>${items}</div>`;
  }
  if (field.type === 'choice') {
    const options = field.options.map((option) => (
      `<label class="letterman-choice"><input type="radio" name="${escapeHtml(field.id)}" value="${escapeHtml(option)}"${required}> ${escapeHtml(option)}</label>`
    )).join('');
    return `<fieldset class="full letterman-choices"><legend>${escapeHtml(field.label)}</legend><div class="letterman-choice-row">${options}</div></fieldset>`;
  }
  if (field.type === 'checkbox') {
    const options = field.options.map((option) => (
      `<label class="letterman-choice"><input type="checkbox" name="${escapeHtml(field.id)}" value="${escapeHtml(option)}"> ${escapeHtml(option)}</label>`
    )).join('');
    return `<fieldset class="full letterman-choices"><legend>${escapeHtml(field.label)}${field.required ? ' *' : ''}</legend><div class="letterman-choice-row">${options}</div></fieldset>`;
  }
  if (field.type === 'dropdown') {
    const options = ['<option value="">Select</option>', ...field.options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)].join('');
    return `<label class="${full.trim() || 'full'}">${escapeHtml(field.label)}${optional}<select name="${escapeHtml(field.id)}"${required}>${options}</select></label>`;
  }
  if (field.type === 'textarea') {
    return `<label class="full">${escapeHtml(field.label)}${optional}<textarea name="${escapeHtml(field.id)}" rows="4" maxlength="800"${required}${placeholder}></textarea></label>`;
  }
  const inputType = field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'number' ? 'number' : 'text';
  const priceAttr = field.price_from ? ' data-letterman-amount' : '';
  const max = field.type === 'date' || field.type === 'number' ? '' : field.type === 'phone' ? ' maxlength="40"' : ' maxlength="160"';
  return `<label class="${full.trim()}">${escapeHtml(field.label)}${optional}<input name="${escapeHtml(field.id)}" type="${inputType}"${required}${max}${placeholder}${autocomplete}${priceAttr}></label>`;
}

export function renderCmsFormHtml(definition, slug) {
  const form = normalizeFormDefinition(definition);
  return `<form class="inkind-form letterman-form form-grid" data-cms-form="${escapeHtml(slug)}" novalidate>
  ${form.fields.map(renderFieldHtml).join('\n  ')}
  <p class="full inkind-honeypot" hidden><label>Company<input name="company" tabindex="-1" autocomplete="off"></label></p>
  <div class="full inkind-form-actions">
    <button class="btn primary" type="submit">${escapeHtml(form.submit_label)}</button>
    <p class="status" data-cms-form-status aria-live="polite"></p>
  </div>
</form>`;
}

export function renderCmsFormPageBody(page = {}, definition = emptyFormDefinition(), slug = '') {
  const form = normalizeFormDefinition(definition, page.title || 'Form');
  const heading = String(page.title || form.title).trim() || form.title;
  return `<section class="page-hero sponsor-hero" data-cms-layout="cms-form"><div class="page-title"><div class="kicker">${escapeHtml(form.kicker)}</div><h1>${escapeHtml(form.heading)}</h1><p>${escapeHtml(heading)}</p></div></section>
<section class="content sponsor-content"><div class="wrap inkind-wrap letterman-wrap">
  <article class="card inkind-card letterman-card" data-letterman-copy>
    <span class="tag">${escapeHtml(form.kicker)}</span>
    <h2>${escapeHtml(form.title)}</h2>
    ${form.intro ? `<p data-letterman-intro>${escapeHtml(form.intro)}</p>` : ''}
    ${renderCmsFormHtml(form, slug || page.slug)}
  </article>
</div></section>`;
}

export function isCmsFormPage(page = {}) {
  return Boolean(page && /data-cms-form=/.test(String(page.body_html || '')));
}

export function buildFormPdfLines(data = {}, { submittedAt = '', definition = emptyFormDefinition() } = {}) {
  const form = normalizeFormDefinition(definition);
  const submitted = submittedAt || new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const lines = [form.heading, form.title, `Submitted: ${submitted} ET`, ''];
  for (const field of form.fields) {
    if (field.type === 'heading') {
      lines.push('', field.label, '');
      continue;
    }
    if (field.type === 'note') {
      if (field.text) lines.push(field.text);
      continue;
    }
    if (field.type === 'pricing') {
      for (const item of field.items) lines.push(`${item.label}: ${item.price}`);
      continue;
    }
    lines.push(`${field.label}: ${data[field.id] || '—'}`);
  }
  return lines;
}

export function buildFormPdfBase64(data = {}, options = {}) {
  const form = normalizeFormDefinition(options.definition);
  return buildMultiPageTextPdfBase64(buildFormPdfLines(data, options), {
    title: `${form.heading} — ${form.title}`,
  });
}

export function buildFormEmail({ data, siteTitle = 'East Forsyth Band', definition = emptyFormDefinition() }) {
  const form = normalizeFormDefinition(definition);
  const firstValue = form.fields.find((field) => FORM_INPUT_TYPES.includes(field.type) && data[field.id])?.id;
  const subject = `${form.title}: ${data.student_name || data.name || data[firstValue] || 'Submission'}`;
  const text = [
    `A new ${form.title} was submitted on the ${siteTitle} website.`,
    '',
    ...buildFormPdfLines(data, { definition: form }),
    '',
    'The completed form is attached as a PDF.',
  ].join('\n');
  const rows = form.fields
    .filter((field) => FORM_INPUT_TYPES.includes(field.type))
    .map((field) => `<tr><th align="left" style="padding:8px 10px 8px 0;border-bottom:1px solid #e1e8f1;width:38%;color:#014990">${escapeHtml(field.label)}</th><td style="padding:8px 0;border-bottom:1px solid #e1e8f1">${escapeHtml(data[field.id] || '—')}</td></tr>`)
    .join('');
  const html = `<p>A new ${escapeHtml(form.title)} was submitted on the ${escapeHtml(siteTitle)} website.</p>
<table style="border-collapse:collapse;width:100%;max-width:560px;font-family:Georgia,serif;font-size:15px;color:#10233c">${rows}</table>
<p>The completed form is attached as a PDF.</p>`;
  return { subject, text, html };
}

export async function nextAvailableFormSlug(env, title, preferred = '') {
  const base = slugFromFormTitle(preferred || title, 'form');
  let slug = base;
  let index = 2;
  while (isReservedFormSlug(slug) || await env.DB.prepare('SELECT id FROM cms_forms WHERE slug = ?').bind(slug).first() || await env.DB.prepare('SELECT id FROM cms_pages WHERE slug = ? OR path = ?').bind(slug, formPathFromSlug(slug)).first()) {
    slug = `${base}-${index}`.slice(0, 64);
    index += 1;
    if (index > 80) throw new Error('Could not create a unique form page name.');
  }
  return slug;
}
