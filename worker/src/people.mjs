// People & Access (plan 2.24 / 2.24a). One list for logins, Staff and Boosters.
// Additive only: the old staff_members / booster_members tables are read, never written.
// The security log is only appended to (via the audit helper passed in); never updated or deleted.

export const PEOPLE_GROUPS = ['', 'staff', 'boosters'];
export const GROUP_ROLES = {
  staff: ['director', 'assistant-director', 'staff'],
  boosters: ['president', 'vice-president', 'secretary', 'treasurer', 'committee'],
};
export const GROUP_ROLE_LABELS = {
  director: 'Director', 'assistant-director': 'Assistant Director', staff: 'Staff', president: 'President', 'vice-president': 'Vice President',
  secretary: 'Secretary', treasurer: 'Treasurer', committee: 'Committee',
};
export const SITE_ROLES = ['editor', 'site_admin', 'admin'];
export const SITE_ROLE_LABELS = { editor: 'Editor', site_admin: 'Admin', admin: 'Super Admin' };

/** Approved default ticks (Q68, mockup 16a-role-matrix). Saved per person as an explicit list. */
export const DEFAULT_ROLE_PRESETS = {
  director: { permissions: ['director', 'staff', 'events', 'forms', 'mail', 'photos'], login_default: 1 },
  // Like Director minus the Director-only powers (e.g. deleting sign-ups early via the 'director' tick).
  'assistant-director': { permissions: ['staff', 'events', 'forms', 'mail', 'photos'], login_default: 1 },
  staff: { permissions: ['staff', 'events', 'photos'], login_default: 1 },
  president: { permissions: ['boosters', 'events', 'forms', 'minutes:edit', 'fundraising', 'sponsors', 'mail', 'president'], login_default: 1 },
  'vice-president': { permissions: ['boosters', 'events', 'minutes:edit', 'fundraising', 'mail', 'vice-president'], login_default: 1 },
  secretary: { permissions: ['minutes:edit'], login_default: 1 },
  treasurer: { permissions: ['fundraising', 'sponsors', 'treasurer'], login_default: 1 },
  committee: { permissions: [], login_default: 0 },
  editor: { permissions: [], login_default: 1 },
};
export const LOCKED_LOGIN_MESSAGE = 'This account has been locked. Please contact the administrator.';

const lc = (v) => String(v ?? '').trim().toLowerCase();
export const roleOf = (user) => lc(user?.role) || 'editor';
export const isSuper = (user) => roleOf(user) === 'admin';
export const isSiteAdminRole = (user) => roleOf(user) === 'site_admin';
export function isSiteAdminOrAbove(user) { return isSuper(user) || isSiteAdminRole(user); }

function parseList(value) {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  try { const v = JSON.parse(String(value || '[]')); return Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []; } catch { return []; }
}

export function canManagePeople(actor) {
  if (!actor) return false;
  return isSiteAdminOrAbove(actor) || parseList(actor.permissions).map(lc).some((p) => p === 'users' || p === 'all');
}

/** Normalize and validate group, group role and committee label together. */
export function normalizeGroupFields(input = {}) {
  const group = lc(input.person_group);
  if (!PEOPLE_GROUPS.includes(group)) return { ok: false, detail: 'Group must be None, Staff or Boosters' };
  let role = lc(input.group_role);
  if (!group) {
    if (role) return { ok: false, detail: 'Pick a group before a group role' };
    return { ok: true, person_group: '', group_role: '', committee_label: '' };
  }
  if (role && !GROUP_ROLES[group].includes(role)) {
    return { ok: false, detail: group === 'staff' ? 'Staff roles are Director or Staff' : 'Booster roles are President, Vice President, Secretary, Treasurer or Committee' };
  }
  const label = role === 'committee' ? String(input.committee_label || '').trim().slice(0, 60) : '';
  return { ok: true, person_group: group, group_role: role, committee_label: label };
}

/**
 * Pure rule check for a create (existing = null) or edit.
 * Returns { ok, status, detail }.
 */
export function checkPersonChange(actor, existing, next, { activeSuperAdmins = 0, allowedPermissions = [] } = {}) {
  if (!canManagePeople(actor)) return { ok: false, status: 403, detail: 'Permission required: People & Access' };
  const actorSuper = isSuper(actor);
  const actorAdmin = isSiteAdminOrAbove(actor);
  const self = existing && Number(existing.id) === Number(actor.id);
  const beforeRole = existing ? roleOf(existing) : '';
  const afterRole = lc(next.role) || 'editor';
  if (!SITE_ROLES.includes(afterRole)) return { ok: false, status: 422, detail: 'Unknown site role' };
  if (existing && beforeRole === 'admin' && !actorSuper) return { ok: false, status: 403, detail: 'Only a Super Admin can change a Super Admin' };
  if (afterRole === 'admin' && beforeRole !== 'admin' && !actorSuper) return { ok: false, status: 403, detail: 'Only a Super Admin can make a Super Admin' };
  if (afterRole === 'site_admin' && beforeRole !== 'site_admin' && !actorAdmin) return { ok: false, status: 403, detail: 'Only an Admin or Super Admin can make an Admin' };
  if (self) {
    const rank = { editor: 0, site_admin: 1, admin: 2 };
    if (rank[afterRole] > rank[beforeRole]) return { ok: false, status: 403, detail: 'You cannot raise your own site role' };
    if (!actorSuper) {
      const a = parseList(existing.permissions).map(lc).sort().join(',');
      const b = parseList(next.permissions).map(lc).sort().join(',');
      if (afterRole !== beforeRole || a !== b) return { ok: false, status: 403, detail: 'You cannot change your own role or permissions' };
    }
    if (next.locked) return { ok: false, status: 403, detail: 'You cannot lock yourself' };
  }
  // Last active Super Admin can't be demoted, switched off, or blocked from logging in.
  if (existing && beforeRole === 'admin' && Number(existing.active) === 1) {
    const losing = afterRole !== 'admin' || next.active === 0 || next.can_login === 0 || next.locked;
    if (losing && activeSuperAdmins <= 1) return { ok: false, status: 409, detail: 'This is the last active Super Admin' };
  }
  // Committee login is greyed out until an Admin or Super Admin enables it.
  if (lc(next.group_role) === 'committee' && next.can_login === 1 && !(existing && Number(existing.can_login) === 1) && !actorAdmin) {
    return { ok: false, status: 403, detail: 'Only an Admin or Super Admin can enable a Committee login' };
  }
  const allowed = new Set(allowedPermissions.map(lc));
  for (const item of parseList(next.permissions)) {
    const key = lc(item);
    if (key === 'all') { if (!actorSuper) return { ok: false, status: 403, detail: 'Only a Super Admin can grant all-access' }; continue; }
    if (key.startsWith('page:') || key.startsWith('layout:')) continue;
    if (!allowed.has(key)) return { ok: false, status: 422, detail: `Unknown permission: ${item}` };
    if (key === 'users' && !actorAdmin) return { ok: false, status: 403, detail: 'You cannot grant People & Access' };
    if (!actorAdmin && !parseList(actor.permissions).map(lc).includes(key) && !parseList(actor.permissions).map(lc).includes('all')) {
      return { ok: false, status: 403, detail: 'You can only grant permissions you already have' };
    }
  }
  return { ok: true };
}

/** Lock / unlock rule (2.24a). */
export function checkLockChange(actor, target, { activeSuperAdmins = 0, locking = true } = {}) {
  if (!canManagePeople(actor) || !isSiteAdminOrAbove(actor)) return { ok: false, status: 403, detail: 'Only an Admin or Super Admin can lock or unlock accounts' };
  if (Number(actor.id) === Number(target.id)) return { ok: false, status: 403, detail: 'You cannot lock or unlock yourself' };
  if (isSuper(target) && !isSuper(actor)) return { ok: false, status: 403, detail: 'Admins cannot lock or unlock a Super Admin' };
  if (locking && isSuper(target) && Number(target.active) === 1 && activeSuperAdmins <= 1) return { ok: false, status: 409, detail: 'Cannot lock the last Super Admin' };
  return { ok: true };
}

/** Map an old free-text card role to a group role by keyword. '' = flag for review. */
export function mapLegacyRole(group, text) {
  const t = lc(text);
  if (group === 'staff') {
    if (/assistant|asst|associate/.test(t) && /director/.test(t)) return 'assistant-director';
    if (/director/.test(t)) return 'director';
    return 'staff';
  }
  if (/vice|\bvp\b/.test(t)) return 'vice-president';
  if (/president/.test(t)) return 'president';
  if (/secretary/.test(t)) return 'secretary';
  if (/treasurer/.test(t)) return 'treasurer';
  return 'committee'; // Q74: untitled booster cards migrate as Committee.
}

/**
 * Pure migration plan. users = existing rows, staff/boosters = legacy cards.
 * Exact case-folded name match only; never fuzzy.
 */
export function planPeopleMigration({ users = [], staff = [], boosters = [] }) {
  const norm = (s) => lc(s).replace(/\s+/g, ' ');
  const staffNames = new Map(staff.map((r) => [norm(r.name), r]));
  const boosterNames = new Map(boosters.map((r) => [norm(r.name), r]));
  const actions = [];
  const review = [];
  const already = new Set(users.map((u) => String(u.legacy_source || '')).filter(Boolean));
  const handle = (group, row) => {
    const key = norm(row.name);
    const source = `${group}:${row.id}`;
    if (already.has(source)) return;
    const other = group === 'staff' ? boosterNames.get(key) : staffNames.get(key);
    const matches = users.filter((u) => norm(u.display_name) === key);
    if (other || matches.length > 1) {
      if (group === 'boosters' && other) return; // logged once from the staff side
      review.push({
        name: row.name,
        staff_id: group === 'staff' ? row.id : other?.id ?? null,
        booster_id: group === 'boosters' ? row.id : other?.id ?? null,
        user_id: matches.length === 1 ? matches[0].id : null,
        reason: other ? 'in both old lists' : 'matches 2+ logins',
      });
      return;
    }
    const role = mapLegacyRole(group, row.role);
    const fields = {
      person_group: group, group_role: role,
      committee_label: role === 'committee' ? String(row.role || '').trim().slice(0, 60) : '',
      card_title: String(row.role || '').trim(), card_bio: String(row.bio || ''),
      card_photo_id: String(row.photo_url || ''), card_show: Number(row.active) === 1 ? 1 : 0,
      card_order: Number(row.sort_order || 0), legacy_source: source,
    };
    if (matches.length === 1) {
      const u = matches[0];
      if (u.person_group && u.person_group !== group) { review.push({ name: row.name, staff_id: group === 'staff' ? row.id : null, booster_id: group === 'boosters' ? row.id : null, user_id: u.id, reason: 'login already in the other group' }); return; }
      actions.push({ type: 'link', user_id: u.id, name: row.name, fields });
    } else {
      actions.push({ type: 'insert', name: row.name, fields });
    }
  };
  staff.forEach((r) => handle('staff', r));
  boosters.forEach((r) => handle('boosters', r));
  return { actions, review };
}

export const PERSON_COLUMNS = 'id, username, display_name, role, permissions, active, last_login_at, person_group, group_role, can_login, card_title, card_bio, card_photo_id, card_show, card_order, committee_label, email, legacy_source, locked';

export function serializePerson(row, lock = null) {
  if (!row) return null;
  return {
    id: row.id,
    username: String(row.username || '').startsWith('profile-') ? '' : row.username,
    display_name: row.display_name,
    role: roleOf(row),
    permissions: parseList(row.permissions),
    active: Number(row.active) === 1,
    last_login_at: row.last_login_at || null,
    person_group: row.person_group || '',
    group_role: row.group_role || '',
    can_login: Number(row.can_login ?? 1) === 1,
    card_title: row.card_title || '', card_bio: row.card_bio || '', card_photo_id: row.card_photo_id || '',
    card_show: Number(row.card_show) === 1, card_order: Number(row.card_order || 0),
    committee_label: row.committee_label || '', email: row.email || '', legacy_source: row.legacy_source || '',
    locked: Number(row.locked) === 1 || Boolean(lock?.locked),
    lock_reason: Number(row.locked) === 1 ? (lock?.lock_reason === 'reset_required' ? 'failed sign-ins (needs unlock)' : 'manual') : (lock?.locked ? 'failed sign-ins' : ''),
  };
}
