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
