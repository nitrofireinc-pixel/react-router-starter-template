// Search-engine metadata for public pages: titles, descriptions, canonical,
// Open Graph/Twitter, JSON-LD, robots.txt and sitemap.xml.
// Facts below come only from the site itself (contact page, social links).

export const SEO_ORIGIN = 'https://efhsband.org';
export const SEO_SHARE_IMAGE = '/assets/efhs-home-hero.jpg';
export const SEO_SHARE_IMAGE_WIDTH = 1468;
export const SEO_SHARE_IMAGE_HEIGHT = 788;
export const SEO_BRAND = "East Forsyth Blue Regiment";
export const SEO_ORG_NAME = "East Forsyth High School Band";
export const SEO_ALTERNATE_NAMES = Object.freeze(["East Forsyth Blue Regiment", "East Forsyth High School Band", "East Forsyth Band", "East Forsyth Band Boosters", "Blue Regiment"]);
export const SEO_AREAS = Object.freeze([
  { "@type": "City", name: "Kernersville, North Carolina" },
  { "@type": "City", name: "Walkertown, North Carolina" },
  { "@type": "Place", name: "Colfax, North Carolina" },
  { "@type": "City", name: "Winston-Salem, North Carolina" },
  { "@type": "AdministrativeArea", name: "Forsyth County, North Carolina" },
  { "@type": "Place", name: "Piedmont Triad, North Carolina" }
]);
export const SEO_SCHOOL = Object.freeze({
  name: "East Forsyth High School",
  streetAddress: "2500 W Mountain Street",
  addressLocality: "Kernersville",
  addressRegion: "NC",
  postalCode: "27284",
  addressCountry: "US",
  telephone: "+1-336-703-6735",
  district: "Winston-Salem/Forsyth County Schools"
});
const CORE_KEYWORDS = ["East Forsyth", "East Forsyth High School", "East Forsyth Blue Regiment", "Kernersville high school band", "Kernersville NC band", "Forsyth County band"];
const PLACE_KEYWORDS = ["Kernersville", "Walkertown", "Colfax", "Winston-Salem", "Forsyth County", "Piedmont Triad NC", "Winston-Salem/Forsyth County Schools"];
const GIVING = ["community donations", "donate to school band", "band fundraiser", "local nonprofit"];
const SPONSOR = ["local business sponsorship", "band sponsors", "community donations", "local nonprofit"];
const ENSEMBLE = ["high school marching band", "concert band", "jazz band", "color guard", "percussion"];
const YOUTH = ["music education", "youth arts", "student musicians"];
const DEWEYS = ["Dewey's Bakery fundraiser", "Dewey's cookies", "Moravian cookies fundraiser", "Dewey's frozen pies", "Kernersville Dewey's fundraiser"];
const EVENTS = ["Kernersville parade", "marching band competition", "football games"];
export const SEO_PAGE_KEYWORDS = Object.freeze({
  home: [...DEWEYS, "high school marching band", "concert band", "jazz band", "student musicians", ...GIVING.slice(0, 3)],
  ensembles: [...ENSEMBLE, ...YOUTH],
  calendar: [...EVENTS, "high school marching band", "concert band", "band fundraiser"],
  boosters: ["band boosters", "local nonprofit", "band fundraiser", "community donations", ...YOUTH],
  sponsors: [...SPONSOR, "band boosters"],
  "become-a-sponsor": [...SPONSOR, "donate to school band", "band fundraiser"],
  fundraising: [...DEWEYS, ...GIVING, "band boosters"],
  "in-kind": [...GIVING, "local business sponsorship"],
  gallery: [...EVENTS, "high school marching band", "color guard"],
  resources: [...YOUTH, "high school marching band"],
  directors: ["music education", ...ENSEMBLE.slice(0, 3)],
  contact: ["band boosters", "community donations", "local nonprofit"],
  "letterman-jacket": ["student musicians", "high school marching band"]
});
export function keywordsForSlug(slug) {
  const extra = SEO_PAGE_KEYWORDS[slug] || ["high school marching band", "student musicians", "community donations"];
  const out = [];
  for (const k of [...CORE_KEYWORDS, ...extra, ...PLACE_KEYWORDS]) {
    if (!out.includes(k)) out.push(k);
    if (out.length >= 27) break;
  }
  return out;
}
export const SEO_PAGE_DEFAULTS = Object.freeze({
  "home": {
    title: "East Forsyth Band Boosters | East Forsyth High School Band",
    description: "East Forsyth Blue Regiment, the East Forsyth High School Band, is a Kernersville high school band. Support Forsyth County students: donate or join a fundraiser."
  },
  "ensembles": {
    title: "Ensembles | East Forsyth Band Boosters",
    description: "East Forsyth Blue Regiment ensembles: marching, concert, jazz, percussion and color guard at the East Forsyth High School Band in Kernersville, NC."
  },
  "calendar": {
    title: "Calendar & Events | East Forsyth Band Boosters",
    description: "East Forsyth Blue Regiment calendar: East Forsyth High School Band concerts, games, competitions and fundraisers in Kernersville and Forsyth County, NC."
  },
  "boosters": {
    title: "Boosters | East Forsyth Band Boosters",
    description: "East Forsyth Blue Regiment Band Boosters support the East Forsyth High School Band in Kernersville, NC with meetings, officers, dues and volunteer help."
  },
  "sponsors": {
    title: "Our Sponsors | East Forsyth Band Boosters",
    description: "East Forsyth Blue Regiment sponsors: Kernersville and Forsyth County, NC businesses supporting the East Forsyth High School Band and its student musicians."
  },
  "become-a-sponsor": {
    title: "Become a Sponsor | East Forsyth Band Boosters",
    description: "East Forsyth Blue Regiment sponsorships: Bronze, Silver and Gold packages for Kernersville and Forsyth County firms backing the East Forsyth High School Band."
  },
  "fundraising": {
    title: "Donate & Fundraisers | East Forsyth Band Boosters",
    description: "Donate to the East Forsyth High School Band, Kernersville's high school band, or join our yearly Dewey's Bakery fundraiser to support the Blue Regiment."
  },
  "gallery": {
    title: "Photo Gallery | East Forsyth Band Boosters",
    description: "East Forsyth Blue Regiment photos: the East Forsyth High School Band at games, parades, concerts and competitions in Kernersville and Forsyth County, NC."
  },
  "resources": {
    title: "Student Resources | East Forsyth Band Boosters",
    description: "East Forsyth Blue Regiment student resources: forms, handbooks and schedules for East Forsyth High School Band families in Kernersville, Forsyth County, NC."
  },
  "contact": {
    title: "Contact | East Forsyth Band Boosters",
    description: "Contact the East Forsyth Blue Regiment, the East Forsyth High School Band in Kernersville, NC, about donations, sponsorships, events or joining the band."
  },
  "directors": {
    title: "Directors & Staff | East Forsyth Band Boosters",
    description: "East Forsyth Blue Regiment directors and staff lead the East Forsyth High School Band program in Kernersville, NC, serving student musicians in Forsyth County."
  },
  "in-kind": {
    title: "In-Kind Donations | East Forsyth Band Boosters",
    description: "East Forsyth Blue Regiment in-kind donations: offer goods or services to the East Forsyth High School Band. Kernersville and Forsyth County, NC donors welcome."
  },
  "letterman-jacket": {
    title: "Letterman Jackets | East Forsyth Band Boosters",
    description: "East Forsyth Blue Regiment letterman jacket order form for East Forsyth High School Band students and families in Kernersville and Forsyth County, NC."
  }
});
/** Slugs never listed in the sitemap (utility, error and private pages). */
const SITEMAP_EXCLUDED_SLUGS = new Set(['not-found', 'maintenance', 'dues-dev', 'sponsor-payment-complete', 'qr', 'caldev', 'coming-soon', 'index', 'letterman-jacket', 'letterman-jacket-v2', 'sitemap']);

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function normalizePageSeo(value) {
  let raw = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw || '{}'); } catch { raw = {}; }
  }
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [slug, entry] of Object.entries(raw)) {
    const key = String(slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80);
    if (!key || !entry || typeof entry !== 'object') continue;
    const title = String(entry.title || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    const description = String(entry.description || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (title || description) out[key] = { title, description };
    if (Object.keys(out).length >= 200) break;
  }
  return out;
}

function pageSlug(page) {
  if (!page) return '';
  if (page.is_home || page.slug === 'home') return 'home';
  return String(page.slug || '').toLowerCase();
}

export function canonicalPath(page) {
  if (pageSlug(page) === 'home') return '/';
  const path = String(page?.path || `/${page?.slug || ''}.html`);
  return path.startsWith('/') ? path : `/${path}`;
}

export function resolvePageSeo(page, site = {}) {
  const slug = pageSlug(page);
  const custom = normalizePageSeo(site.page_seo)[slug] || {};
  const defaults = SEO_PAGE_DEFAULTS[slug] || {};
  const name = String(page?.title || 'Page');
  return {
    slug,
    title: custom.title || defaults.title || `${name} | East Forsyth Band Boosters`,
    description: custom.description || defaults.description || `${SEO_BRAND}: ${name} from the East Forsyth High School Band and Band Boosters in Kernersville, Forsyth County, NC.`,
  };
}

function sameAsFromSite(site = {}) {
  let links = site.social_links;
  if (typeof links === 'string') {
    try { links = JSON.parse(links); } catch { links = []; }
  }
  return (Array.isArray(links) ? links : [])
    .map((l) => String(l?.href || '').trim())
    .filter((href) => /^https:\/\/[^\s"<>]+$/i.test(href) && !href.includes('…'))
    .map((href) => href.replace(/\?.*$/, ''));
}

const schoolAddress = () => ({
  '@type': 'PostalAddress',
  streetAddress: SEO_SCHOOL.streetAddress,
  addressLocality: SEO_SCHOOL.addressLocality,
  addressRegion: SEO_SCHOOL.addressRegion,
  postalCode: SEO_SCHOOL.postalCode,
  addressCountry: SEO_SCHOOL.addressCountry,
});

export function organizationJsonLd(site = {}) {
  const logo = String(site.logo_url || '/assets/efhs-logo.png');
  const sameAs = sameAsFromSite(site);
  const data = {
    '@context': 'https://schema.org',
    '@type': ['MusicGroup', 'NGO'],
    '@id': `${SEO_ORIGIN}/#organization`,
    name: SEO_ORG_NAME,
    alternateName: [...SEO_ALTERNATE_NAMES],
    url: `${SEO_ORIGIN}/`,
    logo: logo.startsWith('http') ? logo : `${SEO_ORIGIN}${logo}`,
    image: `${SEO_ORIGIN}${SEO_SHARE_IMAGE}`,
    description: SEO_PAGE_DEFAULTS.home.description,
    keywords: keywordsForSlug('home').join(', '),
    genre: ['Marching band', 'Concert band', 'Jazz band'],
    address: schoolAddress(),
    areaServed: SEO_AREAS.map((a) => ({ ...a })),
    parentOrganization: {
      '@type': 'HighSchool',
      name: SEO_SCHOOL.name,
      telephone: SEO_SCHOOL.telephone,
      address: schoolAddress(),
      parentOrganization: { '@type': 'EducationalOrganization', name: SEO_SCHOOL.district, alternateName: 'WS/FCS' },
    },
  };
  if (sameAs.length) data.sameAs = sameAs;
  return data;
}

export function donateJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'DonateAction',
    name: 'Donate to the East Forsyth High School Band',
    description: SEO_PAGE_DEFAULTS.fundraising.description,
    target: `${SEO_ORIGIN}/fundraising.html`,
    keywords: keywordsForSlug('fundraising').join(', '),
    recipient: { '@id': `${SEO_ORIGIN}/#organization`, '@type': 'NGO', name: SEO_ORG_NAME, alternateName: [...SEO_ALTERNATE_NAMES], url: `${SEO_ORIGIN}/`, areaServed: SEO_AREAS.map((a) => ({ ...a })) },
  };
}

const ldScript = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

/** Head tags (minus <title>) for a public CMS page. */
export function renderSeoHead(page, site = {}, { noindex = false } = {}) {
  const seo = resolvePageSeo(page, site);
  const url = `${SEO_ORIGIN}${canonicalPath(page)}`;
  const image = `${SEO_ORIGIN}${SEO_SHARE_IMAGE}`;
  const tags = [
    `<meta name="description" content="${esc(seo.description)}">`,
    `<meta name="keywords" content="${esc(keywordsForSlug(seo.slug).join(', '))}">`,
  ];
  if (!noindex) tags.push(`<link rel="canonical" href="${esc(url)}">`);
  tags.push(
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="East Forsyth Band Boosters">`,
    `<meta property="og:locale" content="en_US">`,
    `<meta property="og:title" content="${esc(seo.title)}">`,
    `<meta property="og:description" content="${esc(seo.description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:image:width" content="${SEO_SHARE_IMAGE_WIDTH}">`,
    `<meta property="og:image:height" content="${SEO_SHARE_IMAGE_HEIGHT}">`,
    `<meta property="og:image:alt" content="East Forsyth High School Band performing">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(seo.title)}">`,
    `<meta name="twitter:description" content="${esc(seo.description)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    `<meta name="geo.region" content="US-NC">`,
    `<meta name="geo.placename" content="Kernersville">`,
  );
  // Scroll restoration is handled here: reloads paint from the top (Chrome would
  // re-apply a stale offset, e.g. 26px = utility bar, then reset it); Back/Forward
  // restore the saved position per history entry (bfcache keeps its own). Was:
  // re-applies a stale offset (e.g. 26px = the utility bar) and then resets it.
  tags.push(`<script>try{var h=history;if('scrollRestoration' in h){h.scrollRestoration='manual';var st=h.state&&typeof h.state==='object'?h.state:{},k=st.efhsScrollKey;if(!k){k='s'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);try{h.replaceState(Object.assign({},st,{efhsScrollKey:k}),'')}catch(e){}}var n=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0],t=n?n.type:(performance.navigation&&performance.navigation.type===2?'back_forward':'navigate'),K='efhs-scroll:'+k,y=t==='back_forward'?+sessionStorage.getItem(K):0;addEventListener('pagehide',function(){try{sessionStorage.setItem(K,String(Math.round(scrollY)))}catch(e){}});if(y>0){var go=function(){if(!location.hash)scrollTo(0,y)};document.addEventListener('DOMContentLoaded',go);addEventListener('load',go)}}}catch(e){}</script>`);
  if (!noindex && seo.slug === 'home') tags.push(ldScript(organizationJsonLd(site)));
  if (!noindex && seo.slug === 'fundraising') tags.push(ldScript(donateJsonLd()));
  return { title: seo.title, head: tags.join('\n  ') };
}

export function renderRobotsTxt() {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /dues-dev.html',
    'Disallow: /sponsor-payment-complete.html',
    '',
    `Sitemap: ${SEO_ORIGIN}/sitemap.xml`,
    '',
  ].join('\n');
}

/** Public pages for /sitemap.xml and /sitemap.html: active, in the nav (nav_order < 1000), not utility/private/redirected. */
export function sitemapPages(pages = []) {
  const seen = new Set();
  const out = [];
  for (const page of pages || []) {
    if (!page || !Number(page.active ?? 1)) continue;
    if (Number(page.nav_order) >= 1000) continue;
    const slug = pageSlug(page);
    if (!slug || SITEMAP_EXCLUDED_SLUGS.has(slug) || slug.startsWith('error-')) continue;
    const path = canonicalPath(page);
    if (path.startsWith('/admin') || path.startsWith('/api') || /dev/i.test(path) || seen.has(path)) continue;
    seen.add(path);
    out.push({ page, slug, path, title: String(page.title || slug) });
  }
  if (!seen.has('/')) out.unshift({ page: null, slug: 'home', path: '/', title: 'Home' });
  if (!seen.has('/news')) out.push({ page: null, slug: 'news', path: '/news', title: 'News' });
  return out;
}

export function renderSitemapHtmlBody(pages = []) {
  const items = sitemapPages(pages).map(({ path, title }) => `<li><a href="${esc(path)}">${esc(title)}</a></li>`).join('');
  return `<section class="section sitemap-page"><div class="wrap"><h1>Site Map</h1><ul class="sitemap-list">${items}</ul></div></section>`;
}

export function renderSitemapXml(pages = []) {
  const urls = [];
  for (const { page, slug, path } of sitemapPages(pages)) {
    const lastmod = String(page?.updated_at || '').slice(0, 10);
    urls.push(`  <url><loc>${esc(SEO_ORIGIN + path)}</loc>${/^\d{4}-\d{2}-\d{2}$/.test(lastmod) ? `<lastmod>${lastmod}</lastmod>` : ''}<priority>${slug === 'home' ? '1.0' : (slug === 'fundraising' || slug === 'become-a-sponsor') ? '0.9' : '0.7'}</priority></url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
