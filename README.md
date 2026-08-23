# East Forsyth Band Website

Public site and Admin CMS for the East Forsyth Band program, served by a Cloudflare Worker (`efhsband-live`) with D1 storage.

## Pages
- Home
- Ensembles
- Directors & Staff
- Calendar (Schedule Board)
- Sponsors
- Fundraising
- Student Resources
- Boosters
- Contact / Gallery
- Admin CMS at `/admin`

## Production

**Live site:** https://efhsband.org — Worker **`efhsband-live`** (not Cloudflare Pages).

```bash
npm run test:worker
npm run deploy:worker
```

`deploy:worker` checks assets, syncs static files into `worker/public/`, and deploys via `wrangler.toml`.

### Do not change these `wrangler.toml` values

| Setting | Required value | Why |
|---|---|---|
| `name` | `"efhsband-live"` | Owns `efhsband.org/*` and production secrets. |
| `[assets] directory` | `"./worker/public"` | Wrong path 404s CSS/JS. |
| `run_worker_first` | `true` | CMS HTML must win over static files. |
| `routes` | `efhsband.org/*` | Keeps deploys on the live domain. |

D1 database: `efhsband-db` (binding `DB`).

### Optional / non-production

`npm run build:pages` / `deploy:pages` build a Pages bundle for experiments only. **Do not use Pages deploys for efhsband.org.**

## Local static preview

Open HTML files directly, or:

```bash
python3 -m http.server 8080
```

Editable CMS features, login, uploads, and APIs require the deployed Worker (or `wrangler dev` against the Worker + D1).

## Tests

```bash
npm run test:worker
npm run test:pages-build
npm run test:cms-guide-pdf
```

## Brand references
- Layout/page structure reference: https://www.sfhsbands.net/
- Color scheme and permitted imagery source: https://www.wsfcs.k12.nc.us/o/efhs

## Notes before launch
Replace placeholder copy with approved names, dates, forms, contact details, sponsor levels, and policies. Use HTTPS and strong environment-provided credentials in production.
