/**
 * Lightweight CMS device forensics for the Security log.
 * No third-party UA parsers. Must stay well under the Workers 10ms CPU budget.
 */

export const DEVICE_CLIENT_MAX_JSON = 800;
export const ADMIN_CLIENT_HINT_ACCEPT = 'Sec-CH-UA, Sec-CH-UA-Mobile, Sec-CH-UA-Platform';

const NOT_A_BRAND = /not[.\s_-]*a[.\s_-]*brand/i;
const GENERIC_BRANDS = new Set(['chromium', 'grease', 'gecko', 'webkit']);

function clip(value, max) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function intInRange(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

function pairFrom(raw, fallbackW, fallbackH) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && /^\d{1,5}x\d{1,5}$/.test(raw.trim())) {
    return raw.trim().split('x');
  }
  return [fallbackW, fallbackH];
}

function versionMajorMinor(raw = '') {
  const match = String(raw || '').match(/(\d+)(?:[._](\d+))?/);
  if (!match) return '';
  return match[2] == null ? match[1] : `${match[1]}.${match[2]}`;
}

export function parseSecChUa(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const brands = [];
  const re = /"([^"]+)"\s*;\s*v="([^"]+)"/g;
  let match = re.exec(raw);
  while (match) {
    const name = clip(match[1], 40);
    const version = clip(match[2], 20);
    if (name) brands.push({ name, version });
    match = re.exec(raw);
  }
  return brands;
}

export function preferredClientHintBrand(brands = []) {
  const list = Array.isArray(brands) ? brands : [];
  const meaningful = list.filter((item) => {
    const name = String(item?.name || '');
    return name && !NOT_A_BRAND.test(name) && !GENERIC_BRANDS.has(name.toLowerCase());
  });
  return meaningful[0] || list.find((item) => !NOT_A_BRAND.test(item?.name || '')) || null;
}

export function parseClientHintMobile(value = '') {
  const raw = String(value || '').trim();
  if (raw === '?1' || raw === '1' || raw.toLowerCase() === 'true') return true;
  if (raw === '?0' || raw === '0' || raw.toLowerCase() === 'false') return false;
  return null;
}

export function parseUserAgentDevice(userAgent = '', hints = {}) {
  const ua = clip(userAgent, 400);
  const brands = Array.isArray(hints.brands) ? hints.brands : parseSecChUa(hints.ua || hints.secChUa || '');
  const chMobile = hints.mobile == null ? parseClientHintMobile(hints.secChUaMobile) : hints.mobile;
  const chPlatform = clip(hints.platform || hints.secChUaPlatform || '', 40).replace(/^"|"$/g, '');

  let os = '';
  let os_version = '';
  let browser = '';
  let browser_version = '';
  let device_type = 'desktop';

  if (/bot|crawler|spider|preview/i.test(ua)) device_type = 'bot';
  else if (chMobile === true || /iPhone|iPod|Windows Phone|Mobile/i.test(ua) && !/iPad/i.test(ua)) device_type = 'mobile';
  else if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) device_type = 'tablet';

  if (chPlatform) {
    os = chPlatform === 'macOS' || chPlatform === 'Mac OS X' ? 'macOS' : chPlatform;
  }
  if (/iPhone|iPad|iPod/.test(ua)) {
    os = /iPad/.test(ua) ? 'iPadOS' : 'iOS';
    const ios = ua.match(/OS (\d+)[._](\d+)/);
    if (ios) os_version = `${ios[1]}.${ios[2]}`;
  } else if (/Android/.test(ua)) {
    os = os || 'Android';
    os_version = os_version || versionMajorMinor((ua.match(/Android (\d+[\d.]*)/) || [])[1]);
  } else if (/Windows NT 10/.test(ua)) {
    os = os || 'Windows';
    os_version = os_version || (/Windows NT 10.0/.test(ua) ? '10' : '');
  } else if (/Windows NT/.test(ua)) {
    os = os || 'Windows';
    const nt = ua.match(/Windows NT (\d+[\d.]*)/);
    os_version = os_version || versionMajorMinor(nt?.[1]);
  } else if (/Mac OS X/.test(ua)) {
    os = os || 'macOS';
    const mac = ua.match(/Mac OS X (\d+[._]\d+)/);
    os_version = os_version || versionMajorMinor((mac?.[1] || '').replace(/_/g, '.'));
  } else if (/CrOS/.test(ua)) {
    os = os || 'Chrome OS';
  } else if (/Linux/.test(ua)) {
    os = os || 'Linux';
  }

  const brand = preferredClientHintBrand(brands);
  if (brand) {
    browser = brand.name;
    browser_version = versionMajorMinor(brand.version);
  } else if (/Edg(?:e|A|iOS)?\//.test(ua)) {
    browser = 'Edge';
    browser_version = versionMajorMinor((ua.match(/Edg(?:e|A|iOS)?\/(\d+[\d.]*)/) || [])[1]);
  } else if (/OPR\//.test(ua)) {
    browser = 'Opera';
    browser_version = versionMajorMinor((ua.match(/OPR\/(\d+[\d.]*)/) || [])[1]);
  } else if (/SamsungBrowser\//.test(ua)) {
    browser = 'Samsung Internet';
    browser_version = versionMajorMinor((ua.match(/SamsungBrowser\/(\d+[\d.]*)/) || [])[1]);
  } else if (/Firefox|FxiOS/.test(ua)) {
    browser = 'Firefox';
    browser_version = versionMajorMinor((ua.match(/(?:Firefox|FxiOS)\/(\d+[\d.]*)/) || [])[1]);
  } else if (/Chrome|CriOS/.test(ua)) {
    browser = 'Chrome';
    browser_version = versionMajorMinor((ua.match(/(?:Chrome|CriOS)\/(\d+[\d.]*)/) || [])[1]);
  } else if (/Version\/\d.+\sSafari\//.test(ua) && !/Chrome|CriOS|Edg/.test(ua)) {
    browser = 'Safari';
    browser_version = versionMajorMinor((ua.match(/Version\/(\d+[\d.]*)/) || [])[1]);
  }

  if (chMobile === true) device_type = device_type === 'bot' ? 'bot' : 'mobile';
  if (chMobile === false && device_type === 'mobile' && /iPad|Tablet/i.test(ua)) device_type = 'tablet';

  return {
    os: clip(os, 40),
    os_version: clip(os_version, 20),
    browser: clip(browser, 40),
    browser_version: clip(browser_version, 20),
    device_type,
  };
}

export function requestClientHints(request) {
  if (!request?.headers?.get) return { ua: '', mobile: '', platform: '', brands: [] };
  const ua = request.headers.get('sec-ch-ua') || '';
  return {
    ua,
    mobile: request.headers.get('sec-ch-ua-mobile') || '',
    platform: String(request.headers.get('sec-ch-ua-platform') || '').replace(/^"|"$/g, ''),
    brands: parseSecChUa(ua),
  };
}

export function sanitizeClientDeviceSnapshot(raw) {
  try {
    let value = raw;
    if (value == null || value === '') return null;
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text || text.length > DEVICE_CLIENT_MAX_JSON) return null;
      value = JSON.parse(text);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const screen = pairFrom(value.screen, value.screen_w, value.screen_h);
    const viewport = pairFrom(value.viewport, value.viewport_w, value.viewport_h);
    const screen_w = intInRange(screen?.[0], 1, 20000);
    const screen_h = intInRange(screen?.[1], 1, 20000);
    const viewport_w = intInRange(viewport?.[0], 1, 20000);
    const viewport_h = intInRange(viewport?.[1], 1, 20000);
    const dprRaw = Number(value.dpr ?? value.devicePixelRatio);
    const dpr = Number.isFinite(dprRaw) && dprRaw >= 0.5 && dprRaw <= 8
      ? Math.round(dprRaw * 100) / 100
      : null;
    const tz = clip(value.tz || value.timeZone || value.timezone, 80);
    const language = clip(value.language || value.lang, 40);
    const platform = clip(value.platform, 80);
    const snapshot = {};
    if (screen_w && screen_h) snapshot.screen = `${screen_w}x${screen_h}`;
    if (viewport_w && viewport_h) snapshot.viewport = `${viewport_w}x${viewport_h}`;
    if (dpr != null) snapshot.dpr = dpr;
    if (tz && /^[A-Za-z_][A-Za-z0-9_+\-]*(?:\/[A-Za-z0-9_+\-]+)*$/.test(tz)) snapshot.tz = tz;
    if (language && /^[A-Za-z]{2,8}(?:[-_][A-Za-z0-9]{1,8})*$/.test(language)) snapshot.language = language;
    if (platform) snapshot.platform = platform;
    return Object.keys(snapshot).length ? snapshot : null;
  } catch {
    return null;
  }
}

export function compactSessionDevice(snapshot) {
  const clean = sanitizeClientDeviceSnapshot(snapshot);
  if (!clean) return null;
  const [sw, sh] = String(clean.screen || '').split('x').map(Number);
  const [vw, vh] = String(clean.viewport || '').split('x').map(Number);
  const packed = {};
  if (sw && sh) packed.s = [sw, sh];
  if (vw && vh) packed.v = [vw, vh];
  if (clean.dpr != null) packed.r = clean.dpr;
  if (clean.tz) packed.z = clean.tz;
  if (clean.language) packed.l = clean.language;
  if (clean.platform) packed.p = clean.platform;
  return Object.keys(packed).length ? packed : null;
}

export function expandSessionDevice(packed) {
  if (!packed || typeof packed !== 'object') return null;
  return sanitizeClientDeviceSnapshot({
    screen: packed.s || packed.screen,
    viewport: packed.v || packed.viewport,
    dpr: packed.r ?? packed.dpr,
    tz: packed.z || packed.tz,
    language: packed.l || packed.language,
    platform: packed.p || packed.platform,
  });
}

export function buildAuditDeviceMeta({
  request = null,
  userAgent = '',
  client = null,
  includeClient = false,
  sessionIdHash = '',
} = {}) {
  const ua = clip(userAgent || request?.headers?.get?.('user-agent') || '', 400);
  const hints = requestClientHints(request);
  const parsed = parseUserAgentDevice(ua, hints);
  const device = {
    ...parsed,
    user_agent: ua,
  };
  if (hints.ua || hints.mobile || hints.platform) {
    device.ch = {
      ua: clip(hints.ua, 200),
      mobile: clip(hints.mobile, 8),
      platform: clip(hints.platform, 40),
    };
  }
  const snapshot = sanitizeClientDeviceSnapshot(client);
  if (includeClient && snapshot) {
    device.client = snapshot;
  } else if (sessionIdHash) {
    device.client = { ref: String(sessionIdHash).slice(0, 64) };
  }
  return device;
}

export function formatAuditDeviceSummary(device = {}) {
  if (!device || typeof device !== 'object') return '';
  const parts = [];
  if (device.browser) parts.push([device.browser, device.browser_version].filter(Boolean).join(' '));
  if (device.os) parts.push([device.os, device.os_version].filter(Boolean).join(' '));
  if (device.device_type) parts.push(device.device_type);
  if (device.client?.ref) parts.push(`client via session ${String(device.client.ref).slice(0, 12)}`);
  else if (device.client?.screen || device.client?.tz) {
    if (device.client.screen) parts.push(`screen ${device.client.screen}`);
    if (device.client.viewport) parts.push(`viewport ${device.client.viewport}`);
    if (device.client.tz) parts.push(device.client.tz);
    if (device.client.language) parts.push(device.client.language);
  }
  return parts.join(' · ');
}

export function shouldRequestAdminClientHints(pathname = '') {
  const path = String(pathname || '');
  return path === '/admin' || path.startsWith('/admin/');
}
