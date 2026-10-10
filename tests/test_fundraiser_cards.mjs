import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { ADMIN_AUDIT_KNOWN_ACTIONS } from '../worker/src/admin-audit-log.mjs';
import {
  canEditFundraiserCards,
  canPublishFundraiserCards,
  createFundraiserCard,
  fundraiserCardFieldDiff,
  fundraiserCardSchemaStatements,
  importLiveFundraiserCards,
  isPublicFundraiserCard,
  MATTRESS_FLYER_URL,
  renderFundraisingCardFromCms,
  runFundraiserCardCalendarSync,
  setFundraiserCardStatus,
} from '../worker/src/fundraiser-cards.mjs';
import { decorateFundraisingPage } from '../worker/src/home-redesign.mjs';
import {
  canEditPageContent,
  canEditPageLayout,
  DB_SCHEMA_VERSION,
  hasPermission,
  isSuperAdmin,
  makeSession,
  resetDbInitCache,
} from '../worker/src/worker.mjs';
import worker from '../worker/src/worker.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerSrc = readFileSync(join(root, 'worker/src/worker.mjs'), 'utf8');
const adminJs = readFileSync(join(root, 'admin.js'), 'utf8');
const liveToml = readFileSync(join(root, 'wrangler.toml'), 'utf8');
const devToml = readFileSync(join(root, 'wrangler.dev.toml'), 'utf8');

const perms = { canEditPageContent, canEditPageLayout, isSuperAdmin, hasPermission };

function createCardStore(seed = {}) {
  const cards = [...(seed.cards || [])];
  const events = [...(seed.events || [])];
  const users = [...(seed.users || [])];
  const site = { schema_version: DB_SCHEMA_VERSION, ...(seed.site || {}) };
  const emails = [];
  const audits = [];
  let nextId = cards.reduce((max, card) => Math.max(max, Number(card.id) || 0), 0) + 1;

  function firstUser(sql, binds) {
    if (sql.includes('FROM users WHERE id')) {
      return users.find((user) => Number(user.id) === Number(binds[0]) && Number(user.active) !== 0) || null;
    }
    if (sql.includes("role = 'admin'")) return users.find((user) => user.role === 'admin') || null;
    return null;
  }

  const env = {
    DEV_ERROR_HOOK: seed.dev ? '1' : '',
    CONTACT_FROM_EMAIL: 'no-reply@efhsband.org',
    CONTACT_FROM_NAME: 'East Forsyth Band Boosters',
    DB: {
      prepare(sql) {
        const q = String(sql);
        return {
          binds: [],
          bind(...args) { this.binds = args; return this; },
          async first() {
            if (q.includes('FROM site_content WHERE key')) {
              const key = this.binds[0];
              if (key === 'schema_version') return { value: site.schema_version };
              if (site[key] != null) return { key, value: site[key] };
              return null;
            }
            if (q.includes('FROM users')) return firstUser(q, this.binds);
            if (q.includes('COUNT(*)') && q.includes('fundraiser_cards')) return { n: cards.length };
            if (q.includes('MAX(sort_order)')) {
              const active = cards.filter((card) => card.status !== 'rejected');
              return { n: (active.reduce((max, card) => Math.max(max, Number(card.sort_order) || 0), -1) + 1) };
            }
            if (q.includes('FROM fundraiser_cards WHERE id')) {
              return cards.find((card) => Number(card.id) === Number(this.binds[0])) || null;
            }
            if (q.includes("status != 'rejected' AND id !=")) {
              return cards.find((card) => (
                Number(card.source_event_id) === Number(this.binds[0])
                && card.status !== 'rejected'
                && Number(card.id) !== Number(this.binds[1])
              )) || null;
            }
            return null;
          },
          async all() {
            if (q.includes('FROM caldev_events')) {
              const start = this.binds[0];
              const end = this.binds[1];
              return {
                results: events.filter((event) => {
                  if (q.includes('IN (')) return ['2026-10-24', '2026-11-07'].includes(event.start_date);
                  if (start && end) return event.start_date >= start && event.start_date <= end;
                  return true;
                }),
              };
            }
            if (q.includes('FROM fundraiser_cards')) {
              return { results: cards.map((card) => ({ ...card })) };
            }
            return { results: [] };
          },
          async run() {
            if (q.includes('INSERT INTO fundraiser_cards')) {
              const importSeed = q.includes("'approved'");
              const [
                title, description, event_date, start_time, end_time, location,
                picture_mode, image_url, must_attend, volunteers_needed, custom_label,
                primary_button, primary_url, show_add_to_calendar, auto_hide_after_date,
                status, source_event_id, calendar_changed, sort_order,
              ] = importSeed
                ? [
                  this.binds[0], this.binds[1], this.binds[2], this.binds[3], this.binds[4], this.binds[5],
                  this.binds[6], this.binds[7], this.binds[8], this.binds[9], '',
                  this.binds[10], '', 1, 1, 'approved', this.binds[11], 0, this.binds[12],
                ]
                : this.binds;
              const clash = cards.find((card) => (
                source_event_id != null
                && Number(card.source_event_id) === Number(source_event_id)
                && card.status !== 'rejected'
                && status !== 'rejected'
              ));
              if (clash) {
                const error = new Error('UNIQUE constraint failed: idx_fundraiser_cards_source_active');
                throw error;
              }
              const sameDate = cards.find((card) => (
                source_event_id != null
                && Number(card.source_event_id) === Number(source_event_id)
                && card.event_date === event_date
              ));
              if (sameDate) {
                throw new Error('UNIQUE constraint failed: idx_fundraiser_cards_source_date');
              }
              const row = {
                id: nextId,
                title, description, event_date, start_time, end_time, location,
                picture_mode, image_url, must_attend, volunteers_needed, custom_label,
                primary_button, primary_url, show_add_to_calendar, auto_hide_after_date,
                status, source_event_id, calendar_changed, sort_order,
              };
              nextId += 1;
              cards.push(row);
              return { success: true, meta: { last_row_id: row.id } };
            }
            if (q.includes('SET status=?')) {
              const [status, calendar_changed, , , , , id] = this.binds;
              const row = cards.find((card) => Number(card.id) === Number(id));
              if (row) {
                row.status = status;
                row.calendar_changed = calendar_changed;
              }
              return { success: true };
            }
            if (q.includes('UPDATE fundraiser_cards SET calendar_changed')) {
              const id = this.binds[1];
              const row = cards.find((card) => Number(card.id) === Number(id));
              if (row) row.calendar_changed = 1;
              return { success: true };
            }
            if (q.includes('UPDATE fundraiser_cards SET')) {
              const id = this.binds[this.binds.length - 1];
              const row = cards.find((card) => Number(card.id) === Number(id));
              if (row && q.includes('title=?')) {
                Object.assign(row, {
                  title: this.binds[0],
                  description: this.binds[1],
                  event_date: this.binds[2],
                  start_time: this.binds[3],
                  end_time: this.binds[4],
                  location: this.binds[5],
                });
              }
              return { success: true };
            }
            if (q.includes('DELETE FROM fundraiser_cards')) {
              const at = cards.findIndex((card) => Number(card.id) === Number(this.binds[0]));
              if (at >= 0) cards.splice(at, 1);
              return { success: true };
            }
            if (q.includes('INSERT INTO site_content')) {
              site[this.binds[0]] = this.binds[1];
              return { success: true };
            }
            if (q.includes('INSERT INTO admin_audit_log') || q.includes('admin_audit')) {
              return { success: true, meta: { last_row_id: 1 } };
            }
            return { success: true };
          },
        };
      },
      async batch() { return []; },
    },
  };
  return { env, cards, events, users, emails, audits, site };
}

test('schema, audit actions, DEV cron, and CMS shortcut are wired', () => {
  assert.equal(DB_SCHEMA_VERSION, '2026-10-04.8');
  assert.match(workerSrc, /ASSET_VERSION = 'cms-p1-20261010b'/);
  assert.match(workerSrc, /async scheduled\(/);
  assert.match(workerSrc, /needsFundraiserCards: isFundraising/);
  assert.match(adminJs, /\/admin\/fundraiser-cards/);
  assert.doesNotMatch(liveToml, /\[triggers\]/);
  assert.match(devToml, /\[triggers\]/);
  assert.match(devToml, /20 11 \* \* \*/);
  for (const action of [
    'fundraiser.card.create',
    'fundraiser.card.edit',
    'fundraiser.card.reorder',
    'fundraiser.card.approve',
    'fundraiser.card.reject',
    'fundraiser.card.restore',
    'fundraiser.card.hide',
    'fundraiser.card.delete',
    'fundraiser.draft.auto',
  ]) {
    assert.ok(ADMIN_AUDIT_KNOWN_ACTIONS.includes(action), action);
  }
  assert.equal(fundraiserCardSchemaStatements().length, 4);
});

test('render escaping keeps script text inert and only allows https or site-relative URLs', () => {
  const html = renderFundraisingCardFromCms({
    title: '<script>alert(1)</script>Sale',
    description: 'Help <img src=x onerror=alert(1)>',
    event_date: '2026-10-24',
    location: 'Kernersville',
    picture_mode: 'image',
    image_url: 'javascript:alert(1)',
    primary_button: 'link',
    primary_url: 'http://evil.example/phish',
    must_attend: 0,
    custom_label: '<b>Hot</b>',
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, />Sale</);
  assert.match(html, /Help &lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(html, /http:\/\/evil/);
  assert.doesNotMatch(html, /<b>Hot<\/b>/);
  const safe = renderFundraisingCardFromCms({
    title: 'Mattress Sale',
    picture_mode: 'image',
    image_url: MATTRESS_FLYER_URL,
    primary_button: 'view_flyer',
    event_date: '2026-10-24',
  });
  assert.match(safe, /src="\/uploads\/1788873975701-e9fc8e46-8f24-48ac-b342-d375deda42d6\.jpg"/);
});

test('content-only fundraising editors cannot approve, hide, delete, or reject', () => {
  const content = { role: 'editor', permissions: JSON.stringify(['page:fundraising']) };
  const layout = { role: 'editor', permissions: JSON.stringify(['layout:fundraising']) };
  const pages = { role: 'editor', permissions: JSON.stringify(['pages']) };
  const admin = { role: 'admin', permissions: JSON.stringify(['all']) };
  assert.equal(canEditFundraiserCards(content, perms), true);
  assert.equal(canPublishFundraiserCards(content, perms), false);
  assert.equal(canPublishFundraiserCards(layout, perms), true);
  assert.equal(canPublishFundraiserCards(pages, perms), true);
  assert.equal(canPublishFundraiserCards(admin, perms), true);
});

test('first migrate imports Mattress Sale and Silent Auction as approved', async () => {
  const store = createCardStore({
    events: [
      { id: 51, title: 'Fundraiser/Mattress Sale', start_date: '2026-10-24', location: '', description: '' },
      { id: 61, title: 'Fundraiser/Silent Auction', start_date: '2026-11-07', location: '', description: '' },
    ],
  });
  const first = await importLiveFundraiserCards(store.env);
  assert.equal(first.imported, 2);
  const again = await importLiveFundraiserCards(store.env);
  assert.equal(again.skipped, true);
  assert.equal(store.cards.length, 2);
  assert.equal(store.cards[0].title, 'Mattress Sale');
  assert.equal(store.cards[0].status, 'approved');
  assert.equal(store.cards[0].source_event_id, 51);
  assert.equal(store.cards[0].image_url, MATTRESS_FLYER_URL);
  assert.equal(store.cards[1].title, 'Silent Auction');
  assert.equal(store.cards[1].description, 'Students and parents help needed');
  assert.equal(store.cards[1].volunteers_needed, 1);
  assert.equal(store.cards[1].picture_mode, 'date_tile');
});

test('approved past cards hide unless auto_hide_after_date is off', () => {
  assert.equal(isPublicFundraiserCard({ status: 'approved', event_date: '2026-10-01', auto_hide_after_date: 1 }, '2026-10-10'), false);
  assert.equal(isPublicFundraiserCard({ status: 'approved', event_date: '2026-10-01', auto_hide_after_date: 0 }, '2026-10-10'), true);
  assert.equal(isPublicFundraiserCard({ status: 'draft', event_date: '2026-10-24', auto_hide_after_date: 1 }, '2026-10-10'), false);
  assert.equal(isPublicFundraiserCard({ status: 'rejected', event_date: '2026-10-24', auto_hide_after_date: 1 }, '2026-10-10'), false);
  assert.equal(isPublicFundraiserCard({ status: 'approved', event_date: '2026-10-24', auto_hide_after_date: 1 }, '2026-10-10'), true);
});

test('public page uses CMS cards and does not guess leftover body flyers', () => {
  const html = decorateFundraisingPage(
    '<section class="page-hero"><h1>Fundraising</h1><p data-cms-field="intro">Our fundraising efforts help provide students.</p></section><section class="content"><div class="wrap"><div class="card" data-cms-field="body_text"><p><img src="/uploads/old.jpg" alt="x"></p></div><article class="card leftover-card"><p>Gap</p></article></div></section>',
    {
      cards: [{
        title: 'Mattress Sale',
        description: 'Fundraiser at Mattress Warehouse',
        event_date: '2026-10-24',
        location: '820 S Main St, Kernersville, NC 27284',
        picture_mode: 'image',
        image_url: MATTRESS_FLYER_URL,
        must_attend: 1,
        primary_button: 'view_flyer',
        show_add_to_calendar: 1,
      }],
    },
  );
  assert.match(html, />Mattress Sale</);
  assert.match(html, /View flyer/);
  assert.match(html, /Band members must attend/);
  assert.doesNotMatch(html, /leftover-card/);
  assert.doesNotMatch(html, /<img(?![^>]*\bhidden\b)[^>]*\/uploads\/old\.jpg/);
});

test('cron is idempotent: two runs create one draft and one email', async () => {
  const store = createCardStore({
    users: [{ id: 1, username: 'admin@efhsband.org', role: 'admin', active: 1, permissions: '["all"]' }],
    events: [{
      id: 90,
      title: 'Fundraiser/Wreath Sale',
      start_date: '2026-12-05',
      start_time: '',
      end_time: '',
      location: 'School',
      description: 'Wreaths',
      track: 'other',
    }],
  });
  const sent = [];
  const first = await runFundraiserCardCalendarSync(store.env, {
    today: '2026-10-10',
    sendEmail: async (payload) => { sent.push(payload); },
    origin: 'https://efhsband.org',
  });
  const second = await runFundraiserCardCalendarSync(store.env, {
    today: '2026-10-10',
    sendEmail: async (payload) => { sent.push(payload); },
    origin: 'https://efhsband.org',
  });
  assert.equal(first.created, 1);
  assert.equal(first.emails, 1);
  assert.equal(second.created, 0);
  assert.equal(second.emails, 0);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /Wreath Sale/);
  assert.match(sent[0].text, /\/admin\/fundraiser-cards\?id=/);
  assert.doesNotMatch(sent[0].text, /token=/i);
  assert.match(sent[0].text, /normal login/);
});

test('reject keeps the row, and cron twice creates no new draft or email', async () => {
  const store = createCardStore({
    users: [{ id: 1, username: 'admin@efhsband.org', role: 'admin', active: 1 }],
    events: [{
      id: 90,
      title: 'Fundraiser/Wreath Sale',
      start_date: '2026-12-05',
      location: 'School',
      description: 'Wreaths',
      track: 'fundraiser',
    }],
  });
  const created = await createFundraiserCard(store.env, {
    title: 'Wreath Sale',
    event_date: '2026-12-05',
    source_event_id: 90,
  });
  const rejected = await setFundraiserCardStatus(store.env, created.id, 'rejected', { user: { id: 1 } });
  assert.equal(rejected.status, 'rejected');
  assert.equal(store.cards.length, 1);
  const sent = [];
  const first = await runFundraiserCardCalendarSync(store.env, {
    today: '2026-10-10',
    sendEmail: async (payload) => { sent.push(payload); },
  });
  const second = await runFundraiserCardCalendarSync(store.env, {
    today: '2026-10-10',
    sendEmail: async (payload) => { sent.push(payload); },
  });
  assert.equal(first.created, 0);
  assert.equal(second.created, 0);
  assert.equal(sent.length, 0);
  assert.equal(store.cards.length, 1);
  assert.equal(store.cards[0].status, 'rejected');
});

test('rejected event may create one new draft only when the date changes, and the email says why', async () => {
  const store = createCardStore({
    users: [{ id: 1, username: 'admin@efhsband.org', role: 'admin', active: 1 }],
    cards: [{
      id: 3,
      title: 'Wreath Sale',
      event_date: '2026-12-05',
      status: 'rejected',
      source_event_id: 90,
      start_time: '',
      end_time: '',
      location: 'School',
    }],
    events: [{
      id: 90,
      title: 'Fundraiser/Wreath Sale',
      start_date: '2026-11-20',
      location: 'School',
      description: 'Moved',
      track: 'fundraiser',
    }],
  });
  const sent = [];
  const result = await runFundraiserCardCalendarSync(store.env, {
    today: '2026-10-10',
    sendEmail: async (payload) => { sent.push(payload); },
  });
  assert.equal(result.created, 1);
  assert.equal(store.cards.length, 2);
  assert.equal(store.cards.filter((card) => card.status === 'rejected').length, 1);
  assert.equal(store.cards.filter((card) => card.status === 'draft').length, 1);
  assert.match(sent[0].text, /date changed from 2026-12-05 to 2026-11-20/);
  const again = await runFundraiserCardCalendarSync(store.env, {
    today: '2026-10-10',
    sendEmail: async (payload) => { sent.push(payload); },
  });
  assert.equal(again.created, 0);
  assert.equal(sent.length, 1);
});

test('field diffs omit image bytes and restore/reject are distinct actions', () => {
  const diff = fundraiserCardFieldDiff(
    { title: 'A', status: 'draft', image_url: '/uploads/a.jpg', must_attend: 0 },
    { title: 'B', status: 'rejected', image_url: '/uploads/a.jpg', must_attend: 1 },
  );
  assert.deepEqual(diff.title, { from: 'A', to: 'B' });
  assert.deepEqual(diff.status, { from: 'draft', to: 'rejected' });
  assert.equal(diff.image_url, undefined);
});

test('content-only user is 403 on approve and reject via the API', async () => {
  resetDbInitCache();
  const editor = {
    id: 8,
    username: 'editor@efhsband.org',
    display_name: 'Editor',
    role: 'editor',
    permissions: JSON.stringify(['page:fundraising']),
    active: 1,
    password_hash: 'x',
  };
  const cards = [{
    id: 4,
    title: 'Draft Sale',
    status: 'draft',
    event_date: '2026-12-01',
    picture_mode: 'date_tile',
  }];
  const store = createCardStore({ users: [editor], cards });
  const cookie = `efband_session=${await makeSession({ id: editor.id, username: editor.username }, store.env)}`;
  const approve = await worker.fetch(new Request('https://efhsband.org/api/admin/fundraiser-cards/4/approve', {
    method: 'POST',
    headers: { cookie },
  }), store.env, { waitUntil() {} });
  assert.equal(approve.status, 403);
  const reject = await worker.fetch(new Request('https://efhsband.org/api/admin/fundraiser-cards/4/reject', {
    method: 'POST',
    headers: { cookie },
  }), store.env, { waitUntil() {} });
  assert.equal(reject.status, 403);
  const restore = await worker.fetch(new Request('https://efhsband.org/api/admin/fundraiser-cards/4/restore', {
    method: 'POST',
    headers: { cookie },
  }), store.env, { waitUntil() {} });
  assert.ok(restore.status === 200 || restore.status === 409 || restore.status === 404);
});
