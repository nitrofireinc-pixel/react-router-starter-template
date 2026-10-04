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

export function renderAdminSidebarHtml(assetVersion = 'dev') {
  const v = String(assetVersion || 'dev');
  return `<aside id="admin-sidebar" class="admin-sidebar" aria-label="CMS sidebar">
${renderAdminSidebarClose()}
<div class="admin-brand"><img class="admin-brand-mark" src="/assets/efhs-admin-mark.png?v=${v}" alt="East Forsyth Band eagle logo"><div><b>EFHS Band</b><small>Admin CMS</small></div></div>
<div id="current-user" class="admin-user"></div>
<nav class="admin-tabs admin-menu" aria-label="CMS navigation">
<button type="button" data-tab="dashboard">Dashboard</button>
<button type="button" data-tab="mail">Staff Email</button>
<p class="admin-menu-label" data-page-shortcuts-label hidden>Pages</p>
<div id="admin-page-shortcuts" class="admin-page-shortcuts"></div>
<p class="admin-menu-label">Manage</p>
<button type="button" data-tab="staff">Directors & Staff</button>
<button type="button" data-tab="ensembles" hidden>Ensemble</button>
<div class="admin-menu-group" data-boosters-menu hidden>
<button type="button" class="admin-menu-parent" data-boosters-toggle aria-expanded="false">Band Boosters</button>
<div class="admin-menu-sub" data-boosters-sub hidden>
<button type="button" data-tab="booster-members">Booster Members</button>
<button type="button" data-tab="minutes">Meeting Minutes</button>
<button type="button" data-tab="badge-creator">Badge Creator</button>
</div>
</div>
<button type="button" data-tab="events" hidden>Calendar Events</button>
<div class="admin-menu-group" data-sponsors-menu hidden>
<button type="button" class="admin-menu-parent" data-sponsors-toggle aria-expanded="false">Sponsors</button>
<div class="admin-menu-sub" data-sponsors-sub hidden>
<button type="button" data-tab="sponsors">Manage sponsors</button>
<button type="button" data-sponsor-nav="sponsors-page">Sponsors page</button>
<button type="button" data-sponsor-nav="become-a-sponsor">Become a Sponsor</button>
</div>
</div>
<button type="button" data-tab="contact">Contact Form</button>
<button type="button" data-tab="forms">Forms</button>
<button type="button" data-tab="ledger" hidden>Ledger</button>
<button type="button" data-tab="checkout" hidden>Checkout</button>
<button type="button" data-tab="users">Users</button>
<button type="button" data-tab="caldev" hidden>Schedule Board</button>
<button type="button" data-tab="security-log" hidden>Security Log</button>
<button type="button" data-tab="social">Social Media</button>
<button type="button" data-tab="site">Site Settings</button>
<button type="button" data-tab="photos">Photos</button>
</nav>
<div class="admin-sidebar-footer">
<form id="admin-logout-form" class="admin-logout-form" method="post" action="/admin/logout">
<button class="admin-logout" type="submit">Log Out</button>
</form>
<button type="button" class="admin-change-password" data-open-password>Change Password</button>
</div>
</aside>`;
}
