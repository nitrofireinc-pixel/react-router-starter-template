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

export function renderAdminSidebarHtml(assetVersion = 'dev', options = {}) {
  const v = String(assetVersion || 'dev');
  const filtered = typeof options.allow === 'function';
  const allow = filtered ? options.allow : () => true;
  const defaultHidden = new Set(['ensembles', 'events', 'ledger', 'checkout', 'caldev', 'security-log']);
  const hide = (tab) => {
    if (filtered) return allow(tab) ? '' : ' hidden';
    return defaultHidden.has(tab) ? ' hidden' : '';
  };
  const showBoosters = filtered
    ? (allow('booster-members') || allow('minutes') || allow('badge-creator'))
    : false;
  const showSponsors = filtered
    ? (allow('sponsors') || allow('sponsors-page') || allow('become-a-sponsor'))
    : false;
  const showPageSettings = filtered ? allow('page-settings') : false;
  return `<aside id="admin-sidebar" class="admin-sidebar" aria-label="CMS sidebar">
${renderAdminSidebarClose()}
<div class="admin-brand"><img class="admin-brand-mark" src="/assets/efhs-admin-mark.png?v=${v}" alt="East Forsyth Band eagle logo"><div><b>EFHS Band</b><small>Admin CMS</small></div></div>
<div id="current-user" class="admin-user"></div>
<nav class="admin-tabs admin-menu" aria-label="CMS navigation">
<button type="button" data-tab="dashboard"${hide('dashboard')}>Dashboard</button>
<button type="button" data-tab="mail"${hide('mail')}>Staff Email</button>
<p class="admin-menu-label" data-page-shortcuts-label hidden>Pages</p>
<div id="admin-page-shortcuts" class="admin-page-shortcuts"></div>
<p class="admin-menu-label">Manage</p>
<div class="admin-menu-group" data-page-settings-menu${showPageSettings ? '' : ' hidden'}>
<button type="button" class="admin-menu-parent" data-page-settings-toggle aria-expanded="false">⚙ Page settings</button>
<div class="admin-menu-sub" data-page-settings-sub hidden>
<button type="button" data-page-settings-link="fundraising">Fundraising</button>
</div>
</div>
<button type="button" data-tab="staff"${hide('staff')}>Directors & Staff</button>
<button type="button" data-tab="ensembles"${hide('ensembles')}>Ensemble</button>
<div class="admin-menu-group" data-boosters-menu${showBoosters ? '' : ' hidden'}>
<button type="button" class="admin-menu-parent" data-boosters-toggle aria-expanded="false">Band Boosters</button>
<div class="admin-menu-sub" data-boosters-sub hidden>
<button type="button" data-tab="booster-members"${hide('booster-members')}>Booster Members</button>
<button type="button" data-tab="minutes"${hide('minutes')}>Meeting Minutes</button>
<button type="button" data-tab="badge-creator"${hide('badge-creator')}>Badge Creator</button>
</div>
</div>
<button type="button" data-tab="events"${hide('events')}>Calendar Events</button>
<div class="admin-menu-group" data-sponsors-menu${showSponsors ? '' : ' hidden'}>
<button type="button" class="admin-menu-parent" data-sponsors-toggle aria-expanded="false">Sponsors</button>
<div class="admin-menu-sub" data-sponsors-sub hidden>
<button type="button" data-tab="sponsors"${hide('sponsors')}>Manage sponsors</button>
<button type="button" data-sponsor-nav="sponsors-page"${hide('sponsors-page')}>Sponsors page</button>
<button type="button" data-sponsor-nav="become-a-sponsor"${hide('become-a-sponsor')}>Become a Sponsor</button>
</div>
</div>
<button type="button" data-tab="contact"${hide('contact')}>Contact Form</button>
<button type="button" data-tab="forms"${hide('forms')}>Forms</button>
<button type="button" data-tab="ledger"${hide('ledger')}>Ledger</button>
<button type="button" data-tab="checkout"${hide('checkout')}>Checkout</button>
<button type="button" data-tab="users"${hide('users')}>Users</button>
<button type="button" data-tab="caldev"${hide('caldev')}>Schedule Board</button>
<button type="button" data-tab="security-log"${hide('security-log')}>Security Log</button>
<button type="button" data-tab="social"${hide('social')}>Social Media</button>
<button type="button" data-tab="site"${hide('site')}>Site Settings</button>
<button type="button" data-tab="photos"${hide('photos')}>Photos</button>
</nav>
<div class="admin-sidebar-footer">
<form id="admin-logout-form" class="admin-logout-form" method="post" action="/admin/logout">
<button class="admin-logout" type="submit">Log Out</button>
</form>
<button type="button" class="admin-change-password" data-open-password>Change Password</button>
</div>
</aside>`;
}
