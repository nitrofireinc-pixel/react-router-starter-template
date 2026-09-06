import { buildMultiPageTextPdfBase64 } from './admin-audit-log.mjs';

export const LETTERMAN_FORM_KEY = 'letterman_jacket_form';
export const LETTERMAN_RECIPIENT_KEY = 'letterman_jacket_recipient_user_ids';
export const LETTERMAN_FIELD_TYPES = ['heading', 'text', 'textarea', 'date', 'email', 'phone', 'choice', 'note', 'pricing'];
export const LETTERMAN_INPUT_TYPES = ['text', 'textarea', 'date', 'email', 'phone', 'choice'];
export const JACKET_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
export const PAYMENT_METHODS = ['Cash', 'Check'];
export const MAX_LETTERMAN_FIELDS = 40;
export const LETTERMAN_PAYMENT_DEPOSIT_NOTE = 'Please deposit method of payment in the drop box in the band room with the students name on the envelope.';
const LETTERMAN_RETIRED_QUESTIONS_NOTE = 'Please speak to a Band Booster Board Member, Mr. Kuropas or Mrs. Murphy.';

const PAGE_KEYS = ['kicker', 'heading', 'title', 'intro', 'submit_label'];

export const DEFAULT_LETTERMAN_PAGE = {
  kicker: 'Band Boosters',
  heading: 'East Forsyth Band',
  title: 'Letterman Jacket Order Form',
  intro: 'Complete this order form for an East Forsyth Band letterman jacket. Return the form with payment to the Band Boosters.',
  submit_label: 'Submit order',
};

export function defaultLettermanFields() {
  return [
    field({ id: 'student_section', type: 'heading', label: 'Student Information' }),
    field({ id: 'student_name', type: 'text', label: 'Student name', required: true, full: true, autocomplete: 'name' }),
    field({ id: 'grade', type: 'text', label: 'Grade', required: true, placeholder: '9, 10, 11, or 12' }),
    field({ id: 'order_date', type: 'date', label: 'Date', required: true }),
    field({ id: 'parent_name', type: 'text', label: 'Parent/Guardian name', required: true, full: true, autocomplete: 'name' }),
    field({ id: 'phone', type: 'phone', label: 'Phone', required: true, autocomplete: 'tel' }),
    field({ id: 'email', type: 'email', label: 'Email', required: true, autocomplete: 'email' }),
    field({
      id: 'embroidered_name',
      type: 'text',
      label: 'Name to be embroidered',
      required: true,
      full: true,
      placeholder: 'First and last name, first name, or nickname',
    }),
    field({
      id: 'second_embroidery',
      type: 'text',
      label: 'Second embroidery line',
      full: true,
      optional: true,
      placeholder: 'Instrument or section, graduation year',
    }),
    field({ id: 'jacket_section', type: 'heading', label: 'Jacket Information' }),
    field({ id: 'jacket_size', type: 'choice', label: 'Jacket Size', required: true, full: true, options: [...JACKET_SIZES] }),
    field({
      id: 'pricing',
      type: 'pricing',
      label: 'Pricing',
      items: [
        { label: 'Jacket Size S–XL', price: '$52.00', sizes: 'S, M, L, XL' },
        { label: 'Jacket Size 2XL', price: '$54.00', sizes: '2XL' },
        { label: 'Jacket Size 3XL', price: '$55.00', sizes: '3XL' },
      ],
    }),
    field({ id: 'payment_section', type: 'heading', label: 'Payment' }),
    field({
      id: 'payment_deposit',
      type: 'note',
      text: LETTERMAN_PAYMENT_DEPOSIT_NOTE,
    }),
    field({ id: 'payment_method', type: 'choice', label: 'Payment method', required: true, full: true, options: [...PAYMENT_METHODS] }),
    field({ id: 'amount_enclosed', type: 'text', label: 'Amount enclosed', required: true, placeholder: '$52.00', price_from: true }),
    field({ id: 'payment_note', type: 'note', text: 'Make checks payable to: East Forsyth Band Boosters' }),
    field({
      id: 'acknowledgment',
      type: 'note',
      text: 'I have reviewed the jacket size, embroidered name, instrument, and pricing above. I understand that the order will be submitted after the completed form and payment are received.',
    }),
    field({ id: 'parent_signature', type: 'text', label: 'Parent/Guardian signature', required: true, placeholder: 'Type full name' }),
    field({ id: 'parent_sign_date', type: 'date', label: 'Date', required: true }),
    field({ id: 'student_signature', type: 'text', label: 'Student signature', required: true, placeholder: 'Type full name' }),
    field({ id: 'student_sign_date', type: 'date', label: 'Date', required: true }),
    field({ id: 'return_heading', type: 'heading', label: 'Return form & payment to' }),
    field({ id: 'return_name', type: 'note', text: 'East Forsyth Band Boosters', emphasize: true }),
    field({ id: 'deadline', type: 'note', text: 'Deadline: September 5th, 2026' }),
    field({ id: 'thank_you', type: 'note', text: 'Thank you for supporting the East Forsyth Band!', italic: true }),
  ];
}

export const DEFAULT_LETTERMAN_FORM = {
  ...DEFAULT_LETTERMAN_PAGE,
  fields: defaultLettermanFields(),
};

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

function slugFieldId(value, fallback = 'field') {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return slug || fallback;
}

function uniqueFieldId(preferred, used) {
  const base = slugFieldId(preferred, `field_${used.size + 1}`);
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
    items.push({ label: label || 'Price', price: price || '', sizes });
    if (items.length >= 8) break;
  }
  return items;
}

function field(input = {}) {
  return normalizeLettermanField(input, new Set());
}

export function normalizeLettermanField(input = {}, used = new Set()) {
  const source = input && typeof input === 'object' ? input : {};
  const type = LETTERMAN_FIELD_TYPES.includes(source.type) ? source.type : 'text';
  const id = uniqueFieldId(source.id || source.label || type, used);
  const label = trimText(source.label || (type === 'heading' ? 'Section' : type === 'note' ? '' : 'Field'), type === 'note' ? 200 : 120);
  const next = {
    id,
    type,
    label,
    required: Boolean(source.required) && LETTERMAN_INPUT_TYPES.includes(type),
    full: Boolean(source.full) || type === 'heading' || type === 'note' || type === 'pricing' || type === 'choice' || type === 'textarea',
    optional: Boolean(source.optional),
    placeholder: trimText(source.placeholder, 120),
    autocomplete: trimText(source.autocomplete, 40),
    price_from: Boolean(source.price_from) || id === 'amount_enclosed',
    emphasize: Boolean(source.emphasize),
    italic: Boolean(source.italic) || id === 'thank_you',
    text: '',
    options: [],
    items: [],
  };
  if (type === 'note') next.text = trimMultiline(source.text || source.label, 800);
  if (type === 'choice') {
    next.options = normalizeOptions(source.options);
    if (!next.options.length) next.options = [...JACKET_SIZES];
  }
  if (type === 'pricing') {
    next.items = normalizePricingItems(source.items);
    if (!next.items.length) {
      next.items = [
        { label: 'Jacket Size S–XL', price: '$52.00', sizes: 'S, M, L, XL' },
        { label: 'Jacket Size 2XL', price: '$54.00', sizes: '2XL' },
        { label: 'Jacket Size 3XL', price: '$55.00', sizes: '3XL' },
      ];
    }
  }
  return next;
}

export function createLettermanField(input = {}) {
  return normalizeLettermanField({
    type: input.type || 'text',
    label: input.label || (input.type === 'heading' ? 'New section' : input.type === 'note' ? '' : 'New field'),
    text: input.text || (input.type === 'note' ? 'New note' : ''),
    options: input.options,
    items: input.items,
    required: input.required,
    full: input.full,
    placeholder: input.placeholder,
  });
}

function applyLegacyCopyToFields(fields, source = {}) {
  const next = fields.map((item) => ({ ...item, options: [...(item.options || [])], items: (item.items || []).map((row) => ({ ...row })) }));
  const setLabel = (id, value) => {
    const field = next.find((item) => item.id === id);
    if (field && value) field.label = value;
  };
  const setText = (id, value) => {
    const field = next.find((item) => item.id === id);
    if (field && value) field.text = value;
  };
  setLabel('student_section', trimText(source.student_section, 80));
  setLabel('jacket_section', trimText(source.jacket_section, 80));
  setLabel('jacket_size', trimText(source.jacket_size_label, 80));
  setLabel('payment_section', trimText(source.payment_section, 80));
  setText('payment_note', trimMultiline(source.payment_note, 800));
  setText('acknowledgment', trimMultiline(source.acknowledgment, 800));
  setLabel('return_heading', trimText(source.return_heading, 120));
  setText('return_name', trimText(source.return_name, 160));
  if (trimText(source.deadline, 80)) setText('deadline', `Deadline: ${trimText(source.deadline, 80)}`);
  setText('thank_you', trimText(source.thank_you, 200));
  const pricing = next.find((item) => item.type === 'pricing');
  if (pricing) {
    if (source.pricing_s_xl_label || source.pricing_s_xl) {
      pricing.items[0] = {
        label: trimText(source.pricing_s_xl_label, 80) || pricing.items[0]?.label || 'Jacket Size S–XL',
        price: trimText(source.pricing_s_xl, 40) || pricing.items[0]?.price || '$52.00',
        sizes: pricing.items[0]?.sizes || 'S, M, L, XL',
      };
    }
    if (source.pricing_2xl_label || source.pricing_2xl) {
      pricing.items[1] = {
        label: trimText(source.pricing_2xl_label, 80) || pricing.items[1]?.label || 'Jacket Size 2XL',
        price: trimText(source.pricing_2xl, 40) || pricing.items[1]?.price || '$54.00',
        sizes: pricing.items[1]?.sizes || '2XL',
      };
    }
    if (source.pricing_3xl_label || source.pricing_3xl) {
      pricing.items[2] = {
        label: trimText(source.pricing_3xl_label, 80) || pricing.items[2]?.label || 'Jacket Size 3XL',
        price: trimText(source.pricing_3xl, 40) || pricing.items[2]?.price || '$55.00',
        sizes: pricing.items[2]?.sizes || '3XL',
      };
    }
  }
  return next;
}

export function normalizeLettermanFormCopy(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const page = { ...DEFAULT_LETTERMAN_PAGE };
  for (const key of PAGE_KEYS) {
    if (source[key] == null) continue;
    const value = key === 'intro' ? trimMultiline(source[key], 800) : trimText(source[key], key === 'title' ? 160 : 120);
    if (value) page[key] = value;
  }
  const used = new Set();
  let fields;
  if (Array.isArray(source.fields) && source.fields.length) {
    fields = source.fields.slice(0, MAX_LETTERMAN_FIELDS).map((item) => normalizeLettermanField(item, used));
  } else {
    fields = applyLegacyCopyToFields(defaultLettermanFields(), source).map((item) => normalizeLettermanField(item, used));
  }
  if (!fields.length) fields = defaultLettermanFields();
  fields = syncLettermanStockCopy(fields);
  return { ...page, fields };
}

function syncLettermanStockCopy(fields = []) {
  const hadOldQuestions = fields.some((item) => (
    item.id === 'questions' || String(item.text || '').trim() === LETTERMAN_RETIRED_QUESTIONS_NOTE
  ));
  const next = fields.filter((item) => (
    item.id !== 'questions' && String(item.text || '').trim() !== LETTERMAN_RETIRED_QUESTIONS_NOTE
  ));
  const hasDeposit = next.some((item) => (
    item.id === 'payment_deposit' || String(item.text || '').includes('drop box in the band room')
  ));
  if (hadOldQuestions && !hasDeposit) {
    const used = new Set(next.map((item) => item.id));
    const deposit = normalizeLettermanField({
      id: 'payment_deposit',
      type: 'note',
      text: LETTERMAN_PAYMENT_DEPOSIT_NOTE,
    }, used);
    const payIndex = next.findIndex((item) => item.id === 'payment_section');
    if (payIndex >= 0) next.splice(payIndex + 1, 0, deposit);
    else next.unshift(deposit);
  }
  return next;
}

export function parseLettermanFormCopy(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return normalizeLettermanFormCopy(value);
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      return normalizeLettermanFormCopy(JSON.parse(value));
    } catch {
      return normalizeLettermanFormCopy();
    }
  }
  return normalizeLettermanFormCopy();
}

function pricingItems(copy = DEFAULT_LETTERMAN_FORM) {
  const form = copy.fields ? copy : normalizeLettermanFormCopy(copy);
  return form.fields.filter((item) => item.type === 'pricing').flatMap((item) => item.items || []);
}

export function priceForJacketSize(copy = DEFAULT_LETTERMAN_FORM, size = '') {
  const key = String(size || '').trim().toUpperCase();
  if (!key) return '';
  for (const item of pricingItems(copy)) {
    const sizes = String(item.sizes || '').split(/[\s,]+/).map((part) => part.trim().toUpperCase()).filter(Boolean);
    if (sizes.includes(key)) return String(item.price || '');
  }
  return '';
}

function fieldValue(payload, field) {
  const raw = payload?.[field.id];
  if (field.type === 'textarea') return trimMultiline(raw, 800);
  if (field.type === 'email') return trimText(raw, 160).toLowerCase();
  if (field.type === 'choice') {
    const value = trimText(raw, 40);
    return field.options.includes(value) ? value : '';
  }
  return trimText(raw, field.type === 'phone' ? 40 : 160);
}

export function normalizeLettermanPayload(payload = {}, copy = DEFAULT_LETTERMAN_FORM) {
  const form = normalizeLettermanFormCopy(copy);
  const data = {};
  const errors = [];
  for (const field of form.fields) {
    if (!LETTERMAN_INPUT_TYPES.includes(field.type)) continue;
    let value = fieldValue(payload, field);
    if (field.price_from && !value) value = priceForJacketSize(form, payload.jacket_size || data.jacket_size);
    data[field.id] = value;
    if (field.required && !value) {
      errors.push(`${field.label || 'This field'} is required.`);
      continue;
    }
    if (field.type === 'email' && value && !isValidEmail(value)) {
      errors.push('A valid email is required.');
    }
  }
  return { ok: errors.length === 0, errors, data };
}

export function buildLettermanPdfLines(data = {}, { submittedAt = '', copy = DEFAULT_LETTERMAN_FORM } = {}) {
  const form = normalizeLettermanFormCopy(copy);
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

export function buildLettermanPdfBase64(data = {}, options = {}) {
  const form = normalizeLettermanFormCopy(options.copy);
  return buildMultiPageTextPdfBase64(buildLettermanPdfLines(data, options), {
    title: `${form.heading} — ${form.title}`,
  });
}

function orderTitle(data = {}, form = DEFAULT_LETTERMAN_FORM) {
  return data.student_name
    || data[form.fields.find((item) => item.type === 'text' && item.required)?.id]
    || 'Order';
}

export function buildLettermanEmail({ data, siteTitle = 'East Forsyth Band', copy = DEFAULT_LETTERMAN_FORM }) {
  const form = normalizeLettermanFormCopy(copy);
  const subject = `${form.title}: ${orderTitle(data, form)}`;
  const text = [
    `A new ${form.title.toLowerCase()} was submitted on the ${siteTitle} website.`,
    '',
    ...buildLettermanPdfLines(data, { copy: form }),
    '',
    'The completed form is attached as a PDF.',
  ].join('\n');
  const rows = form.fields
    .filter((field) => LETTERMAN_INPUT_TYPES.includes(field.type))
    .map((field) => emailRow(field.label, data[field.id]))
    .join('');
  const html = `<p>A new ${escapeHtml(form.title.toLowerCase())} was submitted on the ${escapeHtml(siteTitle)} website.</p>
<table style="border-collapse:collapse;width:100%;max-width:560px;font-family:Georgia,serif;font-size:15px;color:#10233c">
  ${rows}
</table>
<p>The completed form is attached as a PDF.</p>`;
  return { subject, text, html };
}

function emailRow(label, value) {
  return `<tr><th align="left" style="padding:8px 10px 8px 0;border-bottom:1px solid #e1e8f1;width:38%;color:#014990">${escapeHtml(label)}</th><td style="padding:8px 0;border-bottom:1px solid #e1e8f1">${escapeHtml(value || '—')}</td></tr>`;
}

function renderFieldHtml(field) {
  const full = field.full ? ' full' : '';
  const required = field.required ? ' required' : '';
  const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : '';
  const autocomplete = field.autocomplete ? ` autocomplete="${escapeHtml(field.autocomplete)}"` : '';
  const optional = field.optional ? ' <span class="muted">(optional)</span>' : '';
  if (field.type === 'heading') {
    return `<h3 class="full letterman-section">${escapeHtml(field.label)}</h3>`;
  }
  if (field.type === 'note') {
    const cls = [
      'full',
      'letterman-note',
      field.emphasize ? 'letterman-note-strong' : '',
      field.italic ? 'letterman-thanks' : '',
      field.id === 'acknowledgment' ? 'letterman-ack' : '',
      field.id === 'payment_note' ? 'muted' : '',
    ].filter(Boolean).join(' ');
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
    return `<fieldset class="full letterman-choices">
    <legend>${escapeHtml(field.label)}</legend>
    <div class="letterman-choice-row">${options}</div>
  </fieldset>`;
  }
  if (field.type === 'textarea') {
    return `<label class="${full.trim() || 'full'}">${escapeHtml(field.label)}${optional}
    <textarea name="${escapeHtml(field.id)}" rows="4" maxlength="800"${required}${placeholder}></textarea>
  </label>`;
  }
  const inputType = field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text';
  const priceAttr = field.price_from ? ' data-letterman-amount' : '';
  const max = field.type === 'date' ? '' : field.type === 'phone' ? ' maxlength="40"' : ' maxlength="160"';
  return `<label class="${full.trim()}">${escapeHtml(field.label)}${optional}
    <input name="${escapeHtml(field.id)}" type="${inputType}"${required}${max}${placeholder}${autocomplete}${priceAttr}>
  </label>`;
}

export function renderLettermanFormHtml(copy = DEFAULT_LETTERMAN_FORM) {
  const form = normalizeLettermanFormCopy(copy);
  return `<form class="inkind-form letterman-form form-grid" data-letterman-form novalidate>
  ${form.fields.map(renderFieldHtml).join('\n  ')}
  <p class="full inkind-honeypot" hidden><label>Company<input name="company" tabindex="-1" autocomplete="off"></label></p>
  <div class="full inkind-form-actions">
    <button class="btn primary" type="submit">${escapeHtml(form.submit_label)}</button>
    <p class="status" data-letterman-status aria-live="polite"></p>
  </div>
</form>`;
}

export function renderLettermanPageBody(page = {}, copy = DEFAULT_LETTERMAN_FORM) {
  const form = normalizeLettermanFormCopy(copy);
  const heading = String(page.title || form.title).trim() || form.title;
  return `<section class="page-hero sponsor-hero" data-cms-layout="letterman-jacket"><div class="page-title"><div class="kicker">${escapeHtml(form.kicker)}</div><h1>${escapeHtml(form.heading)}</h1><p>${escapeHtml(heading)}</p></div></section>
<section class="content sponsor-content"><div class="wrap inkind-wrap letterman-wrap">
  <article class="card inkind-card letterman-card" data-letterman-copy>
    <span class="tag">${escapeHtml(form.kicker)}</span>
    <h2>${escapeHtml(form.title)}</h2>
    <p data-letterman-intro>${escapeHtml(form.intro)}</p>
    ${renderLettermanFormHtml(form)}
  </article>
</div></section>`;
}

export function renderLettermanDeadlineBanner() {
  return `<div class="letterman-deadline-banner" data-letterman-deadline role="status">Deadline: Letterman Jacket Forms and Payments Due By September 8th! <a href="/letterman-jacket.html">Click Here</a> for order form!</div>`;
}

export const LETTERMAN_CMS_PAGE = {
  slug: 'letterman-jacket',
  path: '/letterman-jacket.html',
  title: 'Letterman Jacket Order Form',
  body_html: '',
  nav_order: 99,
  is_home: 0,
  active: 1,
};
