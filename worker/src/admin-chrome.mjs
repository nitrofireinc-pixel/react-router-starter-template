const VISUAL_EDITOR_NOT_YET_SLUGS = new Set(['home', 'in-kind', 'letterman-jacket']);
const DEFAULT_HIDDEN_TABS = new Set(['ensembles', 'events', 'ledger', 'checkout', 'caldev', 'security-log']);
const PAGE_LABELS = {
  home: 'Home',
  directors: 'Directors & Staff',
  resources: 'Student Resources',
  'become-a-sponsor': 'Become a Sponsor',
};

/** Admin-only cache key for the 14d-1 nav assets; public ASSET_VERSION stays untouched. */
export const ADMIN_NAV_REV = 'nav14d3';
export function adminNavAssetVersion(assetVersion = 'dev') {
  return `${String(assetVersion || 'dev')}-${ADMIN_NAV_REV}`;
}

const SEARCH_ICON = '<svg class="sn-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

export function escapeAdminHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function initials(name) {
  const parts = String(name || '').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '•';
}

/** Phone-only header (<700px): logos, "Site Studio", avatar. Menu/Find live in the bottom bar. */
export function renderAdminChromeBar(options = {}) {
  const v = escapeAdminHtml(options.assetVersion || 'dev');
  const user = options.user || {};
  const name = String(user.display_name || user.username || '');
  return `<div class="admin-chrome-bar sn-top">
<a class="sn-top-brand" href="/admin" aria-label="Site Studio home"><img src="/assets/efhs-admin-mark.png?v=${v}" alt="" width="30" height="30"><img src="/assets/efhs-blue-regiment-mark.png?v=${v}" alt="" width="30" height="30"><b>Site Studio</b></a>
${name ? `<span class="sn-avatar" title="${escapeAdminHtml(name)}" aria-hidden="true">${escapeAdminHtml(initials(name))}</span>` : ''}
<form id="admin-mobile-logout-form" class="admin-chrome-logout" method="post" action="/admin/logout">
<button class="admin-mobile-logout-btn" type="submit">Log Out</button>
</form>
</div>`;
}

export function renderAdminSidebarBackdrop() {
  return '<div class="admin-sidebar-backdrop" data-admin-nav-backdrop hidden></div>';
}

export function renderAdminSidebarClose() {
  return '<button type="button" class="admin-sidebar-close sn-close" data-admin-nav-close aria-label="Close menu"><span aria-hidden="true">×</span><span class="sn-close-text">Close</span></button>';
}

export function isVisualEditorPageSlug(slug) {
  const key = String(slug || '').trim().toLowerCase();
  return Boolean(key) && !VISUAL_EDITOR_NOT_YET_SLUGS.has(key);
}

export function visualEditorHref(slug) {
  return `/admin/visual/${encodeURIComponent(String(slug || '').trim().toLowerCase())}`;
}

export function sidebarPageLabel(page = {}) {
  const title = String(page.title || '').replace(/\s*\|\s*East Forsyth Band$/i, '').trim();
  const slug = String(page.slug || '').trim().toLowerCase();
  return title || PAGE_LABELS[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function pageEditorHref(slug) {
  const key = String(slug || '').trim().toLowerCase();
  if (isVisualEditorPageSlug(key)) return visualEditorHref(key);
  return `/admin?tab=pages&page=${encodeURIComponent(key)}`;
}

function tabHref(tab, extra = '') {
  return `/admin?tab=${encodeURIComponent(tab)}${extra}`;
}

/**
 * Plan 2.22 / mockup 14c: flat sections, short names, at most one level.
 * Every item is permission-filtered on the server; admin-only items carry admin:true.
 */
export function buildAdminNavModel(options = {}) {
  const filtered = typeof options.allow === 'function';
  const allow = filtered ? options.allow : (tab) => !DEFAULT_HIDDEN_TABS.has(tab);
  const pages = Array.isArray(options.pages) ? options.pages : [];
  const draftCount = Number(options.fundraiserDraftCount || 0) || 0;
  const current = options.current?.route
    ? options.current
    : (options.slug
      ? { route: 'visual', slug: options.slug, ...options.current }
      : (options.current || {}));

  const item = (key, label, tab, href, extra = {}) => ({
    key,
    label,
    tab: tab || '',
    href: href || (tab ? tabHref(tab) : ''),
    hidden: extra.hidden ?? !allow(extra.perm || tab || key),
    badge: extra.badge || 0,
    badgeLabel: extra.badgeLabel || '',
    admin: Boolean(extra.admin),
    attrs: extra.attrs || '',
    keywords: extra.keywords || '',
  });

  const pagesAllowed = filtered ? allow('pages') : true;
  const sections = [
    {
      key: 'website',
      icon: '🌐',
      label: 'Website',
      items: [
        item('pages', 'Pages', 'pages', tabHref('pages'), { hidden: !pagesAllowed && !pages.length, keywords: 'edit page website' }),
        item('themes', 'Themes', '', '/admin?tab=site#studio-theme', { perm: 'themes', admin: true, attrs: 'data-nav-href="/admin?tab=site#studio-theme"', keywords: 'colors fonts buttons' }),
      ],
    },
    {
      key: 'calendar',
      icon: '📅',
      label: 'Calendar',
      items: [
        item('events-manager', 'Events', '', '/admin/events-manager', { perm: 'caldev', attrs: 'data-nav-href="/admin/events-manager"', keywords: 'calendar rehearsal game concert' }),
        item('caldev', 'Schedule Board', 'caldev', tabHref('caldev'), { keywords: 'calendar schedule' }),
        item('banners', 'Important banners', 'caldev', tabHref('caldev'), { perm: 'caldev', attrs: 'data-nav-extra="deadline-banners"', keywords: 'deadline banner' }),
      ],
    },
    {
      key: 'money',
      icon: '💵',
      label: 'Money',
      items: [
        item('fundraiser-cards', 'Fundraiser cards', 'fundraiser-cards', '/admin/fundraiser-cards', {
          badge: draftCount,
          badgeLabel: `${draftCount} drafts awaiting approval`,
          attrs: 'data-nav-href="/admin/fundraiser-cards"',
          keywords: 'fundraising',
        }),
        item('ledger', 'Donations ledger', 'ledger', tabHref('ledger'), { keywords: 'donations money' }),
        item('checkout', 'Checkout', 'checkout', tabHref('checkout'), { keywords: 'payments' }),
      ],
    },
    {
      key: 'sponsors',
      icon: '🤝',
      label: 'Sponsors',
      items: [
        item('sponsors', 'Manage sponsors', 'sponsors', tabHref('sponsors'), { keywords: 'logos levels' }),
        item('sponsors-page', 'Sponsors page', '', visualEditorHref('sponsors'), {
          attrs: `data-sponsor-nav="sponsors-page" data-page-slug="sponsors" data-nav-href="${visualEditorHref('sponsors')}"`,
        }),
        item('become-a-sponsor', 'Become a Sponsor', '', visualEditorHref('become-a-sponsor'), {
          attrs: `data-sponsor-nav="become-a-sponsor" data-page-slug="become-a-sponsor" data-nav-href="${visualEditorHref('become-a-sponsor')}"`,
        }),
      ],
    },
    {
      key: 'boosters',
      icon: '🏅',
      label: 'Boosters',
      items: [
        item('booster-members', 'Booster Members', 'booster-members', tabHref('booster-members')),
        item('minutes', 'Meeting Minutes', 'minutes', tabHref('minutes'), { keywords: 'minutes meeting' }),
        item('badge-creator', 'Badge Creator', 'badge-creator', tabHref('badge-creator')),
      ],
    },
    {
      key: 'people',
      icon: '👥',
      label: 'People',
      items: [
        item('staff', 'Directors & Staff', 'staff', tabHref('staff')),
        item('ensembles', 'Ensembles', 'ensembles', tabHref('ensembles')),
      ],
    },
    {
      key: 'photos',
      icon: '🖼️',
      label: 'Photos & Social',
      items: [
        item('photos', 'Photos', 'photos', tabHref('photos')),
        item('social', 'Social Media', 'social', tabHref('social')),
      ],
    },
    {
      key: 'forms',
      icon: '📋',
      label: 'Forms & Mail',
      items: [
        item('forms-builder', 'Forms (sign-ups)', '', '/admin/forms-builder', { perm: 'forms-builder', attrs: 'data-nav-href="/admin/forms-builder"', keywords: 'form builder sign up' }),
        item('forms-subs', 'Submitted forms', '', '/admin/forms-builder#/subs', {
          perm: 'forms-builder',
          badge: Number(options.formsNewCount || 0) || 0,
          badgeLabel: `${Number(options.formsNewCount || 0) || 0} new submissions`,
          attrs: 'data-nav-href="/admin/forms-builder#/subs"',
          keywords: 'responses submissions',
        }),
        item('forms', 'Older forms', 'forms', tabHref('forms')),
        item('mail', 'Staff Email', 'mail', tabHref('mail'), { keywords: 'email' }),
        item('contact', 'Contact Form', 'contact', tabHref('contact')),
      ],
    },
    {
      key: 'admin',
      icon: '🛡️',
      label: 'Admin',
      adminOnly: true,
      items: [
        item('users', 'Users', 'users', tabHref('users'), { admin: true, keywords: 'people permissions' }),
        item('site', 'Site Settings', 'site', tabHref('site'), { admin: true }),
        item('security-log', 'Security Log', 'security-log', tabHref('security-log'), { admin: true }),
      ],
    },
  ];
  for (const section of sections) {
    section.visible = section.items.filter((entry) => !entry.hidden);
    section.hidden = section.visible.length === 0;
    // Website always opens its flyout when Pages is allowed: the page list lives there.
    section.direct = section.visible.length === 1 && !(section.key === 'website' && section.visible[0].key === 'pages');
  }

  const dashboard = item('dashboard', 'Home', 'dashboard', tabHref('dashboard'), { hidden: false });
  const pageIndex = pages.map((page) => {
    const slug = String(page.slug || '').trim().toLowerCase();
    return { key: `page:${slug}`, slug, label: sidebarPageLabel(page), href: pageEditorHref(slug) };
  });
  const all = [dashboard, ...sections.flatMap((section) => section.items)];
  const currentKey = resolveCurrentKey(current, all);
  return {
    dashboard,
    sections,
    groups: sections,
    pages,
    pageIndex,
    currentKey,
    filtered,
    items: all,
  };
}

function resolveCurrentKey(current = {}, items) {
  const route = String(current.route || '');
  const slug = String(current.slug || current.page || '').trim().toLowerCase();
  const tab = String(current.tab || '').trim().toLowerCase();
  if (route === 'fundraiser-cards' || tab === 'fundraiser-cards') return 'fundraiser-cards';
  if (route === 'events-manager') return 'events-manager';
  if (route === 'forms-builder') return current.view === 'subs' ? 'forms-subs' : 'forms-builder';
  if (route === 'visual' && slug) {
    if (slug === 'sponsors') return 'sponsors-page';
    if (slug === 'become-a-sponsor') return 'become-a-sponsor';
    return 'pages';
  }
  if (tab) {
    const match = items.find((child) => child.tab === tab && !child.hidden);
    if (match) return match.key;
  }
  if (route === 'admin' || !route) return 'dashboard';
  return '';
}

function renderNavItem(entry, currentKey, sectionLabel = '', extraClass = '') {
  if (entry.hidden) return '';
  const isCurrent = entry.key === currentKey;
  const tabAttr = entry.tab ? ` data-tab="${escapeAdminHtml(entry.tab)}"` : '';
  const href = entry.href || '#';
  const badge = Number(entry.badge) > 0
    ? `<span class="admin-nav-badge sn-badge" aria-label="${escapeAdminHtml(entry.badgeLabel)}">${Number(entry.badge)}</span>`
    : `<span class="admin-nav-badge sn-badge" data-sn-badge="${escapeAdminHtml(entry.key)}" hidden></span>`;
  const adminPill = entry.admin ? '<span class="sn-admin-pill" aria-label="Admin only">ADMIN</span>' : '';
  const extra = entry.attrs ? ` ${entry.attrs}` : '';
  const currentAttr = isCurrent ? ' aria-current="page" data-nav-current="1"' : '';
  const section = sectionLabel ? ` data-nav-section-label="${escapeAdminHtml(sectionLabel)}"` : '';
  const kw = entry.keywords ? ` data-nav-keywords="${escapeAdminHtml(entry.keywords)}"` : '';
  const adminAttr = entry.admin ? ' data-nav-admin="1"' : '';
  return `<a class="admin-nav-item sn-item${extraClass}${isCurrent ? ' active' : ''}" href="${escapeAdminHtml(href)}" data-nav-item="${escapeAdminHtml(entry.key)}"${tabAttr}${extra}${section}${kw}${adminAttr}${currentAttr}><span class="sn-label">${escapeAdminHtml(entry.label)}</span>${adminPill}${badge}</a>`;
}

function renderSitePagesMount(pageIndex = []) {
  const rows = pageIndex.map((page) => `<li class="sn-page-row"><a class="sn-page-edit" href="${escapeAdminHtml(page.href)}" data-sn-page-edit="${escapeAdminHtml(page.slug)}">${escapeAdminHtml(page.label)}</a></li>`).join('');
  return `<div class="sn-site-pages" data-sn-site-pages>
<p class="sn-sub">Pages</p>
<ul class="sn-page-list" data-sn-pages-list>${rows}</ul>
<p class="sn-pages-loading" data-sn-pages-loading${rows ? ' hidden' : ''}>Loading pages…</p>
<a class="sn-pages-all" href="/admin?tab=pages" data-sn-pages-all>See all / Add page</a>
</div>`;
}

function renderSection(section, currentKey, pageIndex = []) {
  if (section.hidden) return '';
  if (section.direct) {
    // A section with exactly one allowed item becomes a direct link (plan 2.22).
    const only = { ...section.visible[0] };
    return `<div class="sn-section sn-section-direct" data-nav-section="${section.key}">${renderNavItem({ ...only, label: only.label }, currentKey, section.label, ' sn-direct')}</div>`;
  }
  const tag = section.adminOnly ? ' <span class="sn-admin-only">ADMIN ONLY</span>' : '';
  const headId = `sn-h-${section.key}`;
  return `<div class="sn-section" data-nav-section="${section.key}" role="group" aria-labelledby="${headId}">
<h2 class="sn-head admin-menu-label" id="${headId}">${escapeAdminHtml(section.label)}${tag}</h2>
${section.visible.map((entry) => renderNavItem(entry, currentKey, section.label)).join('')}
${section.key === 'website' && section.visible.some((entry) => entry.key === 'pages') ? renderSitePagesMount(pageIndex) : ''}
</div>`;
}

export function listAdminNavTargets(options = {}) {
  const model = buildAdminNavModel(options);
  return model.items
    .filter((entry) => !entry.hidden)
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      href: entry.href,
      tab: entry.tab || '',
      admin: entry.admin,
    }));
}

const RAIL_HOME_ICON = '🏠';
const RAIL_FIND_ICON = '🔎';

function sectionOf(model, key) {
  return model.sections.find((section) => !section.hidden && section.visible.some((entry) => entry.key === key)) || null;
}

function railEntryAttrs(entry) {
  const tab = entry.tab ? ` data-rail-tab="${escapeAdminHtml(entry.tab)}"` : '';
  return ` href="${escapeAdminHtml(entry.href || '#')}" data-rail-item="${escapeAdminHtml(entry.key)}"${tab}`;
}

/** 14d-1 icon rail (>=700px): Home, Find, one icon per allowed section, account. */
export function renderAdminRailHtml(assetVersion = 'dev', options = {}, model = buildAdminNavModel(options)) {
  const v = escapeAdminHtml(String(assetVersion || 'dev'));
  const user = options.user || {};
  const name = String(user.display_name || user.username || '');
  const currentSection = sectionOf(model, model.currentKey);
  const homeCurrent = model.currentKey === 'dashboard';
  const tip = (label) => `<span class="sn-rail-name">${escapeAdminHtml(label)}</span>`;
  const rows = [];
  rows.push(`<li><a class="sn-rail-btn${homeCurrent ? ' sn-rail-current' : ''}"${railEntryAttrs(model.dashboard)} aria-label="Home" data-sn-tip="Home"${homeCurrent ? ' aria-current="page"' : ''}><span class="sn-rail-ico" aria-hidden="true">${RAIL_HOME_ICON}</span>${tip('Home')}</a></li>`);
  rows.push(`<li><button type="button" class="sn-rail-btn" data-sn-launch aria-haspopup="dialog" aria-label="Find a page or tool (Ctrl K)" aria-keyshortcuts="Control+K" data-sn-tip="Find · Ctrl K"><span class="sn-rail-ico" aria-hidden="true">${RAIL_FIND_ICON}</span>${tip('Find')}</button></li>`);
  for (const section of model.sections) {
    if (section.hidden) continue;
    const isCurrent = currentSection === section;
    const cur = isCurrent ? ' sn-rail-current' : '';
    const label = section.adminOnly ? `${section.label} (ADMIN only)` : section.label;
    const lock = section.adminOnly ? '<span class="sn-rail-lock" aria-hidden="true">🔒</span>' : '';
    const dotOn = section.key === 'forms' && Number(options.formsNewCount || 0) > 0;
    const dot = section.key === 'forms' ? `<span class="sn-dot" data-sn-dot="forms"${dotOn ? '' : ' hidden'}></span>` : '';
    const ico = `<span class="sn-rail-ico" aria-hidden="true">${section.icon || '•'}</span>${lock}${dot}`;
    if (section.direct) {
      const only = section.visible[0];
      const onlyCurrent = only.key === model.currentKey;
      rows.push(`<li><a class="sn-rail-btn sn-rail-direct${onlyCurrent ? ' sn-rail-current' : ''}"${railEntryAttrs(only)} data-rail-section="${section.key}" aria-label="${escapeAdminHtml(only.label)}" data-sn-tip="${escapeAdminHtml(only.label)}"${onlyCurrent ? ' aria-current="page"' : ''}>${ico}${tip(only.label)}</a></li>`);
    } else {
      rows.push(`<li><button type="button" class="sn-rail-btn${cur}" data-sn-fly-key="${section.key}" data-rail-section="${section.key}" aria-expanded="false" aria-controls="admin-sidebar" aria-label="${escapeAdminHtml(label)}" data-sn-tip="${escapeAdminHtml(label)}">${ico}${tip(section.label)}</button></li>`);
    }
  }
  const me = name
    ? `<button type="button" class="sn-rail-btn sn-rail-me" data-sn-fly-key="account" aria-expanded="false" aria-controls="admin-sidebar" aria-label="Account: ${escapeAdminHtml(name)}" data-sn-tip="${escapeAdminHtml(name)}"><span class="sn-avatar" aria-hidden="true">${escapeAdminHtml(initials(name))}</span></button>`
    : `<button type="button" class="sn-rail-btn sn-rail-me" data-sn-fly-key="account" aria-expanded="false" aria-controls="admin-sidebar" aria-label="Account" data-sn-tip="Account"><span class="sn-rail-ico" aria-hidden="true">👤</span></button>`;
  return `<nav class="sn-rail" aria-label="Admin" data-sn-rail>
<a class="sn-rail-logo" href="/admin" aria-label="Site Studio home" data-sn-tip="Site Studio"><img src="/assets/efhs-admin-mark.png?v=${v}" alt="" width="40" height="22"><img src="/assets/efhs-blue-regiment-mark.png?v=${v}" alt="" width="26" height="26"></a>
<ul class="sn-rail-list">${rows.join('')}</ul>
${me}
</nav>`;
}

/** Phone (<700px) thumb bar: Home · current section · Find · Menu sheet. */
export function renderAdminBottomBarHtml(options = {}, model = buildAdminNavModel(options)) {
  const homeCurrent = model.currentKey === 'dashboard';
  const visible = model.sections.filter((section) => !section.hidden);
  const section = sectionOf(model, model.currentKey) || visible[0] || null;
  const curSlot = section
    ? `<button type="button" class="sn-bb-btn${homeCurrent ? '' : ' sn-bb-current'}" data-sn-sheet-section="${section.key}" aria-controls="admin-sidebar" aria-label="${escapeAdminHtml(section.label)} menu"><span class="sn-bb-ico" aria-hidden="true">${section.icon || '•'}</span><span class="sn-bb-txt">${escapeAdminHtml(section.label.split(' ')[0])}</span></button>`
    : '';
  return `<nav class="sn-bottom" aria-label="Admin shortcuts">
<a class="sn-bb-btn${homeCurrent ? ' sn-bb-current' : ''}"${railEntryAttrs(model.dashboard)}${homeCurrent ? ' aria-current="page"' : ''}><span class="sn-bb-ico" aria-hidden="true">${RAIL_HOME_ICON}</span><span class="sn-bb-txt">Home</span></a>
${curSlot}
<button type="button" class="sn-bb-btn" data-sn-launch aria-haspopup="dialog"><span class="sn-bb-ico" aria-hidden="true">${RAIL_FIND_ICON}</span><span class="sn-bb-txt">Find</span></button>
<button type="button" class="sn-bb-btn admin-nav-toggle" aria-expanded="false" aria-controls="admin-sidebar"><span class="sn-bb-ico" aria-hidden="true">☰</span><span class="sn-bb-txt admin-nav-toggle-label">Menu</span></button>
</nav>`;
}

export function renderAdminSidebarHtml(assetVersion = 'dev', options = {}) {
  const v = escapeAdminHtml(String(assetVersion || 'dev'));
  const model = buildAdminNavModel(options);
  const user = options.user || {};
  const displayName = escapeAdminHtml(user.display_name || user.username || '');
  const roleLabel = escapeAdminHtml(options.roleLabel || (user.role === 'admin' ? 'Super Admin' : displayName ? 'Editor' : ''));
  const userBlock = displayName
    ? `<div id="current-user" class="admin-user sn-user"><span class="sn-avatar" aria-hidden="true">${escapeAdminHtml(initials(user.display_name || user.username))}</span><div class="admin-user-row"><b>${displayName}</b>${roleLabel ? `<span class="admin-role-pill">${roleLabel}</span>` : ''}</div></div>`
    : '<div id="current-user" class="admin-user sn-user"></div>';
  const pageIndex = model.pageIndex.length
    ? `<div class="sn-page-index" data-sn-pages hidden>${model.pageIndex.map((page) => `<a href="${escapeAdminHtml(page.href)}" data-sn-page="${escapeAdminHtml(page.slug)}">${escapeAdminHtml(page.label)}</a>`).join('')}</div>`
    : '';

  return `${renderAdminRailHtml(assetVersion, options, model)}
<aside id="admin-sidebar" class="sn-side" data-admin-nav-v2 data-admin-nav-flat aria-label="Site Studio menu">
${renderAdminSidebarClose()}
<button type="button" class="sn-fly-esc" data-sn-fly-close aria-label="Close panel">Esc ×</button>
<a class="sn-brand" href="/admin"><span class="sn-logos"><img src="/assets/efhs-admin-mark.png?v=${v}" alt="East Forsyth Band eagle logo" width="34" height="34"><img src="/assets/efhs-blue-regiment-mark.png?v=${v}" alt="East Forsyth Blue Regiment logo" width="34" height="34"></span><span class="sn-brand-text"><b>Site Studio</b><small>EFHS BAND</small></span></a>
<div class="admin-nav-search sn-search"><label class="sn-search-box">${SEARCH_ICON}<span class="sr-only">Find a page or tool</span><input type="search" data-admin-nav-search placeholder="Find a page…" autocomplete="off" aria-keyshortcuts="Control+K /"></label><kbd class="sn-kbd" aria-hidden="true">Ctrl K</kbd></div>
<nav class="admin-menu sn-nav" aria-label="Site Studio navigation">
${renderNavItem(model.dashboard, model.currentKey, '', ' sn-home')}
${model.sections.map((section) => renderSection(section, model.currentKey, model.pageIndex)).join('')}
<p class="sn-empty" data-sn-empty hidden>No matches. Press Enter to search everything.</p>
</nav>
${pageIndex}
<div class="admin-sidebar-footer sn-foot">
${userBlock}
<div class="sn-foot-actions"><button type="button" class="admin-change-password" data-open-password>Change password</button>
<form id="admin-logout-form" class="admin-logout-form" method="post" action="/admin/logout">
<button class="admin-logout" type="submit">Log out</button>
</form></div>
</div>
</aside>
${renderAdminBottomBarHtml(options, model)}`;
}
