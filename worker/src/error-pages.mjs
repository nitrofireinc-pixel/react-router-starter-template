/**
 * Public error pages (404/403/401/500/503/429).
 * Full chrome for 4xx document pages; D1-free lite shell for 5xx/429.
 * Copy overrides live on the cached `site` read (`error_pages` JSON).
 */

export const DEFAULT_INSTAGRAM_HREF = 'https://www.instagram.com/efblueregiment';

export const ERROR_STATUS_CODES = Object.freeze([404, 403, 401, 500, 503, 429]);

export const ERROR_DEFAULTS = Object.freeze({
  404: {
    title: 'Page Not Found',
    copy: 'Looks like this page marched off the field.',
    link_label: 'View Calendar',
    link_href: '/calendar.html',
    doc: 'Page not found',
    shell: 'full',
  },
  403: {
    title: 'Access Denied',
    copy: 'That area is backstage. Ask a director if you need access.',
    link_label: 'Contact the Band',
    link_href: '/contact.html',
    doc: 'Access denied',
    shell: 'full',
  },
  401: {
    title: 'Sign-In Needed',
    copy: 'Check in at the gate first. Please sign in to continue.',
    link_label: 'Staff Login',
    link_href: '/admin/login?next={path}',
    doc: 'Sign-in needed',
    shell: 'full',
  },
  500: {
    title: 'Server Error',
    copy: 'We hit a wrong note on our end. Please try again in a moment.',
    link_label: 'Try Again',
    link_href: '{path}',
    doc: 'Server error',
    shell: 'lite',
  },
  503: {
    title: 'Back Shortly',
    copy: 'We are tuning up the site. Please check back soon.',
    link_label: 'Follow on Instagram',
    link_href: DEFAULT_INSTAGRAM_HREF,
    doc: 'Temporarily unavailable',
    shell: 'lite',
    retryAfter: 600,
  },
  429: {
    title: 'Too Many Requests',
    copy: 'Whoa, double time! Wait a minute, then try again.',
    link_label: 'Try Again',
    link_href: '{path}',
    doc: 'Too many requests',
    shell: 'lite',
    retryAfter: 60,
  },
});

export const DEFAULT_ERROR_PAGES = Object.fromEntries(
  ERROR_STATUS_CODES.map((code) => {
    const row = ERROR_DEFAULTS[code];
    return [String(code), {
      title: row.title,
      copy: row.copy,
      link_label: row.link_label,
      link_href: row.link_href,
    }];
  }),
);

const ICON_HOME = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 3 2 11.2l1.3 1.6L5 11.4V20h5.5v-5.5h3V20H19v-8.6l1.7 1.4 1.3-1.6z"/></svg>';
const ICON_CAL = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
const ICON_CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6"><path d="m9 6 6 6-6 6"/></svg>';

const LITE_BAR_CSS = `*{box-sizing:border-box} html,body{margin:0} body{font-family:"Work Sans",system-ui,sans-serif;background:#001326;min-height:100vh;display:flex;flex-direction:column} main{flex:1;display:flex;flex-direction:column} main>.err-hero{flex:1}
.lite-bar{background:linear-gradient(180deg,#01244A,#002142);border-bottom:3px solid #FDD703}
.lite-bar a{display:flex;align-items:center;gap:12px;width:min(1180px,calc(100% - 40px));margin:0 auto;padding:12px 0;color:#fff;text-decoration:none}
.lite-bar img{height:40px;width:auto}
.lite-bar span{font:700 1.2rem/1 "Oswald",Impact,sans-serif;text-transform:uppercase;letter-spacing:.02em}
.lite-bar small{display:block;font-size:.8rem;letter-spacing:.06em}
.lite-foot{background:#001326;color:#b8c8dc;font-size:.86rem}
.lite-foot div{width:min(1180px,calc(100% - 40px));margin:0 auto;padding:22px 0;display:flex;flex-wrap:wrap;gap:6px 22px;justify-content:space-between}
.lite-foot b{color:#fff} .lite-foot a{color:#fff}`;

export const ERROR_PAGE_INLINE_CSS = `/* inlined from /error-page.css for the D1-free lite shell */
.err-hero{--err-navy:#002142;--err-navy-2:#014990;--err-blue:#0b63d6;--err-gold:#FDD703;--err-ink:#24364d;position:relative;overflow:hidden;isolation:isolate;min-height:560px;display:flex;align-items:center;background:radial-gradient(120% 90% at 78% 40%,#f3f7fd 0%,rgba(243,247,253,0) 60%),linear-gradient(180deg,#f7faff 0%,#e7eff9 100%);color:var(--err-ink);padding:0;margin:0}
.err-title,.err-copy{text-wrap:balance}
body.efhs-theme main section.err-hero,main section.err-hero{padding:0}
.err-photo{position:absolute;z-index:-2;top:0;right:0;bottom:0;width:60%;background:var(--err-photo,url("/assets/error/instrument-hero.webp")) right center/cover no-repeat;-webkit-mask-image:linear-gradient(90deg,transparent 0%,#000 34%),linear-gradient(0deg,transparent 0%,#000 22%);-webkit-mask-composite:source-in;mask-image:linear-gradient(90deg,transparent 0%,#000 34%),linear-gradient(0deg,transparent 0%,#000 22%);mask-composite:intersect}
.err-stage{position:absolute;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(38% 55% at 70% 0%,rgba(255,255,255,.75),rgba(255,255,255,0) 70%),radial-gradient(26% 40% at 84% 58%,rgba(253,215,3,.20),rgba(253,215,3,0) 70%),radial-gradient(60% 70% at 12% 100%,rgba(1,73,144,.10),rgba(1,73,144,0) 70%)}
.err-stage::before,.err-stage::after{content:"";position:absolute;top:-12%;height:135%;width:190px;background:linear-gradient(180deg,rgba(255,255,255,.9),rgba(255,255,255,0) 85%);filter:blur(16px);opacity:.55;transform-origin:top center;mix-blend-mode:screen}
.err-stage::before{left:52%;transform:rotate(-17deg)}
.err-stage::after{left:76%;width:150px;transform:rotate(14deg);opacity:.45}
.err-inner{position:relative;width:min(1180px,calc(100% - 64px));margin:0 auto;padding:64px 0 72px}
.err-content{max-width:560px}
.err-mark{display:block;width:92px;height:92px;margin:0 0 6px;filter:drop-shadow(0 8px 18px rgba(0,33,66,.22))}
.err-code{margin:0;font:700 clamp(7rem,15vw,13.5rem)/.88 "Oswald",Impact,"Arial Narrow",sans-serif;letter-spacing:-.01em;background:linear-gradient(180deg,var(--err-navy-2) 0%,var(--err-navy) 78%);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 18px 40px rgba(0,33,66,.10)}
.err-rule{display:block;width:110px;height:6px;margin:18px 0 18px;border-radius:3px;background:var(--err-gold);box-shadow:0 0 0 1px rgba(160,128,0,.18)}
.err-title{margin:0;font:600 clamp(2.1rem,3.6vw,3.3rem)/1.02 "Oswald",Impact,"Arial Narrow",sans-serif;text-transform:uppercase;letter-spacing:.02em;color:var(--err-navy)}
.err-copy{margin:14px 0 0;font:500 1.22rem/1.45 "Work Sans",system-ui,sans-serif;color:var(--err-ink)}
.err-detail{margin:8px 0 0;font:500 1rem/1.4 "Work Sans",system-ui,sans-serif;color:#5b6472}
.err-actions{display:flex;flex-wrap:wrap;align-items:center;gap:14px 30px;margin-top:30px}
.err-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:50px;padding:13px 26px;border-radius:4px;background:var(--err-blue);border:2px solid var(--err-blue);color:#fff;text-decoration:none;font:800 .86rem/1 "Work Sans",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;box-shadow:0 12px 26px rgba(11,99,214,.25)}
.err-btn:hover{background:#094fb0;border-color:#094fb0}
.err-btn svg,.err-link svg{width:18px;height:18px;flex:0 0 auto}
.err-link{display:inline-flex;align-items:center;gap:8px;color:var(--err-navy-2);text-decoration:none;font:800 .86rem/1 "Work Sans",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase}
.err-link:hover{color:var(--err-blue);text-decoration:underline;text-underline-offset:4px}
.err-btn:focus-visible,.err-link:focus-visible{outline:3px solid var(--err-gold);outline-offset:3px}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:760px){.err-hero{min-height:0;display:block;text-align:center}.err-photo{position:relative;display:block;width:calc(100% + 40px);height:250px;margin:0;background-image:var(--err-photo-sm,url("/assets/error/instrument-hero-480.webp"));background-position:72% 46%;-webkit-mask-image:linear-gradient(0deg,transparent 0%,#000 45%),linear-gradient(90deg,transparent 0%,#000 30%);mask-image:linear-gradient(0deg,transparent 0%,#000 45%),linear-gradient(90deg,transparent 0%,#000 30%)}.err-stage::before{left:38%;width:120px}.err-stage::after{left:74%;width:100px}.err-inner{width:calc(100% - 40px);padding:0 0 48px;margin-top:-108px}.err-content{max-width:none}.err-mark{width:76px;height:76px;margin:0 auto 4px}.err-code{font-size:7.6rem}.err-rule{margin:14px auto}.err-title{font-size:2.15rem}.err-copy{font-size:1.06rem;margin-top:10px}.err-actions{flex-direction:column;gap:18px;margin-top:24px}.err-btn{width:100%;max-width:320px}}
@media (prefers-reduced-motion:no-preference){.err-stage::before{animation:errSweep 9s ease-in-out infinite alternate}}
@keyframes errSweep{from{transform:rotate(-17deg)}to{transform:rotate(-9deg)}}`;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

export function sanitizeErrorText(value, fallback = '', max = 240) {
  const text = String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  return text.slice(0, max);
}

export function sanitizeErrorHref(value, fallback = '/') {
  const href = String(value || '').trim();
  if (!href) return fallback;
  if (/^\s*javascript:/i.test(href) || /^\s*data:/i.test(href) || /^\s*vbscript:/i.test(href)) return fallback;
  if (href === '{path}' || href.includes('{path}')) return href;
  if (href.startsWith('/') && !href.startsWith('//')) return href.split('#')[0];
  if (/^https?:\/\//i.test(href)) return href;
  if (href === '#retry' || href === '#') return href;
  return fallback;
}

export function safeRequestPath(urlOrPath = '/') {
  if (urlOrPath && typeof urlOrPath === 'object' && urlOrPath.pathname) {
    return `${urlOrPath.pathname || '/'}${urlOrPath.search || ''}`;
  }
  const raw = String(urlOrPath || '/').trim();
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || raw.includes('\n')) return '/';
  return raw.split('#')[0] || '/';
}

export function resolveErrorHref(href, path = '/') {
  const requestPath = safeRequestPath(path);
  const raw = String(href || '/');
  if (raw === '{path}') return requestPath;
  if (raw.includes('{path}')) return raw.replaceAll('{path}', encodeURIComponent(requestPath));
  return raw;
}

function parseErrorPagesValue(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeErrorPages(value) {
  const source = parseErrorPagesValue(value);
  const out = {};
  for (const code of ERROR_STATUS_CODES) {
    const defaults = ERROR_DEFAULTS[code];
    const row = source[code] || source[String(code)] || {};
    out[String(code)] = {
      title: sanitizeErrorText(row.title, defaults.title, 80),
      copy: sanitizeErrorText(row.copy, defaults.copy, 280),
      link_label: sanitizeErrorText(row.link_label, defaults.link_label, 80),
      link_href: sanitizeErrorHref(row.link_href, defaults.link_href),
    };
  }
  return out;
}

export function instagramHrefFromSite(site = {}) {
  let items = site?.social_links;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { items = []; }
  }
  if (Array.isArray(items)) {
    const hit = items.find((item) => String(item?.platform || item?.id || '').toLowerCase() === 'instagram');
    const href = sanitizeErrorHref(hit?.href || hit?.url || '', '');
    if (href) return href;
  }
  return DEFAULT_INSTAGRAM_HREF;
}

export function mergeErrorCopy(status, site = {}, { path = '/', instagramHref = '', detail = '' } = {}) {
  const code = Number(status);
  const defaults = ERROR_DEFAULTS[code] || ERROR_DEFAULTS[404];
  const pages = normalizeErrorPages(site?.error_pages);
  const row = pages[String(code)] || pages[code] || {};
  let href = row.link_href || defaults.link_href;
  if (code === 503) {
    const social = instagramHref || instagramHrefFromSite(site) || DEFAULT_INSTAGRAM_HREF;
    href = (row.link_href && row.link_href !== DEFAULT_INSTAGRAM_HREF) ? row.link_href : social;
  }
  href = resolveErrorHref(href, path);
  return {
    status: ERROR_DEFAULTS[code] ? code : 404,
    title: row.title || defaults.title,
    copy: row.copy || defaults.copy,
    link_label: row.link_label || defaults.link_label,
    link_href: href,
    doc: defaults.doc,
    shell: defaults.shell,
    retryAfter: defaults.retryAfter,
    detail: sanitizeErrorText(detail, '', 200),
  };
}

export function errorPageHeaders(status, { retryAfter } = {}) {
  const headers = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex',
  };
  const seconds = Number(retryAfter);
  if ((status === 503 || status === 429) && Number.isFinite(seconds) && seconds > 0) {
    headers['retry-after'] = String(Math.round(seconds));
  }
  return headers;
}

export function errorHeroHtml(status, copy, { markSrc = '/assets/efhs-blue-regiment-mark.png' } = {}) {
  const code = Number(copy?.status || status);
  const href = copy?.link_href || '/';
  const calendarIcon = href.includes('/calendar.html') ? ICON_CAL : '';
  const detail = copy?.detail
    ? `<p class="err-detail">${escapeHtml(copy.detail)}</p>`
    : '';
  return `<section class="err-hero err-${code}" aria-labelledby="err-title" data-error-status="${code}">
  <div class="err-photo" role="presentation"></div>
  <div class="err-stage" aria-hidden="true"></div>
  <div class="err-inner"><div class="err-content">
    <img class="err-mark" src="${escapeAttr(markSrc)}" alt="East Forsyth Blue Regiment" width="92" height="92">
    <p class="err-code"><span class="sr-only">Error </span>${code}</p>
    <span class="err-rule" aria-hidden="true"></span>
    <h1 class="err-title" id="err-title">${escapeHtml(copy.title)}</h1>
    <p class="err-copy">${escapeHtml(copy.copy)}</p>
    ${detail}
    <div class="err-actions">
      <a class="err-btn" href="/">${ICON_HOME}Return Home</a>
      <a class="err-link" href="${escapeAttr(href)}">${calendarIcon}${escapeHtml(copy.link_label)}${ICON_CHEV}</a>
    </div>
  </div></div>
</section>`;
}

function maintenancePollScript() {
  return `<script>
(function () {
  async function leaveIfLive() {
    try {
      const response = await fetch('/api/site', { cache: 'no-store' });
      if (!response.ok) return;
      const site = await response.json();
      const enabled = site && (site.maintenance_mode === true || site.maintenance_mode === 1 || site.maintenance_mode === '1');
      if (!enabled) window.location.reload();
    } catch (_) {}
  }
  leaveIfLive();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') leaveIfLive();
  });
  setInterval(leaveIfLive, 15000);
})();
</script>`;
}

export function renderLiteErrorHtml(status, copy, {
  markSrc = '/assets/efhs-blue-regiment-mark.png',
  logoSrc = '/assets/efhs-logo.png',
  instagramHref = DEFAULT_INSTAGRAM_HREF,
  pollMaintenance = false,
} = {}) {
  const code = Number(copy?.status || status);
  const title = copy?.doc || ERROR_DEFAULTS[code]?.doc || 'Error';
  const ig = sanitizeErrorHref(instagramHref, DEFAULT_INSTAGRAM_HREF);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)} | East Forsyth Blue Regiment Band</title><meta name="theme-color" content="#002142">
<link rel="icon" href="${escapeAttr(logoSrc)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@600;700&family=Work+Sans:wght@500;800&display=swap" rel="stylesheet">
<style>
${LITE_BAR_CSS}
${ERROR_PAGE_INLINE_CSS}
</style></head><body class="error-page error-${code} lite">
<header class="lite-bar"><a href="/"><img src="${escapeAttr(logoSrc)}" alt="East Forsyth Eagles logo"><span><small>East Forsyth</small>Blue Regiment Band</span></a></header>
<main id="main">${errorHeroHtml(code, copy, { markSrc })}</main>
<footer class="lite-foot"><div><span><b>East Forsyth Blue Regiment Band</b></span><span>Band office: (336) 703-6735 &middot; <a href="${escapeAttr(ig)}">Instagram</a></span></div></footer>
${pollMaintenance || code === 503 ? maintenancePollScript() : ''}
</body></html>`;
}

export function wantsJsonRequest(request, pathname = '') {
  const path = pathname || (() => {
    try { return new URL(request?.url || 'https://efhsband.org/').pathname; } catch { return ''; }
  })();
  if (path === '/health' || path.startsWith('/api/') || path.startsWith('/api')) return true;
  const accept = String(request?.headers?.get?.('accept') || '').toLowerCase();
  if (accept.includes('application/json') && !accept.includes('text/html')) return true;
  return false;
}

export function errorShellFor(status) {
  return ERROR_DEFAULTS[Number(status)]?.shell || 'full';
}
