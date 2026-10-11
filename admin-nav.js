(function startAdminNav() {
  const STORAGE_KEY = 'efhsAdminNavOpen';
  const MOBILE_MQ = '(max-width: 767px)';
  const OVERLAY_MQ = '(max-width: 1023px)';
  const TRANSITION_MS = 200;

  function isMobile() {
    return Boolean(window.matchMedia && window.matchMedia(MOBILE_MQ).matches);
  }

  function isOverlay() {
    return Boolean(window.matchMedia && window.matchMedia(OVERLAY_MQ).matches);
  }

  function readStored() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      if (value === '1') return true;
      if (value === '0') return false;
    } catch {
      /* private mode */
    }
    return null;
  }

  function writeStored(open) {
    try {
      localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
    } catch {
      /* private mode */
    }
  }

  function desiredOpen() {
    if (isMobile()) return false;
    const stored = readStored();
    return stored === null ? true : stored;
  }

  function focusable(root) {
    return [...root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((el) => {
        if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
  }

  let lastFocus = null;
  let trapHandler = null;
  let focusTimer = null;
  let focusTransitionHandler = null;
  let focusSidebar = null;

  function unbindTrap() {
    if (trapHandler) document.removeEventListener('keydown', trapHandler, true);
    trapHandler = null;
  }

  function clearScheduledFocus() {
    if (focusTimer) {
      window.clearTimeout(focusTimer);
      focusTimer = null;
    }
    if (focusSidebar && focusTransitionHandler) {
      focusSidebar.removeEventListener('transitionend', focusTransitionHandler);
    }
    focusTransitionHandler = null;
    focusSidebar = null;
  }

  function focusDrawer(sidebar) {
    const first = sidebar.querySelector('[data-admin-nav-close]') || focusable(sidebar)[0];
    first?.focus?.();
  }

  function scheduleDrawerFocus(sidebar) {
    clearScheduledFocus();
    const run = () => {
      clearScheduledFocus();
      focusDrawer(sidebar);
    };
    const reduceMotion = Boolean(
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
    if (reduceMotion) {
      run();
      return;
    }
    focusSidebar = sidebar;
    focusTransitionHandler = (event) => {
      if (event.target !== sidebar) return;
      if (event.propertyName && event.propertyName !== 'transform') return;
      run();
    };
    sidebar.addEventListener('transitionend', focusTransitionHandler);
    focusTimer = window.setTimeout(run, TRANSITION_MS + 80);
  }

  function bindTrap(sidebar) {
    unbindTrap();
    trapHandler = (event) => {
      if (event.key !== 'Tab' || !document.body.classList.contains('admin-nav-open')) return;
      const items = focusable(sidebar);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapHandler, true);
  }

  function revealOverlaySubmenus() {
    if (!isOverlay()) return;
    document.querySelectorAll('.admin-menu-group:not([hidden])').forEach((group) => {
      const toggle = group.querySelector('.admin-menu-parent, [data-boosters-toggle], [data-sponsors-toggle], [data-page-settings-toggle]');
      const sub = group.querySelector('.admin-menu-sub');
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
      if (sub) sub.hidden = false;
    });
  }

  function notifyLayout() {
    const fire = () => {
      window.dispatchEvent(new Event('resize'));
      document.dispatchEvent(new CustomEvent('efhs-admin-nav-change', {
        detail: { open: document.body.classList.contains('admin-nav-open') },
      }));
    };
    fire();
    window.setTimeout(fire, TRANSITION_MS + 30);
  }

  function setOpen(open, { persist = true, fromUser = false } = {}) {
    const sidebar = document.getElementById('admin-sidebar');
    const toggle = document.querySelector('.admin-nav-toggle');
    const backdrop = document.querySelector('[data-admin-nav-backdrop]');
    if (!sidebar || !toggle) return;

    const overlay = isOverlay();
    const wasOpen = document.body.classList.contains('admin-nav-open');

    document.body.classList.toggle('admin-nav-open', open);
    document.body.classList.toggle('admin-nav-closed', !open);
    document.body.classList.toggle('admin-nav-overlay', overlay && open);
    document.documentElement.classList.toggle('admin-nav-open', open);
    document.documentElement.classList.toggle('admin-nav-closed', !open);

    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-controls', 'admin-sidebar');
    sidebar.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (backdrop) backdrop.hidden = !(open && overlay);
    document.body.classList.toggle('admin-nav-scroll-lock', open && overlay);

    if (persist && (fromUser || !isMobile())) writeStored(open);

    if (open && !wasOpen) {
      lastFocus = document.activeElement;
      scheduleDrawerFocus(sidebar);
      if (overlay) bindTrap(sidebar);
    }
    if (!open && wasOpen) {
      clearScheduledFocus();
      unbindTrap();
      const restore = document.querySelector('.admin-nav-toggle') || lastFocus;
      restore?.focus?.();
      lastFocus = null;
    }

    if (open && overlay) revealOverlaySubmenus();
    notifyLayout();
  }

  function isStandaloneAdminPage() {
    return !document.getElementById('tab-dashboard');
  }

  const GROUP_STORE = 'efhsAdminNavGroups';

  function readGroups() {
    try {
      return JSON.parse(localStorage.getItem(GROUP_STORE) || '{}') || {};
    } catch {
      return {};
    }
  }

  function writeGroups(map) {
    try {
      localStorage.setItem(GROUP_STORE, JSON.stringify(map));
    } catch {
      /* private mode */
    }
  }

  function setGroupOpen(group, open, persist) {
    if (!group) return;
    const toggle = group.querySelector('[data-nav-group-toggle], [data-boosters-toggle], [data-sponsors-toggle], [data-page-settings-toggle], :scope > .admin-menu-parent');
    const sub = group.querySelector(':scope > .admin-menu-sub') || group.querySelector('.admin-menu-sub');
    if (toggle) toggle.setAttribute('aria-expanded', String(Boolean(open)));
    if (sub) sub.hidden = !open;
    const key = group.getAttribute('data-nav-group');
    if (persist && key) {
      const map = readGroups();
      map[key] = Boolean(open);
      writeGroups(map);
    }
  }

  function initNavGroups(sidebar) {
    const stored = readGroups();
    sidebar.querySelectorAll('[data-nav-group]').forEach((group) => {
      const key = group.getAttribute('data-nav-group');
      const hasCurrent = Boolean(group.querySelector('[data-nav-current], .admin-nav-item.active, .admin-page-edit.active'));
      const storedOpen = stored[key];
      setGroupOpen(group, hasCurrent || storedOpen === true, false);
      const toggle = group.querySelector('[data-nav-group-toggle], [data-boosters-toggle], [data-sponsors-toggle], :scope > .admin-menu-parent');
      if (!toggle || toggle.dataset.navGroupBound === '1') return;
      toggle.dataset.navGroupBound = '1';
      toggle.addEventListener('click', (event) => {
        event.preventDefault();
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        setGroupOpen(group, open, true);
      });
    });
    sidebar.querySelectorAll('[data-page-settings-toggle]').forEach((toggle) => {
      if (toggle.dataset.navBound === '1') return;
      toggle.dataset.navBound = '1';
      toggle.addEventListener('click', (event) => {
        event.preventDefault();
        const group = toggle.closest('.admin-menu-group');
        const sub = group?.querySelector('.admin-menu-sub');
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(open));
        if (sub) sub.hidden = !open;
      });
    });
  }

  function initNavSearch(sidebar) {
    const input = sidebar.querySelector('[data-admin-nav-search]');
    if (!input || input.dataset.bound === '1') return;
    input.dataset.bound = '1';
    const apply = () => {
      const query = String(input.value || '').trim().toLowerCase();
      sidebar.querySelectorAll('[data-nav-item], .admin-page-edit, [data-page-settings-link]').forEach((item) => {
        const label = item.textContent.toLowerCase();
        const match = !query || label.includes(query);
        item.classList.toggle('admin-nav-search-miss', Boolean(query) && !match);
      });
      sidebar.querySelectorAll('[data-nav-group]').forEach((group) => {
        if (group.hasAttribute('hidden') && !query) return;
        const kids = [...group.querySelectorAll('[data-nav-item], .admin-page-edit, [data-page-settings-link]')];
        const any = !query || kids.some((kid) => !kid.classList.contains('admin-nav-search-miss') && !kid.hidden);
        group.classList.toggle('admin-nav-search-empty', Boolean(query) && !any);
        if (query && any) setGroupOpen(group, true, false);
      });
    };
    input.addEventListener('input', apply);
  }

  function wireAdminNavLinks(sidebar) {
    sidebar.addEventListener('click', (event) => {
      if (event.target.closest('.admin-menu-parent, [data-nav-group-toggle], [data-page-settings-toggle], [data-boosters-toggle], [data-sponsors-toggle]')) {
        return;
      }
      const item = event.target.closest('[data-tab], [data-nav-item], [data-page-nav], [data-sponsor-nav], [data-page-settings-link], [data-page-settings], .admin-page-edit');
      if (!item) return;
      const href = item.getAttribute('href') || item.dataset.navHref;
      const tab = item.dataset.tab;
      if (tab && document.getElementById(`tab-${tab}`)) {
        event.preventDefault();
        return;
      }
      if (isStandaloneAdminPage() && href && href !== '#') {
        event.preventDefault();
        window.location.href = href;
      }
    });
    if (isStandaloneAdminPage()) {
      sidebar.querySelector('[data-open-password]')?.addEventListener('click', () => {
        window.location.href = '/admin?tab=dashboard';
      });
    }
  }

  function init() {
    const toggle = document.querySelector('.admin-nav-toggle');
    const sidebar = document.getElementById('admin-sidebar');
    if (!toggle || !sidebar || toggle.dataset.adminNavBound === '1') return;
    toggle.dataset.adminNavBound = '1';
    toggle.setAttribute('aria-controls', 'admin-sidebar');

    const backdrop = document.querySelector('[data-admin-nav-backdrop]');
    const closeBtn = document.querySelector('[data-admin-nav-close]');

    setOpen(desiredOpen(), { persist: false });
    if (isOverlay()) revealOverlaySubmenus();

    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      setOpen(!document.body.classList.contains('admin-nav-open'), { fromUser: true });
    });
    closeBtn?.addEventListener('click', () => setOpen(false, { fromUser: true }));
    backdrop?.addEventListener('click', () => setOpen(false, { fromUser: true }));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && document.body.classList.contains('admin-nav-open')) {
        setOpen(false, { fromUser: true });
      }
    });

    sidebar.addEventListener('click', (event) => {
      if (!isOverlay()) return;
      const target = event.target.closest('a, button');
      if (!target || target.matches('[data-admin-nav-close], .admin-menu-parent, [data-boosters-toggle], [data-sponsors-toggle], [data-page-settings-toggle]')) return;
      if (target.closest('.admin-menu, .admin-page-shortcuts, .admin-sidebar-footer')) {
        window.setTimeout(() => setOpen(false, { fromUser: true }), 0);
      }
    });

    initNavGroups(sidebar);
    initNavSearch(sidebar);
    wireAdminNavLinks(sidebar);

    const onBreakpoint = () => {
      setOpen(desiredOpen(), { persist: false });
    };
    window.matchMedia(MOBILE_MQ).addEventListener('change', onBreakpoint);
    window.matchMedia(OVERLAY_MQ).addEventListener('change', () => {
      setOpen(isMobile() ? false : document.body.classList.contains('admin-nav-open'), { persist: false });
      if (isOverlay()) revealOverlaySubmenus();
    });
  }

  window.efhsAdminNav = {
    init,
    open() { setOpen(true, { fromUser: true }); },
    close() { setOpen(false, { fromUser: true }); },
    toggle() { setOpen(!document.body.classList.contains('admin-nav-open'), { fromUser: true }); },
    isOpen() { return document.body.classList.contains('admin-nav-open'); },
    isOverlay,
    revealOverlaySubmenus,
    notifyLayout,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
