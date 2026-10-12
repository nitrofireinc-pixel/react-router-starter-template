# Design: Auto-post calendar events to Facebook

**Status:** Design only — do not implement until Meta prerequisites are ready  
**Owner revisit:** Trevor + agent  
**Scope for v1:** Facebook Page posts from calendar event create/update  
**Out of scope for v1:** Instagram auto-posting (see later section)

---

## Goal

When a calendar event is saved in the Admin CMS, optionally create (or update) a post on the band’s Facebook Page so families see the same announcement without a second manual post.

Default behavior must remain **website-only**. Social posting is opt-in per event (or per save action), never silent.

---

## Prerequisites (collect before build)

### Facebook / Meta
1. A **Facebook Page** for the band (not just a personal profile).
2. A Meta developer account and a **Meta App** in [developers.facebook.com](https://developers.facebook.com/).
3. App type that can use **Facebook Login for Business** / Graph API Page publishing.
4. Page roles: the connecting admin must be able to manage the Page.
5. Graph permissions (exact names can shift; verify at build time):
   - `pages_show_list`
   - `pages_manage_posts`
   - `pages_read_engagement` (useful for verifying post state)
   - `public_profile` (login basics)
6. A long-lived **Page access token** (or a refreshable user token that can mint Page tokens).
7. App review / Advanced Access if Meta requires it for those permissions outside Development mode (common once non-app-admins need to use it).
8. Decision: post as the **Page** (required for school/brand voice), never as a personal profile.

### Site / ops
1. Secure secret storage in Cloudflare (Wrangler secrets / Pages project env):
   - `FACEBOOK_PAGE_ID`
   - `FACEBOOK_PAGE_ACCESS_TOKEN` (or encrypted token blob in D1 + encryption key secret)
2. Confirm contact who can rotate tokens if Meta invalidates them.
3. Agree on copy tone: event title + date + short description + link back to `/calendar.html`.

### Explicitly not required for Facebook v1
- Instagram Business account
- Image upload pipeline for social
- Third-party Zapier/Make account (optional alternative; see Alternatives)

---

## Recommended UX

### Calendar Events tab
Add a compact “Share” block on the event form (below description):

- Checkbox: **Also post to Facebook**
  - Checked only when user opts in for that save
  - Unchecked by default
- Helper text: “Creates a Page post with the event title, date, and description, plus a link to the calendar.”
- After a successful Facebook post, show status under the event:
  - `Posted to Facebook` + timestamp
  - Optional “View post” link if Graph returns a permalink
- If token/config missing: show a muted notice in Site Settings / Events:
  - “Facebook posting is not configured yet.”
  - Do not block saving the website event.

### Update behavior (v1 decision)
Pick one and stick to it:

| Option | Behavior | Recommendation |
|--------|----------|----------------|
| A. Create-only | Checkbox posts only when no prior Facebook post id exists | **Recommended for v1** — simplest, fewest Graph edge cases |
| B. Create + update | Later edits can update the existing Page post | Better later; needs stored post id + error handling for deleted posts |
| C. Always new post | Every checked save creates another Page post | Avoid — easy to spam the Page |

**v1 recommendation:** Option A. Edits to the website event do not rewrite Facebook unless we add an explicit “Update Facebook post” action in v2.

### Failure behavior
- Website event save always succeeds first.
- Facebook post runs after DB save.
- If Facebook fails, keep the event and show a clear CMS error:
  - “Event saved on the website, but Facebook posting failed: …”
- Never roll back the calendar row because Meta is down.

---

## Post content format

Compose a plain-text Page post, roughly:

```text
{title}
{date_label} {date_detail}{optional year}

{description}

Details: https://efhsband.org/calendar.html
```

Rules:
- Strip HTML from description.
- Truncate conservatively if near Graph limits (keep title + link intact).
- No hashtags unless editors add them in the description themselves.
- Do not invent times/locations the CMS does not store.

Optional later: include a featured image if/when events gain an image field.

---

## Architecture (fits current stack)

Current stack: Cloudflare Pages Advanced Mode Worker + D1 + Admin CMS event forms.

```text
Admin saves event
    → Worker validates + writes D1 `events`
    → if share_to_facebook requested and Facebook configured
        → Graph API POST /{page-id}/feed
        → store facebook_post_id (+ posted_at) on event row
    → return event JSON including facebook share status
```

### Why in-worker (not a separate service)
- Event create already goes through `/api/admin/events`.
- Secrets stay in Cloudflare.
- No extra host to maintain.
- Good enough volume for a school calendar.

### Why not browser-direct to Meta
- Page tokens must never ship to the browser.
- CORS and token leakage risk.

---

## Data model

### D1 `events` additions
| Column | Type | Notes |
|--------|------|------|
| `facebook_post_id` | TEXT NULL | Graph post id from create |
| `facebook_posted_at` | TEXT NULL | ISO timestamp |
| `facebook_last_error` | TEXT NULL | Last share failure message for CMS display |

No need to store the full post body; regenerate from event fields if v2 updates are added.

### Site config / secrets
Prefer Cloudflare secrets for the token. Optional D1 `site_content` keys for non-secret config:

- `facebook_page_id` (if not only in env)
- `facebook_sharing_enabled` (`0`/`1` master switch)

Master switch lets us disable sharing quickly without code changes.

---

## API / Worker changes (when implementing)

### Event save payload
Extend admin event create/update JSON with:

```json
{
  "share_to_facebook": true
}
```

Server ignores the flag unless:
1. Caller has event create/manage permission
2. `facebook_sharing_enabled`
3. Page id + token present

### New helper module (suggested)
`worker/src/facebook.mjs`
- `isFacebookConfigured(env)`
- `buildEventFacebookMessage(event, siteOrigin)`
- `createFacebookPagePost(env, message)`
- Normalize Graph errors into safe CMS strings (no token leakage)

### Graph call (conceptual)
`POST https://graph.facebook.com/v21.0/{page-id}/feed`
```json
{
  "message": "...",
  "link": "https://efhsband.org/calendar.html",
  "access_token": "***"
}
```

Pin Graph version at implementation time; do not leave it floating without tests.

### Admin UI
- Events form checkbox + status line
- Site Settings: read-only “Facebook sharing: configured / not configured” indicator
  - Do **not** paste long-lived tokens into the CMS UI in v1
  - Token install stays in Wrangler/Cloudflare dashboard

---

## Security & compliance

1. Store Page access token only as a Cloudflare secret (or encrypted at rest).
2. Never log tokens, never return them from `/api/*`.
3. Sanitize Graph error responses before showing in CMS.
4. Rate-limit share attempts per event (e.g. one successful create; manual retry button later).
5. Permission: only users who can mutate events may trigger share.
6. Assume school communications standards still apply — the CMS is not a substitute for district social media policy approval.
7. Document token rotation steps in this file when credentials are issued.

---

## Instagram (deferred)

Instagram Content Publishing API generally requires:
- Instagram Professional account linked to the Facebook Page
- A **media** object (image/video URL Meta can fetch)
- Additional permissions (`instagram_basic`, `instagram_content_publish`, etc.)
- Asynchronous publish container → publish status polling

A text-only calendar event does not map cleanly to an Instagram feed post.

**Later options (only after Facebook v1 works):**
1. Optional event image upload → Instagram feed publish
2. Share-to-Facebook only, and let Meta’s “Crossposting to Instagram” Page settings handle it if available for that Page
3. Keep Instagram fully manual

Do not block Facebook v1 on Instagram.

---

## Alternatives (if Meta app review is painful)

| Approach | Pros | Cons |
|----------|------|------|
| Native Graph API in Worker | Full control, no third party | App review + token maintenance |
| Zapier / Make webhook from Worker | Faster ops setup | Monthly cost, another vendor, less control |
| Manual “Copy post text” button | Zero Meta integration | Not automatic |

If prerequisites stall, a cheap interim is a **Copy Facebook caption** button in the event form that fills the clipboard with the composed message.

---

## Implementation phases (when greenlit)

### Phase 0 — Prerequisites checklist
- [ ] Page exists and branding approved
- [ ] Meta App created
- [ ] Permissions granted / reviewed as needed
- [ ] Long-lived Page token generated
- [ ] Secrets added to Cloudflare Pages project
- [ ] Test post manually with Graph API Explorer succeeds

### Phase 1 — Facebook create-on-save
- [ ] Secrets + feature flag
- [ ] D1 columns / migration
- [ ] Worker Graph helper
- [ ] Event form checkbox + status
- [ ] Tests for message builder + flag handling (mock Graph)
- [ ] Staging post to a test Page first

### Phase 2 — Hardening
- [ ] Retry/failed-share UI
- [ ] Permalink “View on Facebook”
- [ ] Token invalidation detection + admin banner
- [ ] Optional update-existing-post action

### Phase 3 — Instagram (optional)
- [ ] Confirm media requirements
- [ ] Event image support
- [ ] Separate Instagram opt-in checkbox

---

## Test plan (for implementation later)

1. Unit: message builder escapes/strips HTML and includes calendar link.
2. Unit: `share_to_facebook=false` never calls Graph.
3. Unit: missing secrets → event saves, share skipped with clear status.
4. Integration (mocked fetch): successful Graph response stores `facebook_post_id`.
5. Integration (mocked fetch): Graph 400/401 surfaces CMS error without exposing token.
6. Manual: real test Page post from staging deployment.
7. Manual: confirm public calendar still renders normally when share fields are set.

---

## Open questions for revisit

1. Exact Page name / Page ID to use in production?
2. Should every editor be allowed to post, or only admins / `events:manage`?
3. Preferred post footer link: site home, calendar page, or a future single-event URL?
4. Do we need district communications approval before enabling?
5. Is there already a Facebook Page posting workflow we must not duplicate/spam?
6. Do boosters/meetings events belong on Facebook, or only public performances?

---

## Revisit trigger

Resume implementation when Trevor confirms:
1. Meta App + Page access token are available, and
2. Answers to the open questions above (at least 1–4).

Until then, keep social features limited to the existing footer profile links.
