const btn = document.querySelector('.menu-button');
const nav = document.querySelector('nav');
if (btn && nav) {
  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
}

(function enforceMaintenanceMode() {
  const path = (location.pathname || '/').replace(/\/+$/, '') || '/';
  if (path === '/maintenance' || path.endsWith('/maintenance.html')) return;

  Promise.all([
    fetch('/api/site', { cache: 'no-store' }).then((response) => (response.ok ? response.json() : null)).catch(() => null),
    fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' }).then((response) => (response.ok ? response.json() : null)).catch(() => null),
  ]).then(([site, session]) => {
    if (!site) return;
    const enabled = site.maintenance_mode === true
      || site.maintenance_mode === 1
      || site.maintenance_mode === '1';
    if (!enabled) return;
    // Only Super Admins may preview public pages during maintenance.
    if (session && session.is_super_admin) {
      ensureMaintenancePreviewBanner();
      return;
    }
    const returnTo = `${location.pathname || '/'}${location.search || ''}`;
    document.cookie = `efband_maintenance_return=${encodeURIComponent(returnTo)}; Path=/; Max-Age=604800; SameSite=Lax`;
    window.location.replace('/maintenance.html');
  }).catch(() => {});
})();

function ensureMaintenancePreviewBanner() {
  if (document.querySelector('[data-maintenance-preview-banner]')) {
    document.body.classList.add('maintenance-preview');
    return;
  }
  const banner = document.createElement('div');
  banner.className = 'maintenance-preview-banner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('data-maintenance-preview-banner', '');
  banner.innerHTML = '<strong>Maintenance mode is on.</strong> <span>Super Admin preview — the public and other users still see the maintenance page.</span> <a href="/admin">Back to CMS</a>';
  document.body.classList.add('maintenance-preview');
  document.body.insertBefore(banner, document.body.firstChild);
}

function openSquareCheckoutWindow(url) {
  const topWindow = window.top || window;
  const dualScreenLeft = topWindow.screenLeft !== undefined ? topWindow.screenLeft : topWindow.screenX;
  const dualScreenTop = topWindow.screenTop !== undefined ? topWindow.screenTop : topWindow.screenY;
  const width = topWindow.innerWidth || document.documentElement.clientWidth || screen.width;
  const height = topWindow.innerHeight || document.documentElement.clientHeight || screen.height;
  const h = height * 0.75;
  const w = 500;
  const systemZoom = width / topWindow.screen.availWidth || 1;
  const left = (width - w) / 2 / systemZoom + dualScreenLeft;
  const top = (height - h) / 2 / systemZoom + dualScreenTop;
  return window.open(
    url,
    'Square Payment Links',
    `scrollbars=yes,width=${w / systemZoom},height=${h / systemZoom},top=${top},left=${left}`,
  );
}
window.openSquareCheckoutWindow = openSquareCheckoutWindow;

document.querySelectorAll('[data-square-checkout]').forEach((button) => {
  button.addEventListener('click', (event) => {
    const url = button.getAttribute('data-url') || button.getAttribute('href');
    if (!url) return;
    event.preventDefault();
    const checkoutWindow = openSquareCheckoutWindow(url);
    if (checkoutWindow) checkoutWindow.focus();
    else window.open(url, '_blank', 'noopener,noreferrer');
  });
});
