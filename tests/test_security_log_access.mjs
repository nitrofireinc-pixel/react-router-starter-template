import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { DB_SCHEMA_VERSION, makeSession, resetDbInitCache, canAccessSecurityLog, canManageSecurityLog, hasPermission } from '../worker/src/worker.mjs';

const mk = (id, role, perms = []) => ({ id, username: `u${id}@test.local`, display_name: `U${id}`, password_hash: 'x', role, permissions: JSON.stringify(perms), active: 1 });
const SUPER = mk(1, 'admin'); const ADMIN = mk(2, 'site_admin');
const LOWER = [mk(3, 'editor', ['all', 'security-log', 'security', 'audit', 'audit-log', 'admin-audit']), mk(4, 'editor'), mk(5, 'viewer', ['all']), mk(6, 'treasurer', ['all']), mk(7, 'Site_Admin ', [])];
const users = new Map([SUPER, ADMIN, ...LOWER].map((u) => [u.id, u]));
function env() {
  return {
    EFBAND_SECRET: 'test-session-secret',
    DB: {
      prepare(sql) { const q = String(sql); return {
        binds: [], bind(...a) { this.binds = a; return this; },
        async first() {
          if (q.includes('FROM site_content WHERE key') && !q.includes('IN (')) return { value: DB_SCHEMA_VERSION };
          if (q.includes('FROM users WHERE id')) return users.get(Number(this.binds[0])) || null;
          if (q.includes('COUNT(')) return { total: 0 };
          return null;
        },
        async all() { return { results: [] }; },
        async run() { return { success: true, meta: {} }; },
      }; },
      async batch() { return []; },
    },
    ASSETS: { async fetch() { return new Response('missing', { status: 404 }); } },
  };
}
const READ = [['GET', '/api/admin/security-log']];
const MANAGE = [
  ['GET', '/api/admin/security-log.pdf'], ['GET', '/api/admin/security-log.txt'],
  ['GET', '/api/admin/security-log.csv'], ['GET', '/api/admin/security-log.json'],
  ['POST', '/api/admin/security-log/export/start'], ['POST', '/api/admin/security-log/export/complete'],
  ['GET', '/api/admin/security-log/verify'], ['POST', '/api/admin/security-log/verify/complete'],
  ['POST', '/api/admin/security-log/genesis'],
];
async function call(e, user, [method, path]) {
  const headers = { 'content-type': 'application/json' };
  if (user) headers.cookie = `efband_session=${await makeSession({ id: user.id, username: user.username }, e)}`;
  const res = await worker.fetch(new Request(`https://efhsband.org${path}`, { method, headers, body: method === 'POST' ? '{}' : undefined }), e, { waitUntil() {} });
  return { status: res.status, body: await res.text() };
}

test('role helpers: permissions can never grant the Security Log', () => {
  assert.equal(canAccessSecurityLog(SUPER), true); assert.equal(canManageSecurityLog(SUPER), true);
  assert.equal(canAccessSecurityLog(ADMIN), true); assert.equal(canManageSecurityLog(ADMIN), false);
  for (const u of LOWER.slice(0, 4)) {
    assert.equal(canAccessSecurityLog(u), false, u.role);
    for (const s of ['security-log', 'security', 'audit', 'audit-log', 'admin-audit']) assert.equal(hasPermission(u, s), false);
  }
});

test('lower roles and anonymous are refused on every Security Log endpoint', async () => {
  for (const ep of [...READ, ...MANAGE]) {
    resetDbInitCache(); const e = env();
    assert.equal((await call(e, null, ep)).status, 401, `anon ${ep}`);
    for (const u of LOWER.slice(0, 4)) {
      const r = await call(e, u, ep);
      assert.equal(r.status, 403, `${u.role} ${JSON.stringify(u.permissions)} ${ep}`);
      assert.doesNotMatch(r.body, /test-session-secret|AUDIT_LOG_KEY|password_hash/);
    }
  }
});

test('Admin is view-only: list allowed, every export/verify/start/genesis is 403', async () => {
  resetDbInitCache();
  const list = await call(env(), ADMIN, READ[0]);
  assert.equal(list.status, 200); assert.match(list.body, /admin_view_only/);
  assert.doesNotMatch(list.body, /test-session-secret|AUDIT_LOG_KEY|password_hash/);
  for (const ep of MANAGE) {
    resetDbInitCache(); const r = await call(env(), ADMIN, ep);
    assert.equal(r.status, 403, `admin ${ep}`); assert.match(r.body, /view_only/);
  }
});

test('Super Admin passes the role gate on every endpoint', async () => {
  for (const ep of [...READ, ...MANAGE]) {
    resetDbInitCache(); const r = await call(env(), SUPER, ep);
    assert.ok(![401, 403].includes(r.status), `super ${ep} got ${r.status} ${r.body.slice(0, 120)}`);
  }
});

test('edit methods are blocked for everyone', async () => {
  for (const u of [SUPER, ADMIN]) for (const m of ['PUT', 'PATCH', 'DELETE']) {
    resetDbInitCache(); const r = await call(env(), u, [m, '/api/admin/security-log']);
    assert.ok(r.status >= 400 && r.status < 500 && r.status !== 404, `${m} ${r.status}`);
  }
});

test('POST /api/admin/security-log/genesis is 403 view_only for Admin and writes nothing', async () => {
  resetDbInitCache();
  const r = await call(env(), ADMIN, ['POST', '/api/admin/security-log/genesis']);
  assert.equal(r.status, 403); assert.match(r.body, /"mode":"view_only"/);
  for (const u of LOWER.slice(0, 4)) { resetDbInitCache(); assert.equal((await call(env(), u, ['POST', '/api/admin/security-log/genesis'])).status, 403); }
});

test('server HTML: Admin never gets export/verify/genesis controls; month/year filled (Eastern)', async () => {
  const { renderSecurityLogPanelHtml } = await import('../worker/src/worker.mjs');
  const src = (await import('node:fs')).readFileSync(new URL('../worker/src/worker.mjs', import.meta.url), 'utf8');
  const tpl = src.slice(src.indexOf('<section id="tab-security-log"'), src.indexOf('</section>', src.indexOf('<section id="tab-security-log"')));
  const now = new Date('2026-11-01T02:30:00Z'); // still Oct 31 in New York
  const a = renderSecurityLogPanelHtml(tpl, ADMIN, now); const s = renderSecurityLogPanelHtml(tpl, SUPER, now);
  for (const bad of ['download-security-log', 'verify-security-log', 'security-log-genesis', 'Start a new log generation', 'Verify integrity', 'Download PDF', 'SL_MANAGE']) assert.ok(!a.includes(bad), bad);
  for (const good of ['download-security-log"', 'download-security-log-csv', 'download-security-log-json', 'verify-security-log', 'security-log-genesis', 'Use <b>Verify integrity</b>']) assert.ok(s.includes(good), good);
  assert.ok(!s.includes('SL_MANAGE') && !s.includes('SL_VIEW') && !a.includes('SL_VIEW'));
  assert.ok(!a.includes('this check')); assert.match(a, /which a Super Admin can detect/);
  assert.match(s, /which this check detects/); assert.ok(!s.includes('a Super Admin can detect'));
  for (const h of [a, s]) {
    assert.match(h, /<option value="10" selected>October<\/option>/);
    assert.match(h, /<option value="2026" selected>2026<\/option>/);
    assert.ok(!h.includes('__SL_'));
    assert.match(h, /refresh-security-log/);
  }
});

test('browser code loads the Security Log list for Admin as well as Super Admin', async () => {
  const js = (await import('node:fs')).readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
  assert.match(js, /if \(name === 'security-log'\) \{\s*if \(!isSuperAdmin\(\) && !isSiteAdminUser\(\)\) return;\s*loadSecurityLog/);
});

test('browser code loads the Security Log list for Admin as well as Super Admin', async () => {
  const js = (await import('node:fs')).readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
  assert.match(js, /if \(name === 'security-log'\) \{\s*if \(!isSuperAdmin\(\) && !isSiteAdminUser\(\)\) return;\s*loadSecurityLog/);
});
