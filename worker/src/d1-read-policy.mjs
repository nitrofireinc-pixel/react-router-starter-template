/**
 * Public D1 read policy for this Worker.
 *
 * Sessions: public GET uses first-unconstrained (or the caller's bookmark) so
 * read replicas can serve sequential reads when replication is enabled.
 * Writes, admin, and upload bytes use first-primary so read-your-writes stay
 * on the primary. Sessions are safe when replication is off.
 *
 * Cache: public read models live in isolate memory and the Cache API for a
 * short TTL. A successful non-GET clears them. The HTML response also embeds
 * the same payload so the browser does not repeat those reads.
 *
 * Indexes: PUBLIC_READ_INDEX_SQL is applied once from migrateAndSeedDb when
 * DB_SCHEMA_VERSION changes. Do not run it against production from a laptop.
 */

export const PUBLIC_READ_CACHE_TTL_MS = 60_000;
export const PUBLIC_READ_PENDING_TIMEOUT_MS = 8_000;

export const PUBLIC_READ_INDEX_SQL = Object.freeze([
  'CREATE INDEX IF NOT EXISTS idx_photos_filename ON photos (filename)',
  'CREATE INDEX IF NOT EXISTS idx_photos_gallery_sort ON photos (sort_order, created_at, id)',
  'CREATE INDEX IF NOT EXISTS idx_sponsors_active_sort ON sponsors (active, sort_order, id)',
  'CREATE INDEX IF NOT EXISTS idx_booster_members_active_sort ON booster_members (active, sort_order, id)',
  'CREATE INDEX IF NOT EXISTS idx_staff_members_active_sort ON staff_members (active, sort_order, id)',
  'CREATE INDEX IF NOT EXISTS idx_caldev_events_track_start ON caldev_events (track, start_date, start_time, id)',
  'CREATE INDEX IF NOT EXISTS idx_events_boosters ON events (show_on_boosters, event_year, id)',
]);

export const CMS_PAGE_READ_COLUMNS = 'id, slug, path, title, body_html, nav_order, is_home, active, created_at, updated_at';

const publicReadMemory = new Map();
const publicReadKeys = new Set();
let publicReadGeneration = 0;

// Always purge these on admin writes. Isolates that never fetched a key
// otherwise leave a stale Cache API entry (empty page-blocks hid the hero).
export const PUBLIC_READ_PURGE_KEYS = Object.freeze([
  'fundraiser-cards',
  'page-blocks:fundraising',
  'page-blocks:fundraising:v2',
]);

export function resetPublicReadCache() {
  publicReadGeneration += 1;
  publicReadMemory.clear();
  publicReadKeys.clear();
}

export function d1SessionBookmark(request) {
  const header = String(request?.headers?.get?.('x-d1-bookmark') || '').trim();
  if (header) return header;
  const method = String(request?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return 'first-primary';
  let path = '/';
  try {
    path = new URL(request.url).pathname || '/';
  } catch {
    path = '/';
  }
  if (path.startsWith('/api/admin') || path.startsWith('/admin') || path.startsWith('/uploads/')) {
    return 'first-primary';
  }
  return 'first-unconstrained';
}

export function openD1Session(request, env) {
  const bookmark = d1SessionBookmark(request);
  const db = env?.DB;
  if (!db || typeof db.withSession !== 'function') {
    return { env, session: null, bookmark };
  }
  const session = db.withSession(bookmark);
  const bound = new Proxy(env, {
    get(target, prop, receiver) {
      if (prop === 'DB') return session;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { env: bound, session, bookmark };
}

export function attachD1Bookmark(response, session) {
  if (!response || !session || typeof session.getBookmark !== 'function') return response;
  let bookmark = '';
  try {
    bookmark = session.getBookmark() || '';
  } catch {
    return response;
  }
  if (!bookmark) return response;
  const headers = new Headers(response.headers);
  headers.set('x-d1-bookmark', bookmark);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function cacheRequestFor(key) {
  return new Request(`https://efhsband.internal/d1-public/${encodeURIComponent(key)}`);
}

async function readEdgeCache(key) {
  if (typeof caches === 'undefined' || !caches?.default) return undefined;
  try {
    const hit = await caches.default.match(cacheRequestFor(key));
    if (!hit) return undefined;
    return await hit.json();
  } catch {
    return undefined;
  }
}

async function writeEdgeCache(key, value) {
  if (typeof caches === 'undefined' || !caches?.default) return;
  try {
    await caches.default.put(cacheRequestFor(key), new Response(JSON.stringify(value), {
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${Math.round(PUBLIC_READ_CACHE_TTL_MS / 1000)}`,
      },
    }));
  } catch {
    // Isolate memory still holds the value when the Cache API is unavailable.
  }
}

export function peekPublicRead(key) {
  const existing = publicReadMemory.get(key);
  if (!existing || existing.pending) return { hit: false };
  if (existing.generation !== publicReadGeneration) return { hit: false };
  if (existing.expires <= Date.now()) return { hit: false };
  return { hit: true, value: existing.value };
}

function scheduleEdgeCacheWrite(key, value, ctx) {
  const write = writeEdgeCache(key, value);
  // waitUntil keeps the isolate alive after the response. A bare `void` can be cancelled.
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(write);
  else void write;
}

export async function rememberPublicRead(key, value, ctx) {
  const generation = publicReadGeneration;
  publicReadMemory.set(key, {
    value,
    expires: Date.now() + PUBLIC_READ_CACHE_TTL_MS,
    generation,
  });
  publicReadKeys.add(key);
  // Never await the Cache API on the request path — a stuck put would hang every waiter.
  if (generation === publicReadGeneration) scheduleEdgeCacheWrite(key, value, ctx);
  return value;
}

function evictIfPending(key, pending) {
  const current = publicReadMemory.get(key);
  if (current?.pending === pending) publicReadMemory.delete(key);
}

export function withPublicReadTimeout(promise, timeoutMs = PUBLIC_READ_PENDING_TIMEOUT_MS) {
  const ms = Number(timeoutMs);
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`public-read-timeout:${ms}`)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function loadDirectPublicRead(loader, timeoutMs) {
  return withPublicReadTimeout(Promise.resolve().then(() => loader()), timeoutMs);
}

export async function readCachedPublicValue(key, { timeoutMs = PUBLIC_READ_PENDING_TIMEOUT_MS, ctx } = {}) {
  const existing = publicReadMemory.get(key);
  if (existing?.pending && existing.generation === publicReadGeneration) {
    try {
      return { hit: true, value: await withPublicReadTimeout(existing.pending, timeoutMs) };
    } catch {
      evictIfPending(key, existing.pending);
      return { hit: false };
    }
  }
  const peeked = peekPublicRead(key);
  if (peeked.hit) return peeked;
  const edge = await readEdgeCache(key);
  if (edge === undefined) return { hit: false };
  if (publicReadGeneration !== (existing?.generation ?? publicReadGeneration)) {
    return { hit: false };
  }
  await rememberPublicRead(key, edge, ctx);
  return { hit: true, value: edge };
}

export async function cachedPublicRead(key, loader, { timeoutMs = PUBLIC_READ_PENDING_TIMEOUT_MS, ctx } = {}) {
  const cached = await readCachedPublicValue(key, { timeoutMs, ctx });
  if (cached.hit) return cached.value;
  const generation = publicReadGeneration;
  const existing = publicReadMemory.get(key);
  if (existing?.pending && existing.generation === generation) {
    try {
      return await withPublicReadTimeout(existing.pending, timeoutMs);
    } catch {
      evictIfPending(key, existing.pending);
      return loadDirectPublicRead(loader, timeoutMs);
    }
  }
  let pending;
  pending = (async () => {
    const again = peekPublicRead(key);
    if (again.hit) return again.value;
    const value = await loader();
    if (publicReadGeneration !== generation) return value;
    const current = publicReadMemory.get(key);
    // A timed-out waiter may already have recovered; never overwrite that value.
    if (current && current.pending !== pending) {
      return current.pending ? value : current.value;
    }
    await rememberPublicRead(key, value, ctx);
    return value;
  })().catch((error) => {
    evictIfPending(key, pending);
    throw error;
  });
  publicReadMemory.set(key, { pending, expires: 0, generation });
  try {
    return await withPublicReadTimeout(pending, timeoutMs);
  } catch (error) {
    evictIfPending(key, pending);
    const timedOut = String(error?.message || '').startsWith('public-read-timeout:');
    if (!timedOut) throw error;
    try {
      const value = await loadDirectPublicRead(loader, timeoutMs);
      if (publicReadGeneration === generation) await rememberPublicRead(key, value, ctx);
      return value;
    } catch {
      throw error;
    }
  }
}

export async function invalidatePublicReadCache() {
  publicReadGeneration += 1;
  const keys = new Set([...publicReadKeys, ...PUBLIC_READ_PURGE_KEYS]);
  publicReadMemory.clear();
  publicReadKeys.clear();
  if (typeof caches === 'undefined' || !caches?.default) return;
  await Promise.all([...keys].map(async (key) => {
    try {
      await caches.default.delete(cacheRequestFor(key));
    } catch {
      // A missed delete expires with the Cache-Control max-age.
    }
  }));
}

/**
 * Load several public reads in one D1 batch when more than one cache entry missed.
 * A batch failure falls back to individual statements so one optional query cannot
 * blank the page.
 */
export async function readCachedQueryBatch(env, jobs = [], { ctx } = {}) {
  const values = new Map();
  const missing = [];
  for (const job of jobs) {
    const cached = await readCachedPublicValue(job.key, { ctx });
    if (cached.hit) values.set(job.key, cached.value);
    else missing.push(job);
  }
  if (!missing.length) return values;

  const runOne = async (job) => {
    try {
      const result = await job.statement().all();
      const value = job.parse(result);
      await rememberPublicRead(job.key, value, ctx);
      values.set(job.key, value);
    } catch (error) {
      if (!job.optional) throw error;
      values.set(job.key, job.fallback);
    }
  };

  if (missing.length === 1 || typeof env?.DB?.batch !== 'function') {
    for (const job of missing) await runOne(job);
    return values;
  }

  try {
    const results = await env.DB.batch(missing.map((job) => job.statement()));
    if (!Array.isArray(results) || results.length !== missing.length) {
      throw new Error('D1 batch returned an unexpected result list');
    }
    for (let index = 0; index < missing.length; index += 1) {
      const job = missing[index];
      const value = job.parse(results[index]);
      await rememberPublicRead(job.key, value, ctx);
      values.set(job.key, value);
    }
  } catch {
    for (const job of missing) await runOne(job);
  }
  return values;
}

function publicSquareFromPayload(square) {
  if (!square || typeof square !== 'object') return null;
  const application_id = String(square.application_id || '').trim();
  const location_id = String(square.location_id || '').trim();
  const environment = String(square.environment || 'production').trim() || 'production';
  return {
    application_id,
    location_id,
    environment,
    web_payments: Boolean(square.web_payments || (application_id && location_id)),
  };
}

export function renderPublicReadBootstrap(payload = {}) {
  const body = JSON.stringify({
    site: payload.site || null,
    sponsors: Array.isArray(payload.sponsors) ? payload.sponsors : [],
    photos: Array.isArray(payload.photos) ? payload.photos : [],
    deadlineBanners: Array.isArray(payload.deadlineBanners) ? payload.deadlineBanners : [],
    square: publicSquareFromPayload(payload.square),
  }).replace(/</g, '\\u003c');
  return `<script type="application/json" id="efhs-public-read">${body}</script>`;
}
