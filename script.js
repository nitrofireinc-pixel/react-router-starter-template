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

  fetch('/api/site', { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((site) => {
      if (!site) return;
      const enabled = site.maintenance_mode === true
        || site.maintenance_mode === 1
        || site.maintenance_mode === '1';
      if (enabled) window.location.replace('/maintenance.html');
    })
    .catch(() => {});
})();
