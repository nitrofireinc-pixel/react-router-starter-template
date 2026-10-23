// Search-engine metadata for public pages: titles, descriptions, canonical,
// Open Graph/Twitter, JSON-LD, robots.txt and sitemap.xml.
// Facts below come only from the site itself (contact page, social links).

export const SEO_ORIGIN = 'https://efhsband.org';
export const SEO_SHARE_IMAGE = '/assets/efhs-home-hero.jpg';
export const SEO_SHARE_IMAGE_WIDTH = 1468;
export const SEO_SHARE_IMAGE_HEIGHT = 788;
export const SEO_ORG_NAME = 'East Forsyth Band Boosters';
export const SEO_SCHOOL = Object.freeze({
  name: 'East Forsyth High School',
  streetAddress: '2500 W Mountain Street',
  addressLocality: 'Kernersville',
  addressRegion: 'NC',
  postalCode: '27284',
  addressCountry: 'US',
  telephone: '+1-336-703-6735',
});

/** Default title/description per CMS slug. CMS "Search title/description" overrides these. */
export const SEO_PAGE_DEFAULTS = Object.freeze({
  home: {
    title: 'East Forsyth Band Boosters | Kernersville, NC Marching & Concert Band',
    description: 'East Forsyth High School Band in Kernersville, NC. Support Forsyth County student musicians through community donations, sponsorships and band fundraisers.',
  },
  ensembles: {
    title: 'Band Ensembles | East Forsyth High School Band, Kernersville NC',
    description: 'Explore the marching, concert and jazz ensembles at East Forsyth High School in Kernersville, NC, and how Forsyth County students can join the band program.',
  },
  calendar: {
    title: 'Band Calendar & Events | East Forsyth Band, Kernersville NC',
    description: 'Upcoming East Forsyth High School Band concerts, games, competitions and fundraisers in Kernersville and Forsyth County, NC. See dates and plan to attend.',
  },
  boosters: {
    title: 'Band Boosters | East Forsyth Band Parents, Kernersville NC',
    description: 'Join the East Forsyth Band Boosters in Kernersville, NC. Meetings, officers, dues and volunteer opportunities supporting Forsyth County student musicians.',
  },
  sponsors: {
    title: 'Our Sponsors | Local Businesses Supporting East Forsyth Band',
    description: 'Meet the Kernersville and Forsyth County, NC businesses that sponsor the East Forsyth High School Band. Thank you for supporting our student musicians.',
  },
  'become-a-sponsor': {
    title: 'Become a Sponsor | Support East Forsyth Band in Kernersville NC',
    description: 'Sponsor the East Forsyth High School Band with a Bronze, Silver or Gold package. Kernersville and Forsyth County businesses can reach local band families.',
  },
  fundraising: {
    title: 'Donate & Band Fundraisers | East Forsyth Band, Kernersville NC',
    description: 'Donate to the East Forsyth High School Band or join a band fundraiser. Community donations in Kernersville and Forsyth County, NC help every student play.',
  },
  gallery: {
    title: 'Photo Gallery | East Forsyth High School Band, Kernersville NC',
    description: 'Photos of the East Forsyth High School Band performing at games, parades, concerts and competitions in Kernersville and across Forsyth County, NC.',
  },
  resources: {
    title: 'Student Resources | East Forsyth Band, Kernersville NC',
    description: 'Forms, handbooks, schedules and other resources for East Forsyth High School Band students and families in Kernersville, Forsyth County, North Carolina.',
  },
  contact: {
    title: 'Contact the East Forsyth Band | Kernersville, NC',
    description: 'Contact the East Forsyth High School Band and Band Boosters in Kernersville, NC with questions about donations, sponsorships, events or joining the band.',
  },
  directors: {
    title: 'Band Directors & Staff | East Forsyth High School, Kernersville NC',
    description: 'Meet the directors and staff who lead the East Forsyth High School Band program in Kernersville, NC, serving student musicians in Forsyth County.',
  },
  'in-kind': {
    title: 'In-Kind Donations | Support East Forsyth Band, Kernersville NC',
    description: 'Offer an in-kind donation of goods or services to the East Forsyth High School Band. Kernersville and Forsyth County, NC businesses and families welcome.',
  },
  'letterman-jacket': {
    title: 'Band Letterman Jacket Order | East Forsyth Band, Kernersville NC',
    description: 'Order an East Forsyth High School Band letterman jacket. Order form for band students and families in Kernersville and Forsyth County, North Carolina.',
  },
});

/** Slugs never listed in the sitemap (utility, error and private pages). */
const SITEMAP_EXCLUDED_SLUGS = new Set(['not-found', 'maintenance', 'dues-dev', 'sponsor-payment-complete', 'qr', 'caldev', 'coming-soon']);

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
  const siteTitle = String(site.title || 'East Forsyth Band');
  const fallbackTitle = `${String(page?.title || 'Page')} | ${siteTitle}, Kernersville NC`;
  const fallbackDescription = `${String(page?.title || siteTitle)} from the East Forsyth High School Band and Band Boosters in Kernersville, Forsyth County, NC. Support local student musicians.`;
  return {
    slug,
    title: custom.title || defaults.title || fallbackTitle,
    description: custom.description || defaults.description || fallbackDescription,
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

export function organizationJsonLd(site = {}) {
  const logo = String(site.logo_url || '/assets/efhs-logo.png');
  const sameAs = sameAsFromSite(site);
  const data = {
    '@context': 'https://schema.org',
    '@type': ['NGO', 'MusicGroup'],
    '@id': `${SEO_ORIGIN}/#organization`,
    name: SEO_ORG_NAME,
    alternateName: ['East Forsyth Band', 'East Forsyth Blue Regiment', 'EFHS Band'],
    url: `${SEO_ORIGIN}/`,
    logo: logo.startsWith('http') ? logo : `${SEO_ORIGIN}${logo}`,
    image: `${SEO_ORIGIN}${SEO_SHARE_IMAGE}`,
    description: SEO_PAGE_DEFAULTS.home.description,
    address: {
      '@type': 'PostalAddress',
      streetAddress: SEO_SCHOOL.streetAddress,
      addressLocality: SEO_SCHOOL.addressLocality,
      addressRegion: SEO_SCHOOL.addressRegion,
      postalCode: SEO_SCHOOL.postalCode,
      addressCountry: SEO_SCHOOL.addressCountry,
    },
    areaServed: [
      { '@type': 'City', name: 'Kernersville, North Carolina' },
      { '@type': 'AdministrativeArea', name: 'Forsyth County, North Carolina' },
    ],
    parentOrganization: {
      '@type': 'HighSchool',
      name: SEO_SCHOOL.name,
      telephone: SEO_SCHOOL.telephone,
      address: {
        '@type': 'PostalAddress',
        streetAddress: SEO_SCHOOL.streetAddress,
        addressLocality: SEO_SCHOOL.addressLocality,
        addressRegion: SEO_SCHOOL.addressRegion,
        postalCode: SEO_SCHOOL.postalCode,
        addressCountry: SEO_SCHOOL.addressCountry,
      },
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
    recipient: { '@id': `${SEO_ORIGIN}/#organization`, '@type': 'NGO', name: SEO_ORG_NAME, url: `${SEO_ORIGIN}/` },
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
  ];
  if (!noindex) tags.push(`<link rel="canonical" href="${esc(url)}">`);
  tags.push(
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(SEO_ORG_NAME)}">`,
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

export function renderSitemapXml(pages = []) {
  const seen = new Set();
  const urls = [];
  for (const page of pages || []) {
    if (!page || !Number(page.active ?? 1)) continue;
    const slug = pageSlug(page);
    if (!slug || SITEMAP_EXCLUDED_SLUGS.has(slug) || slug.startsWith('error-')) continue;
    const path = canonicalPath(page);
    if (path.startsWith('/admin') || path.startsWith('/api') || seen.has(path)) continue;
    seen.add(path);
    const lastmod = String(page.updated_at || '').slice(0, 10);
    urls.push(`  <url><loc>${esc(SEO_ORIGIN + path)}</loc>${/^\d{4}-\d{2}-\d{2}$/.test(lastmod) ? `<lastmod>${lastmod}</lastmod>` : ''}<priority>${slug === 'home' ? '1.0' : (slug === 'fundraising' || slug === 'become-a-sponsor') ? '0.9' : '0.7'}</priority></url>`);
  }
  if (!seen.has('/')) urls.unshift(`  <url><loc>${SEO_ORIGIN}/</loc><priority>1.0</priority></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
