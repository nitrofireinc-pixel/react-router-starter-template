function isMobileNavViewport() {
  return Boolean(window.matchMedia && window.matchMedia('(max-width: 760px)').matches);
}

function ensureNavBackdrop() {
  let backdrop = document.querySelector('[data-nav-backdrop]');
  if (backdrop) return backdrop;
  const header = document.querySelector('header.site-header');
  if (!header) return null;
  backdrop = document.createElement('div');
  backdrop.className = 'nav-backdrop';
  backdrop.dataset.navBackdrop = '';
  backdrop.hidden = true;
  const nav = header.querySelector('#site-nav');
  if (nav) header.insertBefore(backdrop, nav);
  else header.appendChild(backdrop);
  return backdrop;
}

function ensureMobileNavTray() {
  const header = document.querySelector('header.site-header');
  if (!header) return null;
  let tray = header.querySelector('[data-mobile-nav-tray]');
  if (!tray) {
    tray = document.createElement('div');
    tray.className = 'mobile-nav-tray';
    tray.dataset.mobileNavTray = '';
    const inner = header.querySelector('.header-inner');
    if (inner && inner.nextSibling) header.insertBefore(tray, inner.nextSibling);
    else if (inner) header.appendChild(tray);
    else header.insertBefore(tray, header.firstChild);
  }
  return tray;
}

function ensureHeaderQuickActions() {
  const tray = ensureMobileNavTray();
  const host = tray || document.querySelector('header.site-header .header-inner');
  if (!host) return null;
  let actions = host.querySelector('[data-header-quick-actions]');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'header-quick-actions';
    actions.dataset.headerQuickActions = '';
    host.appendChild(actions);
  }
  return actions;
}

function enhanceMenuButton(button) {
  if (!button) return;
  if (!button.querySelector('.menu-button-icon')) {
    button.innerHTML = '<span class="menu-button-icon" aria-hidden="true"><span></span><span></span><span></span></span><span class="sr-only">Menu</span>';
  }
  if (!button.getAttribute('aria-label')) {
    button.setAttribute('aria-label', 'Open menu');
  }
  if (!button.getAttribute('type')) button.type = 'button';
}

function setMobileNavOpen(open) {
  const button = document.querySelector('.menu-button');
  const nav = document.querySelector('#site-nav') || document.querySelector('header.site-header nav');
  const backdrop = ensureNavBackdrop();
  if (!nav) return;
  nav.classList.toggle('open', open);
  document.body.classList.toggle('nav-drawer-open', open);
  if (button) {
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  if (backdrop) {
    backdrop.hidden = !open;
    backdrop.classList.toggle('is-open', open);
  }
}

function placeMenuButtonInTray() {
  const tray = ensureMobileNavTray();
  const button = document.querySelector('.menu-button');
  if (!tray || !button) return button;
  if (button.parentElement !== tray) {
    tray.insertBefore(button, tray.firstChild);
  }
  return button;
}

function placeHeaderQuickActions() {
  const nav = document.querySelector('#site-nav') || document.querySelector('header.site-header nav');
  const actions = ensureHeaderQuickActions();
  const menuButton = placeMenuButtonInTray();
  if (!nav || !actions) return;
  const notify = document.querySelector('[data-notify-me]');
  const addHome = document.querySelector('[data-add-home]');
  if (isMobileNavViewport()) {
    if (notify) actions.appendChild(notify);
    if (addHome) actions.appendChild(addHome);
  } else {
    setMobileNavOpen(false);
    if (notify) nav.appendChild(notify);
    if (addHome) nav.appendChild(addHome);
  }
  if (menuButton) enhanceMenuButton(menuButton);
}

(function bindMobileNavDrawer() {
  const nav = document.querySelector('#site-nav') || document.querySelector('header.site-header nav');
  if (!nav) return;
  ensureNavBackdrop();
  ensureHeaderQuickActions();
  placeHeaderQuickActions();
  const button = document.querySelector('.menu-button');
  if (!button) return;
  enhanceMenuButton(button);

  button.addEventListener('click', () => {
    const open = !nav.classList.contains('open');
    setMobileNavOpen(open);
  });

  const backdrop = ensureNavBackdrop();
  if (backdrop && backdrop.dataset.boundNavBackdrop !== '1') {
    backdrop.dataset.boundNavBackdrop = '1';
    backdrop.addEventListener('click', () => setMobileNavOpen(false));
  }

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      if (isMobileNavViewport()) setMobileNavOpen(false);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMobileNavOpen(false);
  });

  if (window.matchMedia) {
    const media = window.matchMedia('(max-width: 760px)');
    const onChange = () => placeHeaderQuickActions();
    if (media.addEventListener) media.addEventListener('change', onChange);
    else if (media.addListener) media.addListener(onChange);
  }
})();

function ensureStaffAuthNavLink() {
  const siteNav = document.querySelector('#site-nav');
  if (!siteNav) return null;
  let link = siteNav.querySelector('[data-staff-auth-link]');
  if (!link) {
    link = document.createElement('a');
    link.setAttribute('data-staff-auth-link', '');
    link.href = '/admin/login';
    link.textContent = 'Login';
    siteNav.appendChild(link);
  }
  return link;
}

function applyStaffAuthNavState(loggedIn) {
  const link = ensureStaffAuthNavLink();
  if (!link) return;
  if (loggedIn) {
    link.href = '/admin';
    link.textContent = 'Staff Menu';
  } else {
    link.href = '/admin/login';
    link.textContent = 'Login';
  }
}

(function syncStaffAuthNavLink() {
  applyStaffAuthNavState(false);
  fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      applyStaffAuthNavState(Boolean(data && data.logged_in));
    })
    .catch(() => {
      applyStaffAuthNavState(false);
    });
})();

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function ensureNotifyMeNavControl() {
  let button = document.querySelector('[data-notify-me]');
  if (!button) {
    const siteNav = document.querySelector('#site-nav');
    if (!siteNav) return null;
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-notify-me';
    button.dataset.notifyMe = '';
    button.setAttribute('aria-label', 'Notify me about calendar updates');
    button.title = 'Notify me about calendar updates';
    button.innerHTML = `
      <span class="nav-notify-bell" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false"><path d="M12 22a2.2 2.2 0 0 0 2.2-2.2h-4.4A2.2 2.2 0 0 0 12 22Zm7-6.2V11a7 7 0 1 0-14 0v4.8L3 17.8V19h18v-1.2l-2-1.8Z"/></svg>
      </span>
      <span class="nav-notify-label">Notify Me</span>`;
    siteNav.appendChild(button);
  }
  placeHeaderQuickActions();
  return document.querySelector('[data-notify-me]');
}

function setNotifyMeState(button, state) {
  if (!button) return;
  const label = button.querySelector('.nav-notify-label');
  button.classList.toggle('is-enabled', state === 'enabled');
  button.classList.toggle('is-busy', state === 'busy');
  button.classList.toggle('is-unsupported', state === 'unsupported');
  button.disabled = state === 'busy' || state === 'unsupported';
  if (state === 'enabled') {
    if (label) label.textContent = 'Notifications On';
    button.setAttribute('aria-label', 'Calendar notifications are on. Click to turn off.');
    button.title = 'Calendar notifications are on';
  } else if (state === 'unsupported') {
    if (label) label.textContent = 'Notify Me';
    button.setAttribute('aria-label', 'Notifications are not supported in this browser');
    button.title = 'Notifications are not supported in this browser';
  } else if (state === 'busy') {
    if (label) label.textContent = 'Working…';
    button.setAttribute('aria-label', 'Updating notification settings');
  } else {
    if (label) label.textContent = 'Notify Me';
    button.setAttribute('aria-label', 'Notify me about calendar updates');
    button.title = 'Notify me about calendar updates';
  }
}

function webPushSupported() {
  return Boolean(
    window.isSecureContext
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window,
  );
}

async function getNotifyMeSubscription() {
  const registration = await navigator.serviceWorker.register('/push-sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  return {
    registration,
    subscription: await registration.pushManager.getSubscription(),
  };
}

async function syncNotifyMeButtonState(button) {
  if (!webPushSupported()) {
    setNotifyMeState(button, 'unsupported');
    button.hidden = true;
    return;
  }
  button.hidden = false;
  try {
    const { subscription } = await getNotifyMeSubscription();
    if (Notification.permission === 'denied') {
      setNotifyMeState(button, 'default');
      return;
    }
    setNotifyMeState(button, subscription ? 'enabled' : 'default');
  } catch {
    setNotifyMeState(button, 'default');
  }
}

async function enableNotifyMe(button) {
  setNotifyMeState(button, 'busy');
  const keyResponse = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
  const keyPayload = await keyResponse.json().catch(() => ({}));
  if (!keyResponse.ok || !keyPayload.publicKey) {
    throw new Error(keyPayload.detail || 'Could not load notification settings.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications were blocked. Enable them in your browser settings to get calendar alerts.');
  }
  const { registration } = await getNotifyMeSubscription();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyPayload.publicKey),
    });
  }
  const body = subscription.toJSON();
  body.user_agent = navigator.userAgent || '';
  const saveResponse = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const savePayload = await saveResponse.json().catch(() => ({}));
  if (!saveResponse.ok) {
    throw new Error(savePayload.detail || 'Could not save notification subscription.');
  }
  setNotifyMeState(button, 'enabled');
}

async function disableNotifyMe(button) {
  setNotifyMeState(button, 'busy');
  const { subscription } = await getNotifyMeSubscription();
  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe().catch(() => {});
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    }).catch(() => {});
  }
  setNotifyMeState(button, 'default');
}

(function bindNotifyMeNavControl() {
  const button = ensureNotifyMeNavControl();
  if (!button || button.dataset.boundNotifyMe === '1') return;
  button.dataset.boundNotifyMe = '1';
  syncNotifyMeButtonState(button);

  button.addEventListener('click', async () => {
    if (!webPushSupported()) {
      window.alert('Notifications are not supported in this browser.');
      return;
    }
    try {
      if (button.classList.contains('is-enabled')) {
        await disableNotifyMe(button);
      } else {
        await enableNotifyMe(button);
      }
    } catch (error) {
      await syncNotifyMeButtonState(button);
      window.alert(error?.message || 'Could not update notifications.');
    }
  });
})();

function isStandaloneDisplay() {
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches
      || window.navigator.standalone === true,
  );
}

function detectMobileInstallOs() {
  const ua = String(navigator.userAgent || '');
  const platform = String(navigator.platform || '');
  const touchMac = platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/i.test(ua) || touchMac) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (!isMobileNavViewport()) return 'desktop';
  return 'other';
}

function ensureWebAppManifestLink() {
  if (document.querySelector('link[rel="manifest"]')) return;
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = '/manifest.webmanifest';
  document.head.appendChild(link);
  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const apple = document.createElement('link');
    apple.rel = 'apple-touch-icon';
    apple.href = '/assets/efhs-blue-regiment-mark.png';
    document.head.appendChild(apple);
  }
}

function ensureAddToHomeNavControl() {
  let button = document.querySelector('[data-add-home]');
  if (!button) {
    const siteNav = document.querySelector('#site-nav');
    if (!siteNav) return null;
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-add-home';
    button.dataset.addHome = '';
    button.setAttribute('aria-label', 'Add East Forsyth Band to your home screen');
    button.title = 'Add to Home Screen';
    button.innerHTML = '<img class="nav-add-home-mark" src="/assets/efhs-blue-regiment-mark.png" alt="" width="22" height="22" decoding="async">';
    const notify = siteNav.querySelector('[data-notify-me]');
    if (notify && notify.nextSibling) siteNav.insertBefore(button, notify.nextSibling);
    else siteNav.appendChild(button);
  }
  placeHeaderQuickActions();
  return document.querySelector('[data-add-home]');
}

function addToHomeInstructions(os) {
  if (os === 'ios') {
    return {
      eyebrow: 'iPhone / iPad',
      steps: [
        'Tap the Share button in Safari (square with an up arrow).',
        'Scroll and tap Add to Home Screen.',
        'Tap Add to save the Blue Regiment shortcut.',
      ],
    };
  }
  if (os === 'android') {
    return {
      eyebrow: 'Android',
      steps: [
        'Tap the browser menu (⋮).',
        'Choose Add to Home screen or Install app.',
        'Confirm to place the Blue Regiment icon on your home screen.',
      ],
    };
  }
  if (os === 'desktop') {
    return {
      eyebrow: 'Desktop browser',
      steps: [
        'Look for the install icon in your browser address bar.',
        'Or open the browser menu and choose Install East Forsyth Band / Install app.',
        'Confirm to add a Blue Regiment shortcut you can open like an app.',
      ],
    };
  }
  return {
    eyebrow: 'Mobile browser',
    steps: [
      'Open this site in your phone’s browser menu.',
      'Choose Add to Home screen / Install app.',
      'Confirm to save the Blue Regiment shortcut.',
    ],
  };
}

function ensureAddToHomeSheet() {
  let sheet = document.querySelector('[data-add-home-sheet]');
  if (sheet) return sheet;
  sheet = document.createElement('div');
  sheet.className = 'add-home-sheet';
  sheet.dataset.addHomeSheet = '';
  sheet.hidden = true;
  sheet.innerHTML = `
    <div class="add-home-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="add-home-title">
      <div class="add-home-sheet-head">
        <img src="/assets/efhs-blue-regiment-mark.png" alt="">
        <div>
          <h2 id="add-home-title">Add to Home Screen</h2>
          <p data-add-home-os></p>
        </div>
      </div>
      <ol data-add-home-steps></ol>
      <div class="add-home-sheet-actions">
        <button type="button" class="btn primary" data-add-home-install hidden>Install</button>
        <button type="button" class="btn secondary" data-add-home-close>Got it</button>
      </div>
    </div>`;
  document.body.appendChild(sheet);
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet || event.target.closest('[data-add-home-close]')) {
      sheet.hidden = true;
    }
  });
  return sheet;
}

function showAddToHomeSheet({ os, canInstall }) {
  const sheet = ensureAddToHomeSheet();
  const info = addToHomeInstructions(os);
  const osLabel = sheet.querySelector('[data-add-home-os]');
  const steps = sheet.querySelector('[data-add-home-steps]');
  const installBtn = sheet.querySelector('[data-add-home-install]');
  if (osLabel) osLabel.textContent = info.eyebrow;
  if (steps) {
    steps.innerHTML = info.steps.map((step) => `<li>${step}</li>`).join('');
  }
  if (installBtn) {
    installBtn.hidden = !canInstall;
    installBtn.onclick = async () => {
      if (!window.__efhsDeferredInstallPrompt) return;
      const promptEvent = window.__efhsDeferredInstallPrompt;
      window.__efhsDeferredInstallPrompt = null;
      installBtn.hidden = true;
      await promptEvent.prompt();
      sheet.hidden = true;
      syncAddToHomeButtonState(ensureAddToHomeNavControl());
    };
  }
  sheet.hidden = false;
}

function syncAddToHomeButtonState(button) {
  if (!button) return;
  button.hidden = isStandaloneDisplay();
}

(function bindAddToHomeNavControl() {
  ensureWebAppManifestLink();
  const button = ensureAddToHomeNavControl();
  if (!button || button.dataset.boundAddHome === '1') return;
  button.dataset.boundAddHome = '1';
  syncAddToHomeButtonState(button);

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    window.__efhsDeferredInstallPrompt = event;
  });

  window.addEventListener('appinstalled', () => {
    window.__efhsDeferredInstallPrompt = null;
    syncAddToHomeButtonState(button);
  });

  if (window.matchMedia) {
    const media = window.matchMedia('(max-width: 760px)');
    const onChange = () => syncAddToHomeButtonState(button);
    if (media.addEventListener) media.addEventListener('change', onChange);
    else if (media.addListener) media.addListener(onChange);
  }

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/push-sw.js', { scope: '/' }).catch(() => {});
  }

  button.addEventListener('click', async () => {
    if (isStandaloneDisplay()) {
      window.alert('East Forsyth Band is already installed / on your home screen.');
      return;
    }
    const os = detectMobileInstallOs();
    const deferred = window.__efhsDeferredInstallPrompt;
    if (deferred && (os === 'android' || os === 'desktop')) {
      try {
        await deferred.prompt();
        window.__efhsDeferredInstallPrompt = null;
        syncAddToHomeButtonState(button);
        return;
      } catch {
        // Fall through to instructions if the native prompt fails.
      }
    }
    showAddToHomeSheet({ os, canInstall: Boolean(window.__efhsDeferredInstallPrompt) });
  });
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

(function protectSiteImages() {
  const isProtectedTarget = (target) => Boolean(
    target?.closest?.('img, picture, svg, canvas, .gallery-item, .photo-lightbox, .brand-logo, .brand-mark, .hero-card img, .mini-logo, .avatar'),
  );

  const markImages = (root = document) => {
    root.querySelectorAll('img').forEach((img) => {
      if (img.dataset.imageProtected === '1') return;
      img.dataset.imageProtected = '1';
      img.setAttribute('draggable', 'false');
    });
  };

  document.addEventListener('contextmenu', (event) => {
    if (isProtectedTarget(event.target)) event.preventDefault();
  }, true);

  document.addEventListener('dragstart', (event) => {
    if (isProtectedTarget(event.target)) event.preventDefault();
  }, true);

  markImages(document);
  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches?.('img')) markImages(node.parentElement || document);
          else if (node.querySelectorAll) markImages(node);
        });
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  window.__efProtectSiteImages = markImages;
})();
