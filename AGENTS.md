# Agent notes (East Forsyth Band)

## CMS login (Cursor agents)

Use the `agent@efhsband.org` Super Admin account for live CMS checks on **https://efhsband.org/admin/login**. Agent credentials are provided out of band and must never be committed. Login is the singular `agent@` address, not `agents@`. Do not commit other staff passwords.

## Source of truth

- Git branch **`main`** is the git production branch. Pull/rebase from `origin/main` before any deploy.
- Live domain **efhsband.org** is Cloudflare Worker **`efhsband-live`**.
- The staff CMS on that worker has been rebuilt past this git tree. `main` does not contain the events manager, People & Access, Form Builder page, or the current Site Studio home. Do not run `npm run deploy:worker` from this tree until that live worker is merged back. A full deploy would replace the CMS that is on the site now.

## Work from the live CMS

Before editing a staff screen, open the live page and use the script that page loads. Do not start from an older git copy of `admin.js` or `admin-caldev.js` and assume it is the screen in use.

Current staff home (from the live worker):

- Edit a page: `/admin?tab=pages`
- Themes: `/admin?tab=site#studio-theme`
- Calendar: `/admin/events-manager` (loads `/api/caldev/events-manager.js`, not the cached `/admin-events.js` asset)
- Sponsors: `/admin?tab=sponsors`
- Fundraisers: `/admin/fundraiser-cards`
- Meeting minutes: `/admin?tab=minutes`
- Photos: `/admin?tab=photos`
- People & Access: `/admin/people` (`/admin-people.js`, not in git)
- Forms: `/admin/forms-builder` (script is inside the worker)

The older Schedule Board URL `/admin?tab=caldev` now redirects to `/admin/events-manager` (Trevor: the calendar opens Events). The public calendar loads `/api/caldev/calendar.js`.

For a CMS change: download the current `efhsband-live` script, patch the handler or client that the live page actually requests, check bindings before sending traffic, then deploy that version. Static files under `/admin-*.js` are served directly and stay cached, so a worker upload does not replace them. Point worker HTML at an `/api/*` script when the client has to change before the asset bundle is updated.

## Deploy

```bash
npm run deploy:worker
```

That command guards `wrangler.toml`, syncs assets into `worker/public/`, then deploys.

Never:

- Deploy with `[assets] directory = "./assets"` (breaks CSS/JS on the live site).
- Change `wrangler.toml` `name` away from `efhsband-live`.
- Use `npm run deploy:pages` for the public domain.
- Recreate or deploy a Worker named `efhsband` for production.

## Before merging / deploying

1. Start from current `main`.
2. Keep the `efhsband.org/*` route on `efhsband-live`.
3. Run `npm run test:worker` when touching Worker or deploy scripts.
