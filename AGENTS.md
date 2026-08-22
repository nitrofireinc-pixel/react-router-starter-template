# Agent notes (East Forsyth Band)

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
