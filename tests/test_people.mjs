import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkPersonChange, checkLockChange, normalizeGroupFields, planPeopleMigration, mapLegacyRole, serializePerson, canManagePeople, DEFAULT_ROLE_PRESETS } from '../worker/src/people.mjs';

const ALL = ['site', 'pages', 'users', 'events', 'forms', 'mail', 'photos', 'staff', 'boosters'];
const sup = { id: 1, role: 'admin', permissions: '[]' };
const adm = { id: 2, role: 'site_admin', permissions: '[]' };
const ed = { id: 3, role: 'editor', permissions: '["users","events"]' };
const base = (o = {}) => ({ display_name: 'X', role: 'editor', permissions: [], active: 1, can_login: 1, person_group: '', group_role: '', locked: 0, ...o });

test('people: managers', () => {
  assert.ok(canManagePeople(sup) && canManagePeople(adm) && canManagePeople(ed));
  assert.ok(!canManagePeople({ id: 9, role: 'editor', permissions: '["events"]' }));
});

test('people: Super Admin targets and role grants', () => {
  const opts = { activeSuperAdmins: 2, allowedPermissions: ALL };
  assert.equal(checkPersonChange(adm, { id: 1, role: 'admin', permissions: '[]', active: 1 }, base({ role: 'admin', display_name: 'Y' }), opts).ok, false);
  assert.equal(checkPersonChange(adm, null, base({ role: 'admin' }), opts).ok, false);
  assert.equal(checkPersonChange(adm, null, base({ role: 'site_admin' }), opts).ok, true);
  assert.equal(checkPersonChange(ed, null, base({ role: 'site_admin' }), opts).ok, false);
  assert.equal(checkPersonChange(ed, null, base({ permissions: ['users'] }), opts).ok, false);
  assert.equal(checkPersonChange(ed, null, base({ permissions: ['pages'] }), opts).ok, false);
  assert.equal(checkPersonChange(ed, null, base({ permissions: ['events'] }), opts).ok, true);
  assert.equal(checkPersonChange(adm, null, base({ permissions: ['all'] }), opts).ok, false);
});

test('people: no self changes, last Super Admin kept', () => {
  const me = { id: 2, role: 'site_admin', permissions: '[]', active: 1 };
  assert.equal(checkPersonChange(adm, me, base({ role: 'admin' }), { activeSuperAdmins: 2, allowedPermissions: ALL }).ok, false);
  assert.equal(checkPersonChange(adm, me, base({ role: 'site_admin', locked: 1 }), { activeSuperAdmins: 2, allowedPermissions: ALL }).ok, false);
  const r = checkPersonChange(sup, { id: 1, role: 'admin', permissions: '[]', active: 1 }, base({ role: 'editor' }), { activeSuperAdmins: 1, allowedPermissions: ALL });
  assert.equal(r.ok, false);
  assert.equal(r.status, 409);
});

test('people: committee login only by Admin+', () => {
  const opts = { activeSuperAdmins: 2, allowedPermissions: ALL };
  assert.equal(checkPersonChange(ed, null, base({ person_group: 'boosters', group_role: 'committee', can_login: 1 }), opts).ok, false);
  assert.equal(checkPersonChange(adm, null, base({ person_group: 'boosters', group_role: 'committee', can_login: 1 }), opts).ok, true);
});

test('people: lock rules', () => {
  assert.equal(checkLockChange(ed, { id: 5, role: 'editor' }).ok, false);
  assert.equal(checkLockChange(adm, { id: 2, role: 'site_admin' }).ok, false);
  assert.equal(checkLockChange(adm, { id: 1, role: 'admin', active: 1 }, { activeSuperAdmins: 3 }).ok, false);
  assert.equal(checkLockChange(adm, { id: 5, role: 'editor' }).ok, true);
  assert.equal(checkLockChange(sup, { id: 7, role: 'admin', active: 1 }, { activeSuperAdmins: 1 }).ok, false);
});

test('people: group fields', () => {
  assert.equal(normalizeGroupFields({ person_group: 'staff', group_role: 'president' }).ok, false);
  assert.equal(normalizeGroupFields({ person_group: '', group_role: 'staff' }).ok, false);
  assert.deepEqual(normalizeGroupFields({ person_group: 'boosters', group_role: 'treasurer' }).group_role, 'treasurer');
  assert.equal(DEFAULT_ROLE_PRESETS.committee.login_default, 0);
});

test('people: migration plan is exact-name only and flags both-lists', () => {
  const users = [{ id: 10, display_name: 'Ann Lee', username: 'alee', person_group: '' }, { id: 11, display_name: 'Bo Kim', username: 'b1' }, { id: 12, display_name: 'Bo Kim', username: 'b2' }];
  const staff = [{ id: 1, name: 'Ann Lee', role: 'Director', bio: '', photo_url: '', sort_order: 0, active: 1 }, { id: 2, name: 'Cy Dee', role: 'Assistant', active: 1 }, { id: 3, name: 'Bo Kim', role: 'Staff', active: 1 }, { id: 4, name: 'Ann Le', role: 'x', active: 1 }];
  const boosters = [{ id: 5, name: 'Dee Fox', role: '', active: 1 }, { id: 6, name: 'Cy Dee', role: 'President', active: 1 }];
  const plan = planPeopleMigration({ users, staff, boosters });
  const link = plan.actions.find((a) => a.type === 'link');
  assert.equal(link.user_id, 10);
  assert.ok(plan.review.some((r) => r.name === 'Cy Dee'));
  assert.ok(plan.review.some((r) => r.name === 'Bo Kim'));
  assert.ok(plan.actions.some((a) => a.type === 'insert' && a.name === 'Ann Le'));
  assert.equal(mapLegacyRole('boosters', ''), 'committee');
  assert.equal(serializePerson({ id: 1, username: 'profile-abc', role: 'editor' }).username, '');
});

test('people: login checks the password before showing the locked message', () => {
  const src = readFileSync(new URL('../worker/src/worker.mjs', import.meta.url), 'utf8');
  const start = src.indexOf('async function handleLogin(');
  const body = src.slice(start, start + 9000);
  const verify = body.search(/verifyPassword\(/);
  const locked = body.indexOf('LOCKED_LOGIN_HTML', verify > 0 ? 0 : 0);
  assert.ok(verify > 0 && body.indexOf('LOCKED_LOGIN_HTML', verify) > verify, 'locked message comes after password verify');
  assert.ok(locked > 0);
  assert.match(src, /people\.unlock/);
  assert.match(src, /case 'themes':\n\s+return canChangeThemesAndLogo\(user\);/);
});

test('people: Assistant Director role (staff) without Director-only powers', () => {
  const n = normalizeGroupFields({ person_group: 'staff', group_role: 'assistant-director' });
  assert.equal(n.ok !== false, true);
  assert.equal(mapLegacyRole('staff', 'Assistant Director'), 'assistant-director');
  assert.equal(mapLegacyRole('staff', 'Director of Bands'), 'director');
  const ad = DEFAULT_ROLE_PRESETS['assistant-director'];
  assert.ok(ad && ad.login_default === 1);
  assert.ok(!ad.permissions.includes('director'));
  for (const k of ['staff', 'events', 'forms', 'mail', 'photos']) assert.ok(ad.permissions.includes(k));
});

test('classic users screen offers Admin (site_admin) and links to People & Access', () => {
  const w = readFileSync(new URL('../worker/src/worker.mjs', import.meta.url), 'utf8');
  assert.match(w, /<select name="role"><option value="editor">Editor<\/option><option value="site_admin">Admin<\/option>/);
  const a = readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
  assert.match(a, /\/admin\/people\?edit=/);
  assert.match(a, /option\.value === 'site_admin'/);
});

test('classic page-access table stacks on phones and fieldsets cannot widen the card', async () => {
  const { readFile } = await import('node:fs/promises');
  const js = await readFile(new URL('../admin.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../admin-nav.css', import.meta.url), 'utf8');
  assert.match(js, /class="pg-cbl"><input type="checkbox" name="permissions" value="page:/);
  assert.match(js, /pg-cb-t" aria-hidden="true">Change layout</);
  assert.match(css, /\.cms-panel fieldset\{min-width:0/);
  assert.match(css, /@media \(max-width:640px\)\{\s*\.page-grant-table thead\{display:none\}/);
});
