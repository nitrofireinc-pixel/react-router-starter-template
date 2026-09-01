import { buildMultiPageTextPdfBase64 } from './admin-audit-log.mjs';

export const FORMS_ACCESS_KEY = 'forms_access_user_ids';
export const FORMS_RECIPIENT_KEY = 'forms_recipient_user_ids';
export const INKIND_HEAR_ABOUT_OPTIONS = [
  'Student in the Bands or Colorguard',
  'Community Outreach',
  'Previous Sponsor',
  'Other',
];

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY',
  'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV',
  'WI', 'WY',
];

function trimText(value, max = 240) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function trimMultiline(value, max = 4000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export function parseFormsUserIds(value) {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw || '[]');
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const ids = [];
  for (const item of raw) {
    const id = Number(item);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function canAccessFormsPage(user, accessIds = []) {
  if (!user) return false;
  if (String(user.role || '').trim().toLowerCase() === 'admin') return true;
  const id = Number(user.id);
  return Number.isInteger(id) && id > 0 && parseFormsUserIds(accessIds).includes(id);
}

export function normalizeInKindPayload(payload = {}) {
  const business_name = trimText(payload.business_name, 160);
  const first_name = trimText(payload.first_name, 80);
  const last_name = trimText(payload.last_name, 80);
  const email = trimText(payload.email, 160).toLowerCase();
  const phone = trimText(payload.phone, 40);
  const address1 = trimText(payload.address1, 160);
  const address2 = trimText(payload.address2, 160);
  const city = trimText(payload.city, 80);
  const state = trimText(payload.state, 2).toUpperCase();
  const zip = trimText(payload.zip, 16);
  const value = trimText(payload.value, 80);
  const items = trimMultiline(payload.items, 4000);
  const hear_about = INKIND_HEAR_ABOUT_OPTIONS.includes(String(payload.hear_about || '').trim())
    ? String(payload.hear_about).trim()
    : '';
  const hear_about_other = hear_about === 'Other' ? trimText(payload.hear_about_other, 200) : '';
  const details = trimMultiline(payload.details, 4000);
  const logo_names = Array.isArray(payload.logo_names)
    ? payload.logo_names.map((name) => trimText(name, 160)).filter(Boolean).slice(0, 2)
    : [];

  const errors = [];
  if (!business_name) errors.push('Business name is required.');
  if (!first_name || !last_name) errors.push('First and last name are required.');
  if (!isValidEmail(email)) errors.push('A valid email is required.');
  if (!phone) errors.push('Phone is required.');
  if (!address1 || !city || !US_STATES.includes(state) || !zip) errors.push('A complete US address is required.');
  if (!value) errors.push('Value of In-kind donation is required.');
  if (!items) errors.push('In-kind sponsorship items are required.');
  if (hear_about === 'Other' && !hear_about_other) errors.push('Please share how you heard about us.');

  return {
    ok: errors.length === 0,
    errors,
    data: {
      business_name,
      first_name,
      last_name,
      email,
      phone,
      address1,
      address2,
      city,
      state,
      zip,
      value,
      items,
      hear_about,
      hear_about_other,
      details,
      logo_names,
    },
  };
}

export function formatInKindAddress(data = {}) {
  const line2 = String(data.address2 || '').trim();
  const cityLine = [data.city, data.state].filter(Boolean).join(', ') + (data.zip ? ` ${data.zip}` : '');
  return [data.address1, line2, cityLine].filter(Boolean).join('\n');
}

export function buildInKindPdfLines(data = {}, { submittedAt = '' } = {}) {
  const submitted = submittedAt || new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const hear = data.hear_about === 'Other' && data.hear_about_other
    ? `Other — ${data.hear_about_other}`
    : (data.hear_about || '—');
  return [
    `Submitted: ${submitted} ET`,
    '',
    'Business',
    data.business_name || '—',
    '',
    'Contact',
    `${data.first_name || ''} ${data.last_name || ''}`.trim() || '—',
    data.email || '—',
    data.phone || '—',
    '',
    'Address',
    ...formatInKindAddress(data).split('\n'),
    '',
    'Value of In-kind donation',
    data.value || '—',
    '',
    'In-Kind Sponsorship Items',
    data.items || '—',
    '',
    'How did you hear about us?',
    hear,
    '',
    'Additional details',
    data.details || '—',
    '',
    'Logo files',
    (data.logo_names || []).length ? data.logo_names.join(', ') : 'None attached',
  ];
}

export function buildInKindPdfBase64(data = {}, options = {}) {
  return buildMultiPageTextPdfBase64(buildInKindPdfLines(data, options), {
    title: 'East Forsyth Band — In-Kind Donation Form',
  });
}

export function buildInKindEmail({ data, siteTitle = 'East Forsyth Band' }) {
  const name = `${data.first_name} ${data.last_name}`.trim();
  const subject = `In-kind donation: ${data.business_name || name}`;
  const text = [
    `A new in-kind donation form was submitted on the ${siteTitle} website.`,
    '',
    ...buildInKindPdfLines(data),
    '',
    'The completed form is attached as a PDF.',
  ].join('\n');
  const html = `<p>A new in-kind donation form was submitted on the ${escapeHtml(siteTitle)} website.</p>
<table style="border-collapse:collapse;width:100%;max-width:560px;font-family:Georgia,serif;font-size:15px;color:#10233c">
  ${emailRow('Business', data.business_name)}
  ${emailRow('Contact', `${name}<br>${escapeHtml(data.email)}<br>${escapeHtml(data.phone)}`)}
  ${emailRow('Address', formatInKindAddress(data).replace(/\n/g, '<br>'))}
  ${emailRow('Value of In-kind donation', data.value)}
  ${emailRow('In-Kind Sponsorship Items', data.items)}
  ${emailRow('How did you hear about us?', data.hear_about === 'Other' ? `Other — ${data.hear_about_other}` : (data.hear_about || '—'))}
  ${emailRow('Additional details', data.details || '—')}
</table>
<p>The completed form is attached as a PDF.</p>`;
  return { subject, text, html };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emailRow(label, value) {
  return `<tr><th align="left" style="padding:8px 10px 8px 0;border-bottom:1px solid #e1e8f1;width:38%;color:#014990">${escapeHtml(label)}</th><td style="padding:8px 0;border-bottom:1px solid #e1e8f1">${value}</td></tr>`;
}

function stateOptions(selected = 'NC') {
  return US_STATES.map((code) => (
    `<option value="${code}"${code === selected ? ' selected' : ''}>${code}</option>`
  )).join('');
}

export function renderInKindFormHtml() {
  const hearOptions = ['', ...INKIND_HEAR_ABOUT_OPTIONS].map((option) => (
    option
      ? `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`
      : '<option value="">Select one</option>'
  )).join('');
  return `<form class="inkind-form form-grid" data-inkind-form novalidate>
  <label class="full">Business name
    <input name="business_name" required maxlength="160" autocomplete="organization" placeholder="As it should appear on recognition materials">
  </label>
  <label>First name
    <input name="first_name" required maxlength="80" autocomplete="given-name">
  </label>
  <label>Last name
    <input name="last_name" required maxlength="80" autocomplete="family-name">
  </label>
  <label>Email
    <input name="email" type="email" required maxlength="160" autocomplete="email">
  </label>
  <label>Phone
    <input name="phone" type="tel" required maxlength="40" autocomplete="tel">
  </label>
  <label class="full">Address
    <input name="address1" required maxlength="160" autocomplete="address-line1" placeholder="Street address">
  </label>
  <label class="full">Address line 2 <span class="muted">(optional)</span>
    <input name="address2" maxlength="160" autocomplete="address-line2">
  </label>
  <label>City
    <input name="city" required maxlength="80" autocomplete="address-level2">
  </label>
  <label>State
    <select name="state" required autocomplete="address-level1">${stateOptions('NC')}</select>
  </label>
  <label>ZIP
    <input name="zip" required maxlength="16" autocomplete="postal-code">
  </label>
  <label class="full">Value of In-kind donation
    <input name="value" required maxlength="80" placeholder="$250 or estimated retail value">
  </label>
  <label class="full">In-Kind Sponsorship Items
    <textarea name="items" required rows="5" maxlength="4000" placeholder="Please share what you would like to donate. A member of our sponsorship committee will be in touch."></textarea>
  </label>
  <label class="full">How did you hear about us? <span class="muted">(optional)</span>
    <select name="hear_about" data-inkind-hear>${hearOptions}</select>
  </label>
  <label class="full" data-inkind-other hidden>If you marked “Other”, please share how you heard about sponsoring the Band
    <input name="hear_about_other" maxlength="200">
  </label>
  <label class="full">Please share any other details you would like us to know <span class="muted">(optional)</span>
    <textarea name="details" rows="4" maxlength="4000"></textarea>
  </label>
  <label class="full">Logo upload <span class="muted">(optional, up to two images)</span>
    <input name="logos" type="file" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg" multiple>
    <small class="field-hint">PNG or JPG preferred. Files are emailed with the form PDF.</small>
  </label>
  <p class="full inkind-honeypot" hidden><label>Company<input name="company" tabindex="-1" autocomplete="off"></label></p>
  <div class="full inkind-form-actions">
    <button class="btn primary" type="submit">Submit</button>
    <p class="status" data-inkind-status aria-live="polite"></p>
  </div>
</form>`;
}

export function renderInKindPageBody(page = {}) {
  const heading = String(page.title || 'In-Kind Donation').trim() || 'In-Kind Donation';
  return `<section class="page-hero sponsor-hero" data-cms-layout="in-kind"><div class="page-title"><div class="kicker">Support</div><h1>${escapeHtml(heading)}</h1><p>Thank you for offering goods or services to the East Forsyth Band. Complete this form and we will follow up about delivery and recognition.</p></div></section>
<section class="content sponsor-content"><div class="wrap inkind-wrap">
  <article class="card inkind-card">
    <span class="tag">In-kind</span>
    <h2>In-kind donation form</h2>
    <p>Tell us about your business and what you would like to donate. On submit we send a PDF of this form to the Band Boosters committee selected in the CMS.</p>
    ${renderInKindFormHtml()}
  </article>
</div></section>`;
}

export const INKIND_CMS_PAGE = {
  slug: 'in-kind',
  path: '/in-kind.html',
  title: 'In-Kind Donation',
  body_html: '',
  nav_order: 99,
  is_home: 0,
  active: 1,
};
