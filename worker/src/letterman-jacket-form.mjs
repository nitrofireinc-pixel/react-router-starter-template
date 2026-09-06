import { buildMultiPageTextPdfBase64 } from './admin-audit-log.mjs';

export const LETTERMAN_FORM_KEY = 'letterman_jacket_form';
export const LETTERMAN_RECIPIENT_KEY = 'letterman_jacket_recipient_user_ids';
export const JACKET_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
export const PAYMENT_METHODS = ['Cash', 'Check'];

export const DEFAULT_LETTERMAN_FORM = {
  kicker: 'Band Boosters',
  heading: 'East Forsyth Band',
  title: 'Letterman Jacket Order Form',
  intro: 'Complete this order form for an East Forsyth Band letterman jacket. Return the form with payment to the Band Boosters.',
  student_section: 'Student Information',
  jacket_section: 'Jacket Information',
  jacket_size_label: 'Jacket Size',
  pricing_s_xl_label: 'Jacket Size S–XL',
  pricing_s_xl: '$52.00',
  pricing_2xl_label: 'Jacket Size 2XL',
  pricing_2xl: '$54.00',
  pricing_3xl_label: 'Jacket Size 3XL',
  pricing_3xl: '$55.00',
  payment_section: 'Payment',
  payment_note: 'Make checks payable to: East Forsyth Band Boosters',
  acknowledgment: 'I have reviewed the jacket size, embroidered name, instrument, and pricing above. I understand that the order will be submitted after the completed form and payment are received.',
  return_heading: 'Return form & payment to',
  return_name: 'East Forsyth Band Boosters',
  deadline: 'September 5th, 2026',
  questions: 'Please speak to a Band Booster Board Member, Mr. Kuropas or Mrs. Murphy.',
  thank_you: 'Thank you for supporting the East Forsyth Band!',
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

export function normalizeLettermanFormCopy(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const next = { ...DEFAULT_LETTERMAN_FORM };
  for (const key of Object.keys(DEFAULT_LETTERMAN_FORM)) {
    if (source[key] == null) continue;
    const max = key === 'acknowledgment' || key === 'intro' || key === 'questions' || key === 'payment_note' ? 800 : 200;
    const value = key === 'acknowledgment' || key === 'intro' || key === 'questions' || key === 'payment_note'
      ? trimMultiline(source[key], max)
      : trimText(source[key], max);
    if (value) next[key] = value;
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
      return { ...DEFAULT_LETTERMAN_FORM };
    }
  }
  return { ...DEFAULT_LETTERMAN_FORM };
}

export function priceForJacketSize(copy = DEFAULT_LETTERMAN_FORM, size = '') {
  const key = String(size || '').trim().toUpperCase();
  if (key === '3XL') return String(copy.pricing_3xl || DEFAULT_LETTERMAN_FORM.pricing_3xl);
  if (key === '2XL') return String(copy.pricing_2xl || DEFAULT_LETTERMAN_FORM.pricing_2xl);
  if (JACKET_SIZES.includes(key)) return String(copy.pricing_s_xl || DEFAULT_LETTERMAN_FORM.pricing_s_xl);
  return '';
}

export function normalizeLettermanPayload(payload = {}, copy = DEFAULT_LETTERMAN_FORM) {
  const student_name = trimText(payload.student_name, 160);
  const grade = trimText(payload.grade, 20);
  const parent_name = trimText(payload.parent_name, 160);
  const phone = trimText(payload.phone, 40);
  const email = trimText(payload.email, 160).toLowerCase();
  const order_date = trimText(payload.order_date || payload.date, 40);
  const embroidered_name = trimText(payload.embroidered_name, 160);
  const second_embroidery = trimText(payload.second_embroidery, 160);
  const jacket_size = JACKET_SIZES.includes(String(payload.jacket_size || '').trim().toUpperCase())
    ? String(payload.jacket_size).trim().toUpperCase()
    : '';
  const payment_method = PAYMENT_METHODS.includes(String(payload.payment_method || '').trim())
    ? String(payload.payment_method).trim()
    : '';
  const amount_enclosed = trimText(payload.amount_enclosed, 40) || priceForJacketSize(copy, jacket_size);
  const parent_signature = trimText(payload.parent_signature, 160);
  const parent_sign_date = trimText(payload.parent_sign_date, 40);
  const student_signature = trimText(payload.student_signature, 160);
  const student_sign_date = trimText(payload.student_sign_date, 40);

  const errors = [];
  if (!student_name) errors.push('Student name is required.');
  if (!grade) errors.push('Grade is required.');
  if (!parent_name) errors.push('Parent/guardian name is required.');
  if (!phone) errors.push('Phone is required.');
  if (!isValidEmail(email)) errors.push('A valid email is required.');
  if (!order_date) errors.push('Date is required.');
  if (!embroidered_name) errors.push('Name to be embroidered is required.');
  if (!jacket_size) errors.push('Jacket size is required.');
  if (!payment_method) errors.push('Payment method is required.');
  if (!amount_enclosed) errors.push('Amount enclosed is required.');
  if (!parent_signature) errors.push('Parent/guardian signature is required.');
  if (!parent_sign_date) errors.push('Parent/guardian signature date is required.');
  if (!student_signature) errors.push('Student signature is required.');
  if (!student_sign_date) errors.push('Student signature date is required.');

  return {
    ok: errors.length === 0,
    errors,
    data: {
      student_name,
      grade,
      parent_name,
      phone,
      email,
      order_date,
      embroidered_name,
      second_embroidery,
      jacket_size,
      payment_method,
      amount_enclosed,
      parent_signature,
      parent_sign_date,
      student_signature,
      student_sign_date,
    },
  };
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
  return [
    form.heading,
    form.title,
    `Submitted: ${submitted} ET`,
    '',
    form.student_section,
    `Student name: ${data.student_name || '—'}`,
    `Grade: ${data.grade || '—'}`,
    `Parent/Guardian: ${data.parent_name || '—'}`,
    `Phone: ${data.phone || '—'}`,
    `Email: ${data.email || '—'}`,
    `Date: ${data.order_date || '—'}`,
    `Name to be embroidered: ${data.embroidered_name || '—'}`,
    `Second embroidery line: ${data.second_embroidery || '—'}`,
    '',
    form.jacket_section,
    `Jacket size: ${data.jacket_size || '—'}`,
    `${form.pricing_s_xl_label}: ${form.pricing_s_xl}`,
    `${form.pricing_2xl_label}: ${form.pricing_2xl}`,
    `${form.pricing_3xl_label}: ${form.pricing_3xl}`,
    '',
    form.payment_section,
    `Payment method: ${data.payment_method || '—'}`,
    `Amount enclosed: ${data.amount_enclosed || '—'}`,
    form.payment_note,
    '',
    'Acknowledgment',
    form.acknowledgment,
    `Parent/Guardian signature: ${data.parent_signature || '—'}  Date: ${data.parent_sign_date || '—'}`,
    `Student signature: ${data.student_signature || '—'}  Date: ${data.student_sign_date || '—'}`,
    '',
    form.return_heading,
    form.return_name,
    `Deadline: ${form.deadline}`,
    form.questions,
    '',
    form.thank_you,
  ];
}

export function buildLettermanPdfBase64(data = {}, options = {}) {
  const form = normalizeLettermanFormCopy(options.copy);
  return buildMultiPageTextPdfBase64(buildLettermanPdfLines(data, options), {
    title: `${form.heading} — ${form.title}`,
  });
}

export function buildLettermanEmail({ data, siteTitle = 'East Forsyth Band', copy = DEFAULT_LETTERMAN_FORM }) {
  const form = normalizeLettermanFormCopy(copy);
  const subject = `Letterman jacket order: ${data.student_name || 'Student'}`;
  const text = [
    `A new letterman jacket order was submitted on the ${siteTitle} website.`,
    '',
    ...buildLettermanPdfLines(data, { copy: form }),
    '',
    'The completed form is attached as a PDF.',
  ].join('\n');
  const html = `<p>A new letterman jacket order was submitted on the ${escapeHtml(siteTitle)} website.</p>
<table style="border-collapse:collapse;width:100%;max-width:560px;font-family:Georgia,serif;font-size:15px;color:#10233c">
  ${emailRow('Student', data.student_name)}
  ${emailRow('Grade', data.grade)}
  ${emailRow('Parent/Guardian', data.parent_name)}
  ${emailRow('Phone', data.phone)}
  ${emailRow('Email', data.email)}
  ${emailRow('Date', data.order_date)}
  ${emailRow('Name to be embroidered', data.embroidered_name)}
  ${emailRow('Second embroidery line', data.second_embroidery || '—')}
  ${emailRow('Jacket size', data.jacket_size)}
  ${emailRow('Payment method', data.payment_method)}
  ${emailRow('Amount enclosed', data.amount_enclosed)}
  ${emailRow('Parent/Guardian signature', `${data.parent_signature || '—'} (${data.parent_sign_date || '—'})`)}
  ${emailRow('Student signature', `${data.student_signature || '—'} (${data.student_sign_date || '—'})`)}
</table>
<p>The completed form is attached as a PDF.</p>`;
  return { subject, text, html };
}

function emailRow(label, value) {
  return `<tr><th align="left" style="padding:8px 10px 8px 0;border-bottom:1px solid #e1e8f1;width:38%;color:#014990">${escapeHtml(label)}</th><td style="padding:8px 0;border-bottom:1px solid #e1e8f1">${escapeHtml(value || '—')}</td></tr>`;
}

export function renderLettermanFormHtml(copy = DEFAULT_LETTERMAN_FORM) {
  const form = normalizeLettermanFormCopy(copy);
  const sizeOptions = JACKET_SIZES.map((size) => (
    `<label class="letterman-choice"><input type="radio" name="jacket_size" value="${escapeHtml(size)}" required> ${escapeHtml(size)}</label>`
  )).join('');
  const payOptions = PAYMENT_METHODS.map((method) => (
    `<label class="letterman-choice"><input type="radio" name="payment_method" value="${escapeHtml(method)}" required> ${escapeHtml(method)}</label>`
  )).join('');
  return `<form class="inkind-form letterman-form form-grid" data-letterman-form novalidate>
  <h3 class="full letterman-section">${escapeHtml(form.student_section)}</h3>
  <label class="full">Student name
    <input name="student_name" required maxlength="160" autocomplete="name">
  </label>
  <label>Grade
    <input name="grade" required maxlength="20" placeholder="9, 10, 11, or 12">
  </label>
  <label>Date
    <input name="order_date" type="date" required>
  </label>
  <label class="full">Parent/Guardian name
    <input name="parent_name" required maxlength="160" autocomplete="name">
  </label>
  <label>Phone
    <input name="phone" type="tel" required maxlength="40" autocomplete="tel">
  </label>
  <label>Email
    <input name="email" type="email" required maxlength="160" autocomplete="email">
  </label>
  <label class="full">Name to be embroidered
    <input name="embroidered_name" required maxlength="160" placeholder="First and last name, first name, or nickname">
  </label>
  <label class="full">Second embroidery line <span class="muted">(optional)</span>
    <input name="second_embroidery" maxlength="160" placeholder="Instrument or section, graduation year">
  </label>
  <h3 class="full letterman-section">${escapeHtml(form.jacket_section)}</h3>
  <fieldset class="full letterman-choices">
    <legend>${escapeHtml(form.jacket_size_label)}</legend>
    <div class="letterman-choice-row">${sizeOptions}</div>
  </fieldset>
  <div class="full letterman-pricing" data-letterman-pricing>
    <div><span>${escapeHtml(form.pricing_s_xl_label)}</span><b data-price-s-xl>${escapeHtml(form.pricing_s_xl)}</b></div>
    <div><span>${escapeHtml(form.pricing_2xl_label)}</span><b data-price-2xl>${escapeHtml(form.pricing_2xl)}</b></div>
    <div><span>${escapeHtml(form.pricing_3xl_label)}</span><b data-price-3xl>${escapeHtml(form.pricing_3xl)}</b></div>
  </div>
  <h3 class="full letterman-section">${escapeHtml(form.payment_section)}</h3>
  <fieldset class="full letterman-choices">
    <legend>Payment method</legend>
    <div class="letterman-choice-row">${payOptions}</div>
  </fieldset>
  <label>Amount enclosed
    <input name="amount_enclosed" required maxlength="40" data-letterman-amount placeholder="$52.00">
  </label>
  <p class="full muted">${escapeHtml(form.payment_note)}</p>
  <p class="full letterman-ack">${escapeHtml(form.acknowledgment)}</p>
  <label>Parent/Guardian signature
    <input name="parent_signature" required maxlength="160" placeholder="Type full name">
  </label>
  <label>Date
    <input name="parent_sign_date" type="date" required>
  </label>
  <label>Student signature
    <input name="student_signature" required maxlength="160" placeholder="Type full name">
  </label>
  <label>Date
    <input name="student_sign_date" type="date" required>
  </label>
  <p class="full inkind-honeypot" hidden><label>Company<input name="company" tabindex="-1" autocomplete="off"></label></p>
  <div class="full inkind-form-actions">
    <button class="btn primary" type="submit">Submit order</button>
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
    <aside class="letterman-return">
      <h3>${escapeHtml(form.return_heading)}</h3>
      <p><b>${escapeHtml(form.return_name)}</b></p>
      <p>Deadline: ${escapeHtml(form.deadline)}</p>
      <p>${escapeHtml(form.questions)}</p>
      <p class="letterman-thanks"><em>${escapeHtml(form.thank_you)}</em></p>
    </aside>
  </article>
</div></section>`;
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
