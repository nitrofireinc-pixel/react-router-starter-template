// Account lockout and password rules (plan 2.11). Additive tables only; the
// users table and the security/audit log are not touched here.
//
// Rules: 3 wrong passwords in 15 minutes locks the account for 30 minutes.
// A second lock within 24 hours stays locked until a Super Admin unlocks it
// (the emailed reset link is a TODO: dev mail provider is 'none').

export const LOCK_MAX_FAILS = 3;
export const LOCK_WINDOW_MS = 15 * 60 * 1000;
export const LOCK_DURATION_MS = 30 * 60 * 1000;
export const RELOCK_WINDOW_MS = 24 * 60 * 60 * 1000;

export function accountLockTableStatements() {
  return [
    `CREATE TABLE IF NOT EXISTS login_attempts (
      key TEXT PRIMARY KEY,
      fails INTEGER NOT NULL DEFAULT 0,
      first_fail_at TEXT,
      locked_at TEXT,
      lock_until TEXT,
      lock_reason TEXT,
      prev_locked_at TEXT,
      last_ip TEXT,
      last_city TEXT,
      last_region TEXT,
      updated_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS unlock_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT,
      expires_at TEXT,
      used_at TEXT,
      requested_ip TEXT
    )`,
  ];
}

/** Password rule: 8+ characters, a letter, a number, a capital and a special character. */
export function checkPasswordRule(password = '') {
  const value = String(password || '');
  const checks = {
    length: value.length >= 8,
    letter: /[A-Za-z]/.test(value),
    number: /[0-9]/.test(value),
    capital: /[A-Z]/.test(value),
    special: /[^A-Za-z0-9]/.test(value),
  };
  const ok = Object.values(checks).every(Boolean);
  return {
    ok,
    checks,
    detail: ok ? '' : 'Password needs 8+ characters, a letter, a number, a capital letter and a special character',
  };
}

const iso = (ms) => new Date(ms).toISOString();
const ms = (value) => (value ? Date.parse(value) : NaN);

/** Pure state transition used by the D1 wrapper and the tests. */
export function nextLockState(row, { now = Date.now(), ip = '', city = '', region = '' } = {}) {
  const rec = { fails: 0, first_fail_at: null, locked_at: null, lock_until: null, lock_reason: null, prev_locked_at: null, ...(row || {}) };
  const windowStart = ms(rec.first_fail_at);
  if (!rec.first_fail_at || !(now - windowStart <= LOCK_WINDOW_MS)) {
    rec.fails = 0;
    rec.first_fail_at = iso(now);
  }
  rec.fails = Number(rec.fails || 0) + 1;
  rec.last_ip = ip; rec.last_city = city; rec.last_region = region; rec.updated_at = iso(now);
  if (rec.fails >= LOCK_MAX_FAILS) {
    const lastLock = ms(rec.locked_at) || ms(rec.prev_locked_at);
    const repeat = Number.isFinite(lastLock) && now - lastLock <= RELOCK_WINDOW_MS;
    rec.prev_locked_at = rec.locked_at || rec.prev_locked_at;
    rec.locked_at = iso(now);
    rec.lock_until = repeat ? null : iso(now + LOCK_DURATION_MS);
    rec.lock_reason = repeat ? 'reset_required' : 'failed_signins';
    rec.fails = 0;
    rec.first_fail_at = null;
  }
  return rec;
}

export function lockStatus(row, now = Date.now()) {
  if (!row?.locked_at) return { locked: false };
  if (row.lock_until == null || row.lock_until === '') {
    return { locked: true, reset_required: true, locked_at: row.locked_at, lock_until: null, last_ip: row.last_ip || '' };
  }
  if (now < ms(row.lock_until)) {
    return { locked: true, reset_required: false, locked_at: row.locked_at, lock_until: row.lock_until, last_ip: row.last_ip || '' };
  }
  return { locked: false, previously_locked_at: row.locked_at };
}

let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.batch(accountLockTableStatements().map((sql) => env.DB.prepare(sql)));
  ready = true;
}

const keyFor = (userId) => `u:${Number(userId)}`;

export async function getAccountLock(env, userId) {
  try {
    await ensure(env);
    return await env.DB.prepare('SELECT * FROM login_attempts WHERE key = ?').bind(keyFor(userId)).first();
  } catch { return null; }
}

export async function recordAccountFailure(env, userId, info = {}) {
  await ensure(env);
  const row = await getAccountLock(env, userId);
  // A finished 30-minute lock keeps its timestamp so a repeat lock inside 24h is caught.
  const next = nextLockState(row, info);
  await env.DB.prepare(
    `INSERT INTO login_attempts (key, fails, first_fail_at, locked_at, lock_until, lock_reason, prev_locked_at, last_ip, last_city, last_region, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET fails = excluded.fails, first_fail_at = excluded.first_fail_at, locked_at = excluded.locked_at,
       lock_until = excluded.lock_until, lock_reason = excluded.lock_reason, prev_locked_at = excluded.prev_locked_at,
       last_ip = excluded.last_ip, last_city = excluded.last_city, last_region = excluded.last_region, updated_at = excluded.updated_at`,
  ).bind(keyFor(userId), next.fails, next.first_fail_at, next.locked_at, next.lock_until, next.lock_reason, next.prev_locked_at,
    next.last_ip || '', next.last_city || '', next.last_region || '', next.updated_at).run();
  const status = lockStatus(next, info.now || Date.now());
  if (status.locked && next.locked_at === next.updated_at) {
    // TODO(mail): email Trevor and the user about the lock. Dev mail provider
    // is 'none', so this is a deliberate no-op until cutover.
  }
  return status;
}

export async function clearAccountFailures(env, userId) {
  try {
    await ensure(env);
    await env.DB.prepare("UPDATE login_attempts SET fails = 0, first_fail_at = NULL, updated_at = ? WHERE key = ?")
      .bind(iso(Date.now()), keyFor(userId)).run();
  } catch { /* best effort */ }
}

/** Super Admin unlock: clears the lock but keeps prev_locked_at history. */
export async function unlockAccount(env, userId) {
  await ensure(env);
  await env.DB.prepare(
    "UPDATE login_attempts SET fails = 0, first_fail_at = NULL, prev_locked_at = locked_at, locked_at = NULL, lock_until = NULL, lock_reason = NULL, updated_at = ? WHERE key = ?",
  ).bind(iso(Date.now()), keyFor(userId)).run();
}

export async function listAccountLocks(env) {
  try {
    await ensure(env);
    const rows = await env.DB.prepare("SELECT * FROM login_attempts WHERE key LIKE 'u:%'").all();
    const now = Date.now();
    const out = {};
    for (const row of rows.results || []) out[row.key.slice(2)] = lockStatus(row, now);
    return out;
  } catch { return {}; }
}
