# Agent notes (East Forsyth Band)

## CMS login (Cursor agents)

Use this account for live CMS checks on **https://efhsband.org/admin/login**. Do not commit other staff passwords.

- Username: `agent@efhsband.org`
- Password: `agent123$`

The live user is Super Admin. Login is the singular `agent@` address, not `agents@`.

## Source of truth

- Git branch **`main`** is production. Pull/rebase from `origin/main` before any deploy.
- Live domain **efhsband.org** is Cloudflare Worker **`efhsband-live`**.

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
