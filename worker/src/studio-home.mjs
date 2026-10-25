// Site Studio home (plan section 1 / mockup 01-landing). Dev-first.
// Cloudflare Free hard rule: at most 3 D1 statements per load (1 badge row,
// drafts, coming up), each a cheap indexed/limited query; no writes.

export const STUDIO_HOME_TILES = [
  { key: 'pages', icon: '🧩', title: 'Edit a page', copy: 'Drag, drop and type right on the live page.', href: '/admin?tab=pages', feature: true },
  { key: 'themes', icon: '🎨', title: 'Themes', copy: 'Colors, fonts and buttons for the whole site.', href: '/admin?tab=site#studio-theme', admin: true },
  { key: 'calendar', icon: '📅', title: 'Calendar', copy: 'Add rehearsals, games and concerts.', href: '/admin/events-manager' },
  { key: 'sponsors', icon: '🤝', title: 'Sponsors', copy: 'Logos, levels and links.', href: '/admin?tab=sponsors' },
  { key: 'fundraisers', icon: '🎟️', title: 'Fundraisers', copy: 'Cards for current fundraisers.', href: '/admin/fundraiser-cards' },
  { key: 'minutes', icon: '📝', title: 'Meeting minutes', copy: 'Booster meeting minutes by date.', href: '/admin?tab=minutes' },
  { key: 'photos', icon: '🖼️', title: 'Photos', copy: "The band's own photo library.", href: '/admin?tab=photos' },
  { key: 'users', icon: '👥', title: 'Users', copy: 'Who can edit what.', href: '/admin?tab=users', admin: true },
  { key: 'forms', icon: '📋', title: 'Forms', copy: 'Build sign-up forms and read Submitted forms.', href: '/admin/forms-builder' },
];

/** perms: { pages, themes, calendar, sponsors, fundraisers, minutes, photos, users, forms } booleans. */
export function visibleStudioTiles(perms = {}) {
  return STUDIO_HOME_TILES.filter((t) => Boolean(perms[t.key]));
}

const BADGE_SQL = {
  pages: 'SELECT COUNT(*) FROM cms_pages WHERE active = 1',
  calendar: "SELECT COUNT(*) FROM caldev_events WHERE start_date >= ?1 AND start_date <= ?2 AND cancelled_at IS NULL",
  sponsors: 'SELECT COUNT(*) FROM sponsors WHERE active = 1',
  fundraisers: "SELECT COUNT(*) FROM fundraiser_cards WHERE status = 'approved' AND (auto_hide_after_date = 0 OR event_date = '' OR event_date >= ?1)",
  minutes: 'SELECT COUNT(*) FROM booster_meeting_minutes WHERE created_at >= ?3',
  forms: "SELECT COUNT(*) FROM form_submissions WHERE status = 'new'",
  themes: "SELECT value FROM site_content WHERE key = 'studio_theme'",
};

/** One SELECT with a scalar subquery per allowed badge (single D1 statement). */
export function buildBadgeSql(keys) {
  const cols = keys.filter((k) => BADGE_SQL[k]).map((k) => `(${BADGE_SQL[k]}) AS b_${k}`);
  return cols.length ? `SELECT ${cols.join(', ')}` : '';
}

export function nyDate(now = new Date(), addDays = 0) {
  const d = new Date(now.getTime() + addDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function greetingFor(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(now));
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function themeLabel(raw) {
  try {
    const t = JSON.parse(raw || '{}');
    if (!t || !t.active) return 'Default';
    return String(t.style || 'Custom').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 24);
  } catch { return 'Default'; }
}

export function formatBadges(row = {}, keys = []) {
  const n = (k) => Number(row[`b_${k}`] || 0);
  const out = {};
  for (const k of keys) {
    if (!(`b_${k}` in row)) continue;
    if (k === 'pages') out[k] = `${n(k)} pages`;
    else if (k === 'calendar') out[k] = `${n(k)} this week`;
    else if (k === 'sponsors') out[k] = `${n(k)} active`;
    else if (k === 'fundraisers') out[k] = `${n(k)} running`;
    else if (k === 'minutes') { if (n(k)) out[k] = `${n(k)} new`; }
    else if (k === 'forms') { if (n(k)) out[k] = `${n(k)} new sign-up${n(k) === 1 ? '' : 's'}`; }
    else if (k === 'themes') out[k] = themeLabel(row.b_themes);
  }
  return out;
}

/**
 * Loads the home data. canEditSlug(slug) filters drafts. Max 3 D1 statements.
 */
export async function loadStudioHome(env, { perms = {}, canEditSlug = () => false, now = new Date() } = {}) {
  const tiles = visibleStudioTiles(perms);
  const keys = tiles.map((t) => t.key);
  const today = nyDate(now);
  const weekEnd = nyDate(now, 6);
  const since = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const sql = buildBadgeSql(keys);
  const safe = (p, fb) => p.catch((e) => { console.warn('studio_home_query', String(e?.message || e)); return fb; });
  const [row, drafts, upcoming] = await Promise.all([
    sql ? safe(env.DB.prepare(sql).bind(today, weekEnd, since).first(), {}) : Promise.resolve({}),
    perms.pages ? safe(env.DB.prepare(
      `SELECT d.slug, d.updated_at, COALESCE(NULLIF(u.display_name, ''), u.username, '') AS by_name, p.title
       FROM page_drafts d JOIN cms_pages p ON p.slug = d.slug LEFT JOIN users u ON u.id = d.updated_by
       ORDER BY d.updated_at DESC LIMIT 20`).all(), { results: [] }) : Promise.resolve({ results: [] }),
    safe(env.DB.prepare(
      `SELECT id, title, start_date, start_time, all_day FROM caldev_events
       WHERE start_date >= ? AND cancelled_at IS NULL ORDER BY start_date, start_time, id LIMIT 3`).bind(today).all(), { results: [] }),
  ]);
  const draftList = (drafts?.results || [])
    .filter((d) => canEditSlug(String(d.slug || '')))
    .slice(0, 5)
    .map((d) => ({
      slug: d.slug,
      title: String(d.title || d.slug).replace(/\s*\|\s*East Forsyth Band$/i, ''),
      by: d.by_name || '',
      updated_at: d.updated_at,
      href: `/admin/visual/${encodeURIComponent(d.slug)}`,
    }));
  return {
    greeting: greetingFor(now),
    tiles: tiles.map((t) => ({ ...t })),
    badges: formatBadges(row || {}, keys),
    drafts: draftList,
    upcoming: (upcoming?.results || []).map((e) => ({ id: e.id, title: e.title, date: e.start_date, time: Number(e.all_day) ? '' : (e.start_time || '') })),
    queries: (sql ? 1 : 0) + (perms.pages ? 1 : 0) + 1,
  };
}
