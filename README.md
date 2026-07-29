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

## Tests

```bash
uv run pytest -q
```

## Brand references
- Layout/page structure reference: https://www.sfhsbands.net/
- Color scheme and permitted imagery source: https://www.wsfcs.k12.nc.us/o/efhs

## Notes before launch
Several sections intentionally use placeholder copy because official band details were not provided yet. Replace placeholders with approved names, dates, forms, contact details, sponsor levels, and policies. Before public exposure, use HTTPS and strong environment-provided credentials.
