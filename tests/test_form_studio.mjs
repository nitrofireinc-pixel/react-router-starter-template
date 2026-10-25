import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import {
  normalizeDefinition, validateDefinition, normalizeSubmission, checkLinks, urlProblem, hostBlocked,
  formStudioTableStatements, renderFormHtml, guardedSend, moneyCents, FS_MAX_RECIPIENTS, SAFE_BROWSING_REFERER,
  convertV1Definition,
} from '../worker/src/form-studio.mjs';

const db = { prepare: () => ({ all: async () => ({ results: [] }), bind() { return this; }, first: async () => null, run: async () => ({}) }) };
const res = (status, body = '', headers = {}) => ({ status, ok: status < 400, headers: new Headers(headers), text: async () => body, json: async () => JSON.parse(body || '{}'), body: null });

const letterman = () => normalizeDefinition({
  title: 'Letterman', fields: [
    { type: 'text', name: 'student', label: 'Student name', required: true },
    { type: 'radio', name: 'size', label: 'Jacket size', required: true, options: ['S', 'M', 'XL'] },
    { type: 'pricing', name: 'prices', label: 'Prices', items: [{ label: 'S-XL', price: '$52.00', values: ['S', 'M', 'XL'] }] },
    { type: 'text', name: 'amount', label: 'Amount enclosed', required: true, price_check: { from: 'size', autofill: true } },
  ],
});

test('migration and runtime schema are additive and never touch audit tables', () => {
  const sql = [...formStudioTableStatements(), readFileSync(new URL('../migrations/2026-10-24.s4-forms.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '')].join('\n');
  assert.doesNotMatch(sql, /\b(DROP|DELETE|RENAME|UPDATE|TRIGGER)\b/i);
  assert.doesNotMatch(sql, /audit/i);
});

test('definition caps staff recipients at 3', () => {
  const d = normalizeDefinition({ title: 'X', fields: [{ type: 'email', name: 'email', label: 'Email' }], email: { to_user_ids: [1, 2, 3, 4] } });
  const v = validateDefinition({ ...d, email: { ...d.email, to_user_ids: [1, 2, 3, 4] } });
  assert.equal(FS_MAX_RECIPIENTS, 3);
  assert.ok(d.email.to_user_ids.length <= 3 || !v.ok);
});

test('submission: required radio, list-only values, price check and autofill', () => {
  const def = letterman();
  assert.equal(normalizeSubmission({ student: 'A' }, def).ok, false);
  assert.match(normalizeSubmission({ student: 'A', size: 'XXL' }, def).errors.join(' '), /pick from the list/);
  const wrong = normalizeSubmission({ student: 'A', size: 'M', amount: '$50' }, def);
  assert.match(wrong.errors.join(' '), /should be \$52\.00/);
  const auto = normalizeSubmission({ student: 'A', size: 'M' }, def);
  assert.equal(auto.ok, true); assert.equal(auto.data.amount.value, '$52.00');
  assert.equal(moneyCents('$1,052.5'), 105250);
});

test('url rules block http, IPs, local hosts and shorteners', () => {
  assert.equal(urlProblem('http://x.org'), 'must start with https');
  assert.equal(urlProblem('https://10.0.0.1/'), 'IP address');
  assert.equal(urlProblem('https://localhost/'), 'local address');
  assert.equal(hostBlocked('www.bit.ly', ['bit.ly']), 'bit.ly');
});

test('Safe Browsing sends the efhsband.org Referer and fails closed on 403 referrer block', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push({ url, init }); if (String(url).includes('safebrowsing')) return res(403, '{"error":{"details":[{"reason":"API_KEY_HTTP_REFERRER_BLOCKED"}]}}'); return res(200); };
  const { results } = await checkLinks({ DB: db, GOOGLE_SAFE_BROWSING: 'k' }, ['https://example.org/a'], { fetchImpl });
  const sb = seen.find((s) => String(s.url).includes('safebrowsing'));
  assert.equal(sb.init.headers.Referer, SAFE_BROWSING_REFERER);
  assert.equal(SAFE_BROWSING_REFERER, 'https://efhsband.org/');
  assert.equal(results[0].status, 'unconfirmed');
  assert.match(results[0].reason, /Safe Browsing unavailable \(403 referrer blocked\)/);
});

test('Safe Browsing 5xx, network error and missing key never fail open', async () => {
  for (const [env, sb] of [[{ GOOGLE_SAFE_BROWSING: 'k' }, () => res(503)], [{ GOOGLE_SAFE_BROWSING: 'k' }, () => { throw new Error('net'); }], [{}, null]]) {
    const fetchImpl = async (url) => (String(url).includes('safebrowsing') ? sb() : res(200));
    const { results } = await checkLinks({ DB: db, ...env }, ['https://example.org/'], { fetchImpl });
    assert.equal(results[0].status, 'unconfirmed');
    assert.ok(results[0].safe_browsing_unavailable);
  }
});

test('link checks follow only one redirect and respect the subrequest budget', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return res(301, '', { location: `https://example.org/${calls}` }); };
  await checkLinks({ DB: db }, ['https://example.org/'], { fetchImpl });
  assert.equal(calls, 2);
  calls = 0;
  const urls = Array.from({ length: 30 }, (_, i) => `https://e${i}.org/`);
  const { results, subrequests } = await checkLinks({ DB: db }, urls, { fetchImpl: async () => { calls += 1; return res(200); }, budget: 5 });
  assert.equal(results.length, 20); assert.ok(subrequests <= 5); assert.ok(calls <= 5);
});

test('rendered form uses real radio inputs and escapes labels', () => {
  const def = letterman(); def.fields[0].label = '<b>x</b>';
  const html = renderFormHtml({ id: 9, title: def.title, definition: def });
  assert.match(html, /type="radio"/); assert.doesNotMatch(html, /<b>x<\/b>/);
});

test('mail is off without a key and never sends', async () => {
  let sent = 0;
  assert.equal(await guardedSend({ DB: db }, { sendMail: async () => { sent += 1; } }, { to: ['a@b.co'] }), 'off');
  assert.equal(sent, 0);
});

const LEGACY_BACKUP = '/workspace/backups/letterman-legacy-definition-20261024.json';
test('legacy Letterman definition converts with option values equal to labels', { skip: !existsSync(LEGACY_BACKUP) }, () => {
  const legacy = JSON.parse(readFileSync(LEGACY_BACKUP, 'utf8'));
  const def = convertV1Definition(JSON.parse(legacy.definition_json || '{}'), [8]);
  for (const f of def.fields) for (const o of f.options || []) assert.equal(o.value, o.label);
});
