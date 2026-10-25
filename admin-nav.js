/* Site Studio admin nav, option 14d-1 (plan 2.22a): 68px icon rail + 260px flat section flyout.
 * >=700px: the rail is always visible; clicking an icon opens that section's flyout over the page
 * (the page never changes width). Esc / click outside closes it.
 * Phone (<700px): bottom bar (Home · current section · Find · Menu); Menu opens the full flat list as a sheet.
 * The launcher filters only menu items + page titles already in the HTML (no network). */
(() => {
  const OVERLAY_MQ = '(max-width: 699px)';
  const PHONE_MQ = '(max-width: 699px)';
  const TRANSITION_MS = 200;
  const FOCUSABLE = 'a[href]:not([hidden]), button:not([disabled]):not([hidden]), input:not([disabled]):not([type="hidden"]), [tabindex]:not([tabindex="-1"])';
  let lastFocus = null;
  let launcher = null;
  let flyBtn = null;
  let tipEl = null;

  const mq = (query) => window.matchMedia(query).matches;
  const isOverlay = () => mq(OVERLAY_MQ);
  const isPhone = () => mq(PHONE_MQ);
  const reducedMotion = () => mq('(prefers-reduced-motion: reduce)');
  const sidebarEl = () => document.getElementById('admin-sidebar');

  function isStandaloneAdminPage() {
    return !document.getElementById('tab-dashboard');
  }

  function notifyLayout() {
    const fire = () => {
      window.dispatchEvent(new Event('resize'));
      document.dispatchEvent(new CustomEvent('efhs-admin-nav-change', {
        detail: { open: document.body.classList.contains('admin-nav-open') },
      }));
    };
    if (reducedMotion()) fire();
    else window.setTimeout(fire, TRANSITION_MS + 80);
  }

  function focusables(root) {
    return [...root.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
  }

  function trapTab(event, root) {
    if (event.key !== 'Tab') return;
    const list = focusables(root);
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function setOpen(open, { focus = 'first' } = {}) {
    const sidebar = sidebarEl();
    const toggle = document.querySelector('.admin-nav-toggle');
    const backdrop = document.querySelector('[data-admin-nav-backdrop]');
    if (!sidebar) return;
    const overlay = isOverlay();
    const next = overlay ? Boolean(open) : true;
    const body = document.body;
    body.classList.toggle('admin-nav-open', next);
    body.classList.toggle('admin-nav-closed', !next);
    body.classList.toggle('admin-nav-overlay', overlay);
    body.classList.toggle('admin-nav-scroll-lock', overlay && next);
    document.documentElement.classList.toggle('admin-nav-open', next);
    toggle?.setAttribute('aria-expanded', String(overlay && next));
    if (backdrop) backdrop.hidden = !(overlay && next);
    if (overlay) {
      if (next) {
        sidebar.removeAttribute('inert');
        sidebar.setAttribute('role', 'dialog');
        sidebar.setAttribute('aria-modal', 'true');
        sidebar.setAttribute('aria-label', 'Menu');
      } else {
        sidebar.setAttribute('inert', '');
        sidebar.removeAttribute('role');
        sidebar.removeAttribute('aria-modal');
        sidebar.setAttribute('aria-label', 'Site Studio menu');
      }
    } else {
      sidebar.removeAttribute('inert');
      sidebar.removeAttribute('role');
      sidebar.removeAttribute('aria-modal');
      sidebar.setAttribute('aria-label', 'Site Studio menu');
    }
    if (overlay && next) {
      if (!sidebar.contains(document.activeElement)) lastFocus = document.activeElement;
      const target = focus === 'search'
        ? sidebar.querySelector('[data-admin-nav-search]')
        : sidebar.querySelector('[data-admin-nav-close]');
      window.setTimeout(() => target?.focus(), reducedMotion() ? 0 : 30);
    } else if (overlay && !next && lastFocus && sidebar.contains(document.activeElement)) {
      lastFocus.focus?.();
      lastFocus = null;
    }
    notifyLayout();
  }

  /* ---------- flat in-sidebar filter ---------- */
  function initNavSearch(sidebar) {
    const input = sidebar.querySelector('[data-admin-nav-search]');
    if (!input || input.dataset.bound === '1') return;
    input.dataset.bound = '1';
    const empty = sidebar.querySelector('[data-sn-empty]');
    const apply = () => {
      const query = String(input.value || '').trim().toLowerCase();
      let shown = 0;
      sidebar.querySelectorAll('[data-nav-item]').forEach((item) => {
        const hay = `${item.textContent} ${item.dataset.navSectionLabel || ''} ${item.dataset.navKeywords || ''}`.toLowerCase();
        const match = !query || hay.includes(query);
        item.classList.toggle('admin-nav-search-miss', !match);
        if (match) shown += 1;
      });
      sidebar.querySelectorAll('.sn-section').forEach((section) => {
        const any = [...section.querySelectorAll('[data-nav-item]')].some((kid) => !kid.classList.contains('admin-nav-search-miss'));
        section.classList.toggle('admin-nav-search-empty', !any);
      });
      if (empty) empty.hidden = shown > 0;
    };
    input.addEventListener('input', apply);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const query = input.value;
        if (isOverlay()) setOpen(false);
        openLauncher(query);
      }
    });
  }

  /* ---------- Ctrl+K launcher ---------- */
  function launcherIndex() {
    const sidebar = sidebarEl();
    if (!sidebar) return [];
    const items = [...sidebar.querySelectorAll('.sn-nav [data-nav-item]')].map((el) => ({
      label: el.querySelector('.sn-label')?.textContent.trim() || el.textContent.trim(),
      section: el.dataset.navSectionLabel || (el.dataset.navItem === 'dashboard' ? 'Home' : ''),
      href: el.getAttribute('href'),
      tab: el.dataset.tab || '',
      admin: el.dataset.navAdmin === '1',
      keywords: el.dataset.navKeywords || '',
      el,
    }));
    const pages = [...sidebar.querySelectorAll('[data-sn-pages] a')].map((el) => ({
      label: el.textContent.trim(),
      section: 'Pages',
      href: el.getAttribute('href'),
      tab: '',
      admin: false,
      keywords: 'page',
      el: null,
    }));
    return [...items, ...pages];
  }

  function score(entry, query) {
    if (!query) return 1;
    const label = entry.label.toLowerCase();
    const hay = `${label} ${entry.section.toLowerCase()} ${entry.keywords.toLowerCase()}`;
    if (label.startsWith(query)) return 4;
    if (label.split(/\s+/).some((word) => word.startsWith(query))) return 3;
    if (label.includes(query)) return 2;
    if (hay.includes(query)) return 1.5;
    // loose subsequence match ("schbrd" -> "Schedule Board")
    let i = 0;
    for (const ch of label) if (ch === query[i]) i += 1;
    return i === query.length ? 1 : 0;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function buildLauncher() {
    const wrap = document.createElement('div');
    wrap.className = 'sn-launch';
    wrap.hidden = true;
    wrap.innerHTML = `<div class="sn-launch-backdrop" data-sn-launch-close></div>
<div class="sn-launch-box" role="dialog" aria-modal="true" aria-labelledby="sn-launch-title">
<h2 id="sn-launch-title" class="sr-only">Find a page or tool</h2>
<div class="sn-launch-field"><svg class="sn-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
<input type="text" role="combobox" aria-expanded="true" aria-controls="sn-launch-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="Find a page or tool…" aria-label="Find a page or tool">
<button type="button" class="sn-launch-esc" data-sn-launch-close aria-label="Close search">Esc</button></div>
<p class="sn-launch-head" id="sn-launch-head">BEST MATCHES</p>
<ul class="sn-launch-list" id="sn-launch-list" role="listbox" aria-labelledby="sn-launch-head"></ul>
<p class="sn-launch-foot"><kbd>↑</kbd><kbd>↓</kbd> move <kbd>Enter</kbd> open <kbd>Esc</kbd> close</p>
</div>`;
    document.body.appendChild(wrap);
    const input = wrap.querySelector('input');
    const list = wrap.querySelector('ul');
    const head = wrap.querySelector('.sn-launch-head');
    let results = [];
    let active = 0;

    const setActive = (idx) => {
      active = Math.max(0, Math.min(idx, results.length - 1));
      [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
      const cur = list.children[active];
      if (cur) { input.setAttribute('aria-activedescendant', cur.id); cur.scrollIntoView?.({ block: 'nearest' }); }
      else input.removeAttribute('aria-activedescendant');
    };
    const render = () => {
      const query = input.value.trim().toLowerCase();
      results = launcherIndex()
        .map((entry, order) => ({ entry, s: score(entry, query), order }))
        .filter((row) => row.s > 0)
        .sort((a, b) => b.s - a.s || a.order - b.order)
        .slice(0, query ? 12 : 9)
        .map((row) => row.entry);
      head.textContent = query ? 'BEST MATCHES' : 'JUMP TO';
      list.innerHTML = results.length
        ? results.map((entry, i) => `<li id="sn-opt-${i}" role="option" aria-selected="false" data-idx="${i}"><span class="sn-opt-label">${escapeHtml(entry.label)}${entry.admin ? ' <span class="sn-admin-pill">ADMIN</span>' : ''}</span><span class="sn-opt-section">${escapeHtml(entry.section)}</span></li>`).join('')
        : '<li class="sn-launch-none" role="option" aria-disabled="true" aria-selected="false" id="sn-opt-none">No pages or tools match.</li>';
      setActive(0);
    };
    const go = (entry) => {
      if (!entry) return;
      closeLauncher();
      if (entry.el && entry.tab && document.getElementById(`tab-${entry.tab}`)) { entry.el.click(); return; }
      window.location.href = entry.href;
    };
    input.addEventListener('input', render);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive(active + 1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(active - 1); }
      else if (event.key === 'Home') { event.preventDefault(); setActive(0); }
      else if (event.key === 'End') { event.preventDefault(); setActive(results.length - 1); }
      else if (event.key === 'Enter') { event.preventDefault(); go(results[active]); }
    });
    list.addEventListener('mousemove', (event) => {
      const li = event.target.closest('[data-idx]');
      if (li) setActive(Number(li.dataset.idx));
    });
    list.addEventListener('click', (event) => {
      const li = event.target.closest('[data-idx]');
      if (li) go(results[Number(li.dataset.idx)]);
    });
    wrap.addEventListener('click', (event) => { if (event.target.closest('[data-sn-launch-close]')) closeLauncher(); });
    wrap.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeLauncher(); }
      trapTab(event, wrap.querySelector('.sn-launch-box'));
    });
    return { wrap, input, render };
  }

  function openLauncher(query = '') {
    if (!sidebarEl()) return;
    if (!launcher) launcher = buildLauncher();
    if (!launcher.wrap.hidden) { launcher.input.focus(); return; }
    if (document.body.classList.contains('admin-nav-open') && isOverlay()) setOpen(false);
    if (isFlyOpen()) closeFly();
    launcher.returnFocus = document.activeElement;
    launcher.wrap.hidden = false;
    document.body.classList.add('sn-launch-open');
    launcher.input.value = query || '';
    launcher.render();
    launcher.input.focus();
  }

  function closeLauncher() {
    if (!launcher || launcher.wrap.hidden) return;
    launcher.wrap.hidden = true;
    document.body.classList.remove('sn-launch-open');
    const back = launcher.returnFocus;
    launcher.returnFocus = null;
    if (back && document.contains(back)) back.focus?.();
  }

  function isTypingTarget(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(el.closest?.('.gjs-frame, [contenteditable="true"]'));
  }

  /* ---------- link wiring + current-state sync ---------- */
  function wireAdminNavLinks(sidebar) {
    sidebar.addEventListener('click', (event) => {
      const item = event.target.closest('[data-nav-item], [data-sponsor-nav]');
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

  /* admin.js marks the active tab with .active; mirror it to aria-current="page". */
  function syncCurrent(sidebar) {
    const items = [...sidebar.querySelectorAll('[data-nav-item]')];
    const sync = () => {
      const actives = items.filter((el) => el.classList.contains('active'));
      if (!actives.length) return;
      const pick = actives.find((el) => !el.dataset.navExtra) || actives[0];
      items.forEach((el) => {
        if (el === pick) el.setAttribute('aria-current', 'page');
        else { el.removeAttribute('aria-current'); el.classList.remove('active'); }
      });
      const secKey = pick.dataset.navItem === 'dashboard' ? '' : (pick.closest('.sn-section')?.dataset.navSection || '');
      document.querySelectorAll('[data-sn-rail] .sn-rail-btn, .sn-bottom .sn-bb-btn').forEach((b) => {
        const on = b.dataset.railItem === pick.dataset.navItem || (secKey && b.dataset.railSection === secKey && !b.dataset.railItem) || (secKey && b.dataset.railItem && b.dataset.railSection === secKey);
        if (b.closest('.sn-bottom')) {
          if (b.dataset.railItem || b.dataset.snSheetSection) b.classList.toggle('sn-bb-current', b.dataset.railItem ? b.dataset.railItem === pick.dataset.navItem : Boolean(secKey));
        } else b.classList.toggle('sn-rail-current', Boolean(on));
      });
    };
    const obs = new MutationObserver(() => { obs.disconnect(); sync(); items.forEach((el) => obs.observe(el, { attributes: true, attributeFilter: ['class'] })); });
    items.forEach((el) => obs.observe(el, { attributes: true, attributeFilter: ['class'] }));
  }

  /* ---------- 14d-1 rail + flyout ---------- */
  const railEl = () => document.querySelector('[data-sn-rail]');
  const isFlyOpen = () => document.body.classList.contains('sn-fly');

  function openFly(key, btn, { focusFirst = false } = {}) {
    const sidebar = sidebarEl();
    if (!sidebar || isOverlay()) return;
    sidebar.dataset.snFly = key;
    sidebar.querySelectorAll('.sn-section').forEach((sec) => sec.classList.toggle('sn-fly-on', sec.dataset.navSection === key));
    sidebar.classList.toggle('sn-fly-account', key === 'account');
    sidebar.removeAttribute('inert');
    const label = btn?.dataset.snTip || key;
    sidebar.setAttribute('aria-label', `${label} menu`);
    document.querySelectorAll('[data-sn-fly-key]').forEach((b) => b.setAttribute('aria-expanded', String(b === btn)));
    document.querySelectorAll('.sn-rail-btn.sn-rail-open').forEach((b) => b.classList.remove('sn-rail-open'));
    btn?.classList.add('sn-rail-open');
    flyBtn = btn || null;
    document.body.classList.add('sn-fly');
    hideTip();
    if (focusFirst) {
      const first = key === 'account'
        ? sidebar.querySelector('.sn-foot button')
        : sidebar.querySelector(`.sn-section[data-nav-section="${key}"] [data-nav-item]`);
      window.setTimeout(() => first?.focus(), 0);
    }
  }

  function closeFly({ returnFocus = false } = {}) {
    const sidebar = sidebarEl();
    if (!isFlyOpen()) return;
    document.body.classList.remove('sn-fly');
    if (sidebar) {
      delete sidebar.dataset.snFly;
      sidebar.classList.remove('sn-fly-account');
      sidebar.querySelectorAll('.sn-fly-on').forEach((sec) => sec.classList.remove('sn-fly-on'));
      sidebar.setAttribute('aria-label', 'Site Studio menu');
    }
    document.querySelectorAll('[data-sn-fly-key]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    document.querySelectorAll('.sn-rail-open').forEach((b) => b.classList.remove('sn-rail-open'));
    const back = flyBtn;
    flyBtn = null;
    if (returnFocus) back?.focus();
  }

  /* One fixed tooltip, placed right of the rail - or right of the flyout when one is open - so it never covers the panel. */
  function showTip(btn) {
    if (isOverlay() || !btn?.dataset.snTip) return;
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'sn-tip';
      tipEl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(tipEl);
    }
    if (btn.classList.contains('sn-rail-open')) { hideTip(); return; }
    const rect = btn.getBoundingClientRect();
    const rail = railEl()?.getBoundingClientRect();
    const panel = isFlyOpen() ? sidebarEl()?.getBoundingClientRect() : null;
    const left = Math.max(rail ? rail.right : rect.right, panel ? panel.right : 0) + 8;
    tipEl.textContent = btn.dataset.snTip;
    tipEl.style.left = `${left}px`;
    tipEl.style.top = `${rect.top + rect.height / 2}px`;
    tipEl.hidden = false;
  }
  function hideTip() { if (tipEl) tipEl.hidden = true; }

  function initRail(sidebar) {
    const rail = railEl();
    if (!rail) return;
    const buttons = () => [...rail.querySelectorAll('.sn-rail-logo, .sn-rail-btn')];
    rail.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-rail-tab]');
      if (link) {
        const item = sidebar.querySelector(`.admin-menu [data-tab="${link.dataset.railTab}"]`);
        if (item && document.getElementById(`tab-${link.dataset.railTab}`)) { event.preventDefault(); closeFly(); item.click(); return; }
      }
      const btn = event.target.closest('[data-sn-fly-key]');
      if (!btn) return;
      event.stopPropagation();
      if (btn.classList.contains('sn-rail-open')) closeFly();
      else openFly(btn.dataset.snFlyKey, btn, { focusFirst: event.detail === 0 });
    });
    rail.addEventListener('keydown', (event) => {
      const list = buttons();
      const idx = list.indexOf(document.activeElement);
      if (idx < 0) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = list[(idx + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
        next.focus();
      } else if (event.key === 'ArrowRight' && document.activeElement.dataset.snFlyKey) {
        event.preventDefault();
        openFly(document.activeElement.dataset.snFlyKey, document.activeElement, { focusFirst: true });
      } else if (event.key === 'Home') { event.preventDefault(); list[0].focus(); }
      else if (event.key === 'End') { event.preventDefault(); list[list.length - 1].focus(); }
    });
    rail.addEventListener('mouseover', (event) => { const b = event.target.closest('[data-sn-tip]'); if (b) showTip(b); });
    rail.addEventListener('mouseleave', hideTip);
    rail.addEventListener('focusin', (event) => { const b = event.target.closest('[data-sn-tip]'); if (b && b.matches(':focus-visible')) showTip(b); });
    rail.addEventListener('focusout', hideTip);
    sidebar.addEventListener('keydown', (event) => {
      if (!isFlyOpen()) return;
      if (event.key === 'ArrowLeft' && !isTypingTarget(event.target)) { event.preventDefault(); closeFly({ returnFocus: true }); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const links = focusables(sidebar).filter((el) => el.matches('[data-nav-item], .sn-foot button'));
        const i = links.indexOf(document.activeElement);
        if (i < 0) return;
        event.preventDefault();
        links[(i + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length].focus();
      }
    });
    sidebar.querySelector('[data-sn-fly-close]')?.addEventListener('click', () => closeFly({ returnFocus: true }));
    document.addEventListener('pointerdown', (event) => {
      if (!isFlyOpen()) return;
      if (sidebar.contains(event.target) || rail.contains(event.target)) return;
      closeFly();
    }, true);
    document.addEventListener('focusin', (event) => {
      if (!isFlyOpen()) return;
      if (sidebar.contains(event.target) || rail.contains(event.target) || event.target.closest?.('.sn-launch')) return;
      closeFly();
    });
    window.addEventListener('resize', hideTip);
    window.addEventListener('scroll', hideTip, true);
  }

  function setBadge(key, count) {
    const sectionKey = key.split('-')[0];
    const dot = document.querySelector(`[data-sn-dot="${sectionKey}"]`);
    if (dot) dot.hidden = !(Number(count) > 0);
    const badge = document.querySelector(`[data-sn-badge="${key}"]`);
    if (!badge) return;
    const n = Number(count) || 0;
    badge.hidden = n <= 0;
    badge.textContent = n > 0 ? String(n) : '';
    if (n > 0) badge.setAttribute('aria-label', `${n} new`);
  }

  function init() {
    const sidebar = sidebarEl();
    const toggle = document.querySelector('.admin-nav-toggle');
    if (!sidebar || sidebar.dataset.snBound === '1') return;
    sidebar.dataset.snBound = '1';
    try { localStorage.removeItem('efhsAdminNavGroups'); localStorage.removeItem('efhsAdminNavOpen'); } catch { /* private mode */ }

    setOpen(false);
    toggle?.addEventListener('click', (event) => {
      event.stopPropagation();
      setOpen(!document.body.classList.contains('admin-nav-open'));
    });
    document.querySelector('[data-admin-nav-close]')?.addEventListener('click', () => setOpen(false));
    document.querySelector('[data-admin-nav-backdrop]')?.addEventListener('click', () => setOpen(false));
    document.querySelectorAll('[data-sn-launch]').forEach((btn) => btn.addEventListener('click', () => {
      openLauncher();
    }));

    document.querySelectorAll('[data-sn-sheet-section]').forEach((btn) => btn.addEventListener('click', (event) => {
      event.stopPropagation();
      setOpen(true);
      const sec = sidebar.querySelector(`.sn-section[data-nav-section="${btn.dataset.snSheetSection}"]`);
      window.setTimeout(() => sec?.scrollIntoView?.({ block: 'start' }), reducedMotion() ? 0 : 60);
    }));
    sidebar.addEventListener('keydown', (event) => {
      if (isOverlay() && document.body.classList.contains('admin-nav-open')) trapTab(event, sidebar);
    });
    document.addEventListener('keydown', (event) => {
      const key = event.key;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === 'k' || key === 'K')) {
        event.preventDefault();
        openLauncher();
        return;
      }
      if (key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        openLauncher();
        return;
      }
      if (key === 'Escape' && isFlyOpen() && (!launcher || launcher.wrap.hidden)) {
        event.preventDefault();
        closeFly({ returnFocus: true });
        return;
      }
      if (key === 'Escape' && isOverlay() && document.body.classList.contains('admin-nav-open') && (!launcher || launcher.wrap.hidden)) {
        setOpen(false);
      }
    });
    sidebar.addEventListener('click', (event) => {
      if (!isOverlay()) {
        if (event.target.closest('.sn-nav a[href]')) window.setTimeout(() => closeFly(), 0);
        return;
      }
      const target = event.target.closest('a[href]');
      if (target && target.closest('.sn-nav')) window.setTimeout(() => setOpen(false), 0);
    });

    initNavSearch(sidebar);
    initRail(sidebar);
    wireAdminNavLinks(sidebar);
    syncCurrent(sidebar);
    if (isStandaloneAdminPage()) {
      const markByLocation = () => {
        const here = window.location.pathname + window.location.hash;
        const items = [...sidebar.querySelectorAll('[data-nav-item]')];
        const best = items
          .filter((el) => { const h = el.getAttribute('href') || ''; return h.startsWith('/admin/') && (here === h || (h.includes('#') && here.startsWith(h))); })
          .sort((x, y) => y.getAttribute('href').length - x.getAttribute('href').length)[0];
        if (best && !best.classList.contains('active')) best.classList.add('active');
      };
      markByLocation();
      window.addEventListener('hashchange', () => {
        const here = window.location.pathname + window.location.hash;
        sidebar.querySelectorAll('[data-nav-item].active').forEach((el) => {
          const h = el.getAttribute('href') || '';
          if (h.startsWith(window.location.pathname) && !(here === h || (h.includes('#') && here.startsWith(h)))) el.classList.remove('active');
        });
        markByLocation();
        const anyActive = sidebar.querySelector('[data-nav-item].active');
        if (!anyActive) sidebar.querySelector(`[data-nav-item][href="${window.location.pathname}"]`)?.classList.add('active');
      });
    }
    window.matchMedia(OVERLAY_MQ).addEventListener('change', () => { closeFly(); hideTip(); setOpen(false); });
  }

  window.efhsAdminNav = {
    init,
    open() { setOpen(true); },
    close() { setOpen(false); },
    toggle() { setOpen(!document.body.classList.contains('admin-nav-open')); },
    isOpen() { return document.body.classList.contains('admin-nav-open'); },
    isOverlay,
    revealOverlaySubmenus() { /* flat menu: nothing to reveal */ },
    notifyLayout,
    openLauncher,
    closeLauncher,
    setBadge,
    openFly(key) { openFly(key, document.querySelector(`[data-sn-fly-key="${key}"]`)); },
    closeFly,
    isFlyOpen,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
