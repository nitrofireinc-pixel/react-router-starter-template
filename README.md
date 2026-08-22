# East Forsyth Band Website Draft

Website draft for the East Forsyth Band program with a lightweight custom backend for editing public content.

## Pages
- Home
- Ensembles
- Directors & Staff
- Calendar
- Sponsors
- Fundraising
- Student Resources
- Boosters
- Contact
- Admin dashboard at `/admin`

## Editable backend features
- Admin login with signed session cookie
- Edit site title, hero title/subtitle, and footer note
- Add, edit, sort, and delete calendar events
- Upload and delete gallery photos
- Public JSON endpoints used by the site:
  - `/api/site`
  - `/api/events`
  - `/api/photos`

## Local preview with backend

```bash
uv run uvicorn backend.app:app --host 0.0.0.0 --port 8080
```

Then visit:
- Public site: http://localhost:8080
- Admin: http://localhost:8080/admin

Default local admin credentials:
- Username: `admin`
- Password: `admin123$`

After you log in, use the **Change password** card in `/admin` to replace the temporary password. The changed password is stored as a PBKDF2 hash in the local SQLite database.

Set a real password and secret before using this anywhere public:

```bash
export EFBAND_SECRET="replace-with-a-long-random-secret"
export EFBAND_ADMIN_USERNAME="admin"
export EFBAND_ADMIN_PASSWORD="replace-with-a-strong-password"
uv run uvicorn backend.app:app --host 0.0.0.0 --port 8080
```

The backend stores SQLite data and uploaded photos in `data/` by default. You can change that with:

```bash
export EFBAND_DATA_DIR="/path/to/persistent/data"
```

## Static-only fallback
You can still open `index.html` directly or run `python3 -m http.server 8080`, but the editable content, login, and uploads require the backend command above.

## Production deploy (Cloudflare Worker)

**Live site:** `https://efhsband.org` is served by Worker **`efhsband-live`** (not Cloudflare Pages, not Worker `efhsband`).

Always start from up-to-date **`main`**, then:

```bash
npm run test:worker
npm run deploy:worker
```

`deploy:worker` runs a guard (`check:worker-assets`), syncs static files into `worker/public/`, and deploys via `wrangler.toml`.

### Do not change these `wrangler.toml` values

| Setting | Required value | Why |
|---|---|---|
| `name` | `"efhsband-live"` | Owns `efhsband.org/*` and production secrets. Deploying as `efhsband` only updates a workers.dev sandbox and can recreate a confusing orphan Worker. |
| `[assets] directory` | `"./worker/public"` | `"./assets"` 404s CSS/JS and trashes the live site. |
| `run_worker_first` | `true` | CMS HTML must win over static files. |
| `routes` | `efhsband.org/*` | Keeps deploys attached to the live domain. |

Zone route `efhsband.org/*` must stay pointed at script **`efhsband-live`**.

Configured D1 database:

- Name: `efhsband-db`
- Binding: `DB`

### Optional / non-production

`npm run build:pages` / `deploy:pages` build a Pages bundle for experiments only. **Do not use Pages deploys for efhsband.org.**

## Tests

```bash
uv run pytest -q
npm run test:worker
```

## Brand references
- Layout/page structure reference: https://www.sfhsbands.net/
- Color scheme and permitted imagery source: https://www.wsfcs.k12.nc.us/o/efhs

## Notes before launch
Several sections intentionally use placeholder copy because official band details were not provided yet. Replace placeholders with approved names, dates, forms, contact details, sponsor levels, and policies. Before public exposure, use HTTPS and strong environment-provided credentials.
