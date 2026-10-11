const VISUAL_EDITOR_NOT_YET_SLUGS = new Set(['home', 'in-kind', 'letterman-jacket']);
const DEFAULT_HIDDEN_TABS = new Set(['ensembles', 'events', 'ledger', 'checkout', 'caldev', 'security-log']);
const PAGE_LABELS = {
  home: 'Home',
  directors: 'Directors & Staff',
  resources: 'Student Resources',
  'become-a-sponsor': 'Become a Sponsor',
};

export function renderAdminChromeBar() {
  return `<div class="admin-chrome-bar">
<button type="button" class="admin-nav-toggle" aria-expanded="false" aria-controls="admin-sidebar">
<span class="admin-nav-toggle-icon" aria-hidden="true"><span></span><span></span><span></span></span>
<span class="admin-nav-toggle-label">Menu</span>
</button>
<form id="admin-mobile-logout-form" class="admin-chrome-logout" method="post" action="/admin/logout">
<button class="admin-mobile-logout-btn" type="submit">Log Out</button>
</form>
</div>`;
}

export function renderAdminSidebarBackdrop() {
  return '<div class="admin-sidebar-backdrop" data-admin-nav-backdrop hidden></div>';
}

export function renderAdminSidebarClose() {
  return '<button type="button" class="admin-sidebar-close" data-admin-nav-close aria-label="Close menu"><span aria-hidden="true">×</span></button>';
}

export function escapeAdminHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
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

function hideFlag(tab, allow, filtered) {
  if (filtered) return allow(tab) ? '' : ' hidden';
  return DEFAULT_HIDDEN_TABS.has(tab) ? ' hidden' : '';
}

function isHiddenFlag(flag) {
  return String(flag || '').includes('hidden');
}

function tabHref(tab, extra = '') {
  return `/admin?tab=${encodeURIComponent(tab)}${extra}`;
}

export function buildAdminNavModel(options = {}) {
  const filtered = typeof options.allow === 'function';
  const allow = filtered ? options.allow : () => true;
  const hide = (tab) => hideFlag(tab, allow, filtered);
  const pages = Array.isArray(options.pages) ? options.pages : [];
  const draftCount = Number(options.fundraiserDraftCount || 0) || 0;
  const current = options.current || {};
  const showPageSettings = filtered ? allow('page-settings') : false;

  const pageItems = pages.map((page) => {
    const slug = String(page.slug || '').trim().toLowerCase();
    const href = pageEditorHref(slug);
    return {
      kind: 'page',
      key: `page:${slug}`,
      label: sidebarPageLabel(page),
      slug,
      href,
      tab: isVisualEditorPageSlug(slug) ? '' : 'pages',
      hidden: false,
      attrs: `data-page-slug="${escapeAdminHtml(slug)}" data-page-nav="${escapeAdminHtml(slug)}" data-nav-href="${escapeAdminHtml(href)}"`,
    };
  });
  if (showPageSettings) {
    pageItems.push({
      kind: 'page-settings',
      key: 'page-settings',
      label: '⚙ Page settings',
      href: '/admin?tab=pages&page=fundraising',
      tab: 'pages',
      hidden: false,
      attrs: 'data-page-settings-link="fundraising" data-page-settings="fundraising" data-nav-href="/admin?tab=pages&page=fundraising"',
    });
  }

  const item = (key, label, tab, href, extra = {}) => ({
    kind: extra.kind || 'tab',
    key,
    label,
    tab: tab || '',
    href: href || (tab ? tabHref(tab) : ''),
    hidden: extra.hidden ?? isHiddenFlag(hide(tab || key)),
    badge: extra.badge || 0,
    attrs: extra.attrs || '',
  });

  const calendarChildren = [
    item(
      allow('caldev') || !filtered ? 'caldev' : 'events',
      'Events & Schedule Board',
      allow('caldev') || (!filtered && !DEFAULT_HIDDEN_TABS.has('caldev')) ? 'caldev' : 'events',
      allow('caldev') || !filtered ? tabHref('caldev') : tabHref('events'),
      { hidden: isHiddenFlag(hide('caldev')) && isHiddenFlag(hide('events')) },
    ),
    item('banners', 'Important banners', 'caldev', tabHref('caldev'), {
      hidden: isHiddenFlag(hide('caldev')),
      attrs: 'data-nav-extra="deadline-banners"',
    }),
  ];

  const fundraisingChildren = [
    item('fundraiser-cards', 'Fundraiser cards', 'fundraiser-cards', '/admin/fundraiser-cards', {
      hidden: filtered ? !allow('fundraiser-cards') : false,
      badge: draftCount,
      attrs: 'data-nav-href="/admin/fundraiser-cards"',
    }),
    item('ledger', 'Donations ledger', 'ledger', tabHref('ledger')),
    item('checkout', 'Checkout', 'checkout', tabHref('checkout')),
  ];

  const sponsorChildren = [
    item('sponsors', 'Manage sponsors', 'sponsors', tabHref('sponsors')),
    item('sponsors-page', 'Sponsors page', '', visualEditorHref('sponsors'), {
      hidden: isHiddenFlag(hide('sponsors-page')),
      attrs: `data-sponsor-nav="sponsors-page" data-page-slug="sponsors" data-nav-href="${visualEditorHref('sponsors')}"`,
    }),
    item('become-a-sponsor', 'Become a Sponsor', '', visualEditorHref('become-a-sponsor'), {
      hidden: isHiddenFlag(hide('become-a-sponsor')),
      attrs: `data-sponsor-nav="become-a-sponsor" data-page-slug="become-a-sponsor" data-nav-href="${visualEditorHref('become-a-sponsor')}"`,
    }),
  ];

  const boosterChildren = [
    item('booster-members', 'Booster Members', 'booster-members', tabHref('booster-members')),
    item('minutes', 'Meeting Minutes', 'minutes', tabHref('minutes')),
    item('badge-creator', 'Badge Creator', 'badge-creator', tabHref('badge-creator')),
  ];

  const peopleChildren = [
    item('staff', 'Directors & Staff', 'staff', tabHref('staff')),
    item('ensembles', 'Ensembles', 'ensembles', tabHref('ensembles')),
  ];

  const photoChildren = [
    item('photos', 'Photos', 'photos', tabHref('photos')),
    item('social', 'Social Media', 'social', tabHref('social')),
  ];

  const messageChildren = [
    item('mail', 'Staff Email', 'mail', tabHref('mail')),
    item('contact', 'Contact Form', 'contact', tabHref('contact')),
    item('forms', 'Forms', 'forms', tabHref('forms')),
  ];

  const adminChildren = [
    item('users', 'Users', 'users', tabHref('users')),
    item('site', 'Site Settings', 'site', tabHref('site')),
    item('security-log', 'Security Log', 'security-log', tabHref('security-log')),
  ];

  const groupHidden = (children) => children.every((child) => child.hidden);

  const groups = [
    {
      key: 'pages',
      label: 'Pages',
      section: 'website',
      hidden: !pageItems.length,
      children: pageItems,
      attrs: 'data-pages-group',
    },
    {
      key: 'calendar',
      label: 'Calendar',
      section: 'content',
      hidden: groupHidden(calendarChildren),
      children: calendarChildren,
    },
    {
      key: 'fundraising',
      label: 'Fundraising',
      section: 'content',
      hidden: groupHidden(fundraisingChildren),
      children: fundraisingChildren,
    },
    {
      key: 'sponsors',
      label: 'Sponsors',
      section: 'content',
      hidden: groupHidden(sponsorChildren),
      children: sponsorChildren,
      attrs: `data-sponsors-menu${groupHidden(sponsorChildren) ? ' hidden' : ''}`,
      toggleAttrs: 'data-sponsors-toggle',
      subAttrs: 'data-sponsors-sub',
    },
    {
      key: 'boosters',
      label: 'Band Boosters',
      section: 'content',
      hidden: groupHidden(boosterChildren),
      children: boosterChildren,
      attrs: `data-boosters-menu${groupHidden(boosterChildren) ? ' hidden' : ''}`,
      toggleAttrs: 'data-boosters-toggle',
      subAttrs: 'data-boosters-sub',
    },
    {
      key: 'people',
      label: 'People',
      section: 'content',
      hidden: groupHidden(peopleChildren),
      children: peopleChildren,
    },
    {
      key: 'photos',
      label: 'Photos & Social',
      section: 'content',
      hidden: groupHidden(photoChildren),
      children: photoChildren,
    },
    {
      key: 'messages',
      label: 'Messages & Forms',
      section: 'content',
      hidden: groupHidden(messageChildren),
      children: messageChildren,
    },
    {
      key: 'admin',
      label: 'Admin',
      section: 'admin',
      hidden: groupHidden(adminChildren),
      children: adminChildren,
    },
  ];

  const dashboard = item('dashboard', 'Dashboard', 'dashboard', tabHref('dashboard'), {
    hidden: isHiddenFlag(hide('dashboard')),
  });

  const currentKey = resolveCurrentKey(current, groups, dashboard);
  return {
    dashboard,
    groups,
    pages,
    showPageSettings,
    currentKey,
    hide,
    filtered,
    items: [dashboard, ...groups.flatMap((group) => group.children)],
  };
}

function resolveCurrentKey(current = {}, groups, dashboard) {
  const route = String(current.route || '');
  const slug = String(current.slug || current.page || '').trim().toLowerCase();
  const tab = String(current.tab || '').trim().toLowerCase();
  if (route === 'fundraiser-cards' || tab === 'fundraiser-cards') return 'fundraiser-cards';
  if (route === 'visual' && slug) return `page:${slug}`;
  if (tab === 'pages' && slug === 'fundraising') return 'page-settings';
  if (tab) {
    const match = groups.flatMap((group) => group.children).find((child) => child.tab === tab);
    if (match) return match.key;
    if (tab === dashboard.tab) return dashboard.key;
  }
  if (route === 'admin' || !route) return dashboard.key;
  return '';
}

function renderNavItem(entry, currentKey) {
  const hidden = entry.hidden ? ' hidden' : '';
  const active = entry.key === currentKey ? ' active' : '';
  const tabAttr = entry.tab ? ` data-tab="${escapeAdminHtml(entry.tab)}"` : '';
  const href = entry.href || '#';
  const badge = Number(entry.badge) > 0
    ? `<span class="admin-nav-badge" aria-label="${Number(entry.badge)} drafts awaiting approval">${Number(entry.badge)}</span>`
    : '';
  const currentAttr = entry.key === currentKey ? ' data-nav-current="1"' : '';
  const extra = entry.attrs ? ` ${entry.attrs}` : '';
  return `<a class="admin-nav-item${active}" href="${escapeAdminHtml(href)}" data-nav-item="${escapeAdminHtml(entry.key)}"${tabAttr}${hidden}${extra}${currentAttr}>${escapeAdminHtml(entry.label)}${badge}</a>`;
}

function renderGroup(group, currentKey) {
  const hidden = group.hidden ? ' hidden' : '';
  const currentInGroup = group.children.some((child) => child.key === currentKey && !child.hidden);
  const expanded = currentInGroup ? 'true' : 'false';
  const subHidden = currentInGroup ? '' : ' hidden';
  const items = group.children.map((child) => renderNavItem(child, currentKey)).join('');
  const extra = group.key === 'pages'
    ? `<p class="admin-menu-label" data-page-shortcuts-label${group.children.some((child) => child.kind === 'page') ? '' : ' hidden'}>Pages</p><div id="admin-page-shortcuts" class="admin-page-shortcuts">${
      group.children.filter((child) => child.kind === 'page').map((child) => (
        `<div class="admin-page-row"><a class="admin-page-edit" href="${escapeAdminHtml(child.href)}" data-page-slug="${escapeAdminHtml(child.slug)}" data-page-nav="${escapeAdminHtml(child.slug)}" data-nav-href="${escapeAdminHtml(child.href)}">${escapeAdminHtml(child.label)}</a></div>`
      )).join('')
    }</div>${
      group.children.filter((child) => child.kind === 'page-settings').map((child) => (
        `<div class="admin-menu-group" data-page-settings-menu><button type="button" class="admin-menu-parent admin-nav-item${child.key === currentKey ? ' active' : ''}" data-page-settings-toggle aria-expanded="false">⚙ Page settings</button><div class="admin-menu-sub" data-page-settings-sub hidden><a class="admin-nav-item${child.key === currentKey ? ' active' : ''}" href="${escapeAdminHtml(child.href)}" data-page-settings-link="fundraising" data-page-settings="fundraising" data-nav-href="${escapeAdminHtml(child.href)}" data-nav-item="page-settings-fundraising">Fundraising</a></div></div>`
      )).join('')
    }`
    : items;
  return `<div class="admin-menu-group" data-nav-group="${group.key}" ${group.attrs || ''}${hidden}>
<button type="button" class="admin-menu-parent" data-nav-group-toggle="${group.key}" ${group.toggleAttrs || ''} aria-expanded="${expanded}">${escapeAdminHtml(group.label)}</button>
<div class="admin-menu-sub" data-nav-group-sub="${group.key}" ${group.subAttrs || ''}${subHidden}>${extra}</div>
</div>`;
}

export function listAdminNavTargets(options = {}) {
  const model = buildAdminNavModel(options);
  return [model.dashboard, ...model.groups.flatMap((group) => group.children)]
    .filter((item) => !item.hidden)
    .map((item) => ({
      key: item.key,
      label: item.label,
      href: item.href,
      tab: item.tab || '',
    }));
}

export function renderAdminSidebarHtml(assetVersion = 'dev', options = {}) {
  const v = String(assetVersion || 'dev');
  const model = buildAdminNavModel(options);
  const user = options.user || {};
  const displayName = escapeAdminHtml(user.display_name || user.username || '');
  const roleLabel = escapeAdminHtml(options.roleLabel || (user.role === 'admin' ? 'Super Admin' : displayName ? 'Editor' : ''));
  const websiteGroups = model.groups.filter((group) => group.section === 'website');
  const contentGroups = model.groups.filter((group) => group.section === 'content');
  const adminGroups = model.groups.filter((group) => group.section === 'admin');
  const websiteHidden = websiteGroups.every((group) => group.hidden) ? ' hidden' : '';
  const contentHidden = contentGroups.every((group) => group.hidden) ? ' hidden' : '';
  const adminHidden = adminGroups.every((group) => group.hidden) ? ' hidden' : '';
  const userBlock = displayName
    ? `<div id="current-user" class="admin-user"><div class="admin-user-row"><b>${displayName}</b>${roleLabel ? `<span class="admin-role-pill">${roleLabel}</span>` : ''}</div></div>`
    : '<div id="current-user" class="admin-user"></div>';

  return `<aside id="admin-sidebar" class="admin-sidebar" data-admin-nav-v2 aria-label="CMS sidebar">
${renderAdminSidebarClose()}
<div class="admin-brand"><img class="admin-brand-mark" src="/assets/efhs-admin-mark.png?v=${escapeAdminHtml(v)}" alt="East Forsyth Band eagle logo"><div><b>EFHS Band</b><small>Admin CMS</small></div></div>
${userBlock}
<label class="admin-nav-search"><span class="sr-only">Find a page or tool</span><input type="search" data-admin-nav-search placeholder="Find a page or tool…" autocomplete="off"></label>
<nav class="admin-tabs admin-menu" aria-label="CMS navigation">
${renderNavItem(model.dashboard, model.currentKey)}
<p class="admin-menu-label" data-nav-section="website"${websiteHidden}>Website</p>
${websiteGroups.map((group) => renderGroup(group, model.currentKey)).join('')}
<p class="admin-menu-label" data-nav-section="content"${contentHidden}>Content</p>
${contentGroups.map((group) => renderGroup(group, model.currentKey)).join('')}
<p class="admin-menu-label" data-nav-section="admin"${adminHidden}>Admin</p>
${adminGroups.map((group) => renderGroup(group, model.currentKey)).join('')}
</nav>
<div class="admin-sidebar-footer">
<button type="button" class="admin-change-password" data-open-password>Change password</button>
<form id="admin-logout-form" class="admin-logout-form" method="post" action="/admin/logout">
<button class="admin-logout" type="submit">Log out</button>
</form>
</div>
</aside>`;
}
