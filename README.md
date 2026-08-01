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

## Cloudflare Worker backend

The repo also includes a Cloudflare-native Worker backend in `worker/src/worker.mjs`. It mirrors the local FastAPI backend with:

- `/health`
- `/admin/login`
- `/admin`
- `/api/site`
- `/api/events`
- `/api/photos`
- protected admin CRUD routes

Cloudflare setup uses D1 for site text, events, password hash, and uploaded photo data. R2 can be added later for larger photo storage.

Deploy commands:

```bash
npm run test:worker
npm run test:pages-build
npm run build:pages
```

### Cloudflare Pages Git deployment (required for the CMS)

The admin routes need an Advanced Mode Pages Worker. In the Cloudflare Pages project's **Build configuration**, set:

- Build command: `npm run build` (or `npm run build:pages`)
- Build output directory: `dist`

The build is Node-only: it copies the static site into `dist/` and adds `dist/_worker.js` plus its `default-pages.mjs` runtime module. Deploying the repository root or only static files will serve the public site but makes `/admin` fall back to the homepage.

Also retain the project-level D1 binding named `DB` and the production environment variables/secrets used by the CMS. After deploying, verify `https://efhsband.pages.dev/admin` redirects to `/admin/login` instead of rendering the homepage.

For a direct Wrangler Pages deployment (requires `CLOUDFLARE_API_TOKEN`):

```bash
npm run deploy:pages
```

Do not use `npm run deploy:worker` for the public site — that targets a standalone Worker, not the Cloudflare Pages project.

Configured D1 database:

- Name: `efhsband-db`
- Binding: `DB`

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
