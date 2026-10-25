// Form Builder admin + public APIs (plan 2.21). deps are injected by worker.mjs.
import {
  ensureFormStudioSchema, normalizeDefinition, validateDefinition, convertV1Definition, normalizeSubmission,
  buildStaffMail, buildConfirmMail, guardedSend, checkLinks, storeLinkResults, definitionLinks, linkStatuses,
  sha256, flatValues, esc, FS_RETENTION_DAYS, FS_DRAFT_MIN_SECONDS, FS_DRAFT_MAX_PER_DAY, FS_DRAFT_LOCK_SECONDS,
  FS_RATE_LIMIT, FS_RATE_WINDOW_S, FS_VERSIONS_KEPT, FS_MAX_RECIPIENTS, SUBMIT_DELETE_PERMISSIONS, LINK_MAX_PER_SAVE,
  renderFormHtml,
} from './form-studio.mjs';

const json = (t, fb = {}) => { try { return JSON.parse(t || '') ?? fb; } catch { return fb; } };
const who = (u) => String(u?.display_name || u?.username || 'someone');
export const canDeleteSubmissions = (user, isSuperAdmin, hasPermission) => isSuperAdmin(user) || SUBMIT_DELETE_PERMISSIONS.some((p) => hasPermission(user, p));

export async function pagesUsingForm(env, formId) {
  const marker = `%data-cms-form-v2="${Number(formId)}"%`;
  const rows = (await env.DB.prepare(`SELECT DISTINCT p.id, p.slug, p.title, p.path FROM cms_pages p
    LEFT JOIN page_versions v ON v.id = p.live_version_id LEFT JOIN page_drafts d ON d.slug = p.slug
    WHERE v.html_cache LIKE ? OR d.layout_json LIKE ?`).bind(marker, `%"form_id":${Number(formId)}%`).all().catch(() => ({ results: [] }))).results || [];
  return rows;
}

function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function submissionRow(r) {
  const data = json(r.payload_json);
  const legacy = r.form_id == null;
  const values = legacy ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, { value: String(v ?? ''), label: k }])) : data;
  return { id: r.id, created_at: r.created_at, status: r.status || 'new', staff_note: r.staff_note || '', legacy, delivered: Boolean(r.delivered), delivery_error: r.delivery_error || '', mail_state: json(r.mail_state), values };
}

async function formRow(env, id) {
  return env.DB.prepare('SELECT * FROM cms_forms WHERE id = ? AND builder = 1').bind(Number(id)).first();
}

function subWhere(form) {
  if (form.legacy_kind) return { sql: '(s.form_id = ? OR (s.form_id IS NULL AND s.kind = ?))', binds: [form.id, form.legacy_kind] };
  return { sql: 's.form_id = ?', binds: [form.id] };
}

export async function handleFormStudioApi(request, env, url, ctx, deps) {
  const p = url.pathname;
  const pub = p.match(/^\/api\/forms-v2\/(\d+)\/submit$/);
  if (pub) return request.method === 'POST' ? submitForm(request, env, ctx, deps, Number(pub[1])) : deps.jsonResponse({ detail: 'Method not allowed' }, 405);
  if (p.startsWith('/api/admin/link-reviews')) return linkReviewApi(request, env, url, ctx, deps);
  if (p.startsWith('/api/admin/studio-notices')) return noticesApi(request, env, deps);
  if (!p.startsWith('/api/admin/forms-v2')) return null;
  const { jsonResponse: J } = deps;
  const auth = await deps.requireFormsAccess(request, env);
  if (auth.response) return auth.response;
  const user = auth.user;
  await ensureFormStudioSchema(env);
  const m = p.match(/^\/api\/admin\/forms-v2(?:\/(\d+))?(?:\/(draft|save|duplicate|submissions|export|links|test-email))?$/);
  const sm = p.match(/^\/api\/admin\/forms-v2\/submissions\/(\d+)$/);
  const method = request.method;
  const audit = (action, detail, meta = {}, status = 200) => deps.audit(request, user, { action, detail, meta, status, ctx });

  if (p === '/api/admin/forms-v2/submitted' && method === 'GET') {
    const rows = (await env.DB.prepare(`SELECT f.id, f.title, f.deleted_at, f.legacy_kind,
      (SELECT COUNT(*) FROM form_submissions s WHERE s.form_id = f.id OR (f.legacy_kind != '' AND s.form_id IS NULL AND s.kind = f.legacy_kind)) AS total,
      (SELECT COUNT(*) FROM form_submissions s WHERE (s.form_id = f.id OR (f.legacy_kind != '' AND s.form_id IS NULL AND s.kind = f.legacy_kind)) AND s.status = 'new') AS new_count
      FROM cms_forms f WHERE f.builder = 1 ORDER BY f.title`).all()).results || [];
    return J({ forms: rows.filter((r) => !r.deleted_at || r.total > 0).map((r) => ({ ...r, title: r.deleted_at ? `${r.title} (deleted form)` : r.title })), can_delete: canDeleteSubmissions(user, deps.isSuperAdmin, deps.hasPermission) });
  }

  if (sm) {
    const row = await env.DB.prepare('SELECT s.*, f.id AS fid, f.title, f.legacy_kind FROM form_submissions s JOIN cms_forms f ON f.builder = 1 AND (f.id = s.form_id OR (s.form_id IS NULL AND f.legacy_kind != \'\' AND s.kind = f.legacy_kind)) WHERE s.id = ?').bind(Number(sm[1])).first();
    if (!row) return J({ detail: 'Sign-up not found' }, 404);
    const label = `${row.title} entry #${row.id}`;
    if (method === 'GET') {
      await audit('change.forms', `viewed ${label}`, { submission_id: row.id });
      return J({ submission: submissionRow(row), form: { id: row.fid, title: row.title } });
    }
    if (method === 'PATCH') {
      if (row.form_id == null) return J({ detail: 'Old sign-ups are read-only' }, 409);
      const body = await request.json().catch(() => ({}));
      const status = ['new', 'seen', 'done', 'spam'].includes(body.status) ? body.status : row.status;
      const note = String(body.staff_note ?? row.staff_note ?? '').slice(0, 1000);
      await env.DB.prepare('UPDATE form_submissions SET status = ?, staff_note = ? WHERE id = ?').bind(status, note, row.id).run();
      await audit('change.forms', `set ${label} to ${status}${note !== row.staff_note ? ' and changed the staff note' : ''}`, { submission_id: row.id });
      return J({ ok: true });
    }
    if (method === 'DELETE') {
      if (!canDeleteSubmissions(user, deps.isSuperAdmin, deps.hasPermission)) return J({ detail: 'Only Super Admin, President, Vice President or Director can delete sign-ups early' }, 403);
      const name = flatValues(json(row.payload_json)).student_name || flatValues(json(row.payload_json)).name || '';
      await env.DB.batch([
        env.DB.prepare('DELETE FROM form_mail_queue WHERE submission_id = ?').bind(row.id),
        env.DB.prepare("DELETE FROM form_submissions WHERE id = ? AND kind != 'inkind'").bind(row.id),
      ]);
      await audit('change.forms', `deleted 1 sign-up${name ? ` (${name})` : ''} from ${row.title} (#${row.id})`, { submission_id: row.id });
      return J({ ok: true });
    }
    return J({ detail: 'Method not allowed' }, 405);
  }
  if (!m) return J({ detail: 'Not found' }, 404);
  const [, idRaw, action = ''] = m;

  if (!idRaw) {
    if (method === 'GET') {
      const rows = (await env.DB.prepare(`SELECT f.id, f.title, f.updated_at, f.updated_by_name, f.version, f.created_by, f.draft_saved_at, f.draft_by, f.draft_by_name,
        (SELECT COUNT(*) FROM form_submissions s WHERE s.form_id = f.id OR (f.legacy_kind != '' AND s.form_id IS NULL AND s.kind = f.legacy_kind)) AS submissions
        FROM cms_forms f WHERE f.builder = 1 AND f.deleted_at IS NULL ORDER BY datetime(f.updated_at) DESC`).all()).results || [];
      for (const r of rows) r.pages = (await pagesUsingForm(env, r.id)).map((x) => ({ slug: x.slug, title: x.title }));
      const legacy = (await env.DB.prepare("SELECT id, slug, title FROM cms_forms WHERE COALESCE(builder, 0) = 0 ORDER BY title").all()).results || [];
      return J({ forms: rows, legacy_forms: legacy, me: user.id });
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      let def; let legacyKind = '';
      if (body.from_legacy) {
        const src = await env.DB.prepare('SELECT * FROM cms_forms WHERE slug = ? AND COALESCE(builder,0) = 0').bind(String(body.from_legacy)).first();
        if (!src) return J({ detail: 'Legacy form not found' }, 404);
        def = convertV1Definition(json(src.definition_json), json(src.recipient_user_ids, []));
        if (body.title) def.title = String(body.title).slice(0, 160);
        legacyKind = src.slug;
      } else {
        def = normalizeDefinition({ title: body.title || 'Untitled form', fields: [{ type: 'text', name: 'name', label: 'Name', required: true, width: 'full' }, { type: 'email', name: 'email', label: 'Email', required: true }], email: { reply_to_field: 'email', confirm_copy: true } });
      }
      const id = await insertForm(env, def, user, legacyKind);
      await audit('change.forms', `created the form ${def.title}${legacyKind ? ` from the legacy ${legacyKind} form` : ''}`, { form_id: id });
      return J({ ok: true, id });
    }
    return J({ detail: 'Method not allowed' }, 405);
  }

  const form = await formRow(env, idRaw);
  if (!form || (form.deleted_at && action !== 'submissions' && action !== 'export')) return J({ detail: 'Form not found' }, 404);
  const def = normalizeDefinition(json(form.definition_json), form.title);

  if (!action && method === 'GET') {
    const users = (await deps.listUsers(env)).filter((u) => u.can_email).map((u) => ({ id: u.id, name: u.display_name || u.username }));
    const versions = (await env.DB.prepare('SELECT version, saved_by_name, saved_at FROM cms_form_versions WHERE form_id = ? ORDER BY version DESC LIMIT 5').bind(form.id).all()).results || [];
    const urls = definitionLinks(def);
    const statuses = await linkStatuses(env, urls);
    const counts = {};
    const subs = (await env.DB.prepare(`SELECT payload_json FROM form_submissions s WHERE ${subWhere(form).sql} ORDER BY id DESC LIMIT 500`).bind(...subWhere(form).binds).all()).results || [];
    for (const s of subs) for (const [k, v] of Object.entries(flatValues(json(s.payload_json)))) if (v) counts[k] = (counts[k] || 0) + 1;
    const lockAge = form.draft_saved_at ? (Date.now() - Date.parse(`${form.draft_saved_at}Z`)) / 1000 : Infinity;
    return J({
      form: { id: form.id, title: form.title, version: form.version, updated_at: form.updated_at, updated_by_name: form.updated_by_name, legacy_kind: form.legacy_kind },
      definition: def,
      draft: form.draft_json ? { definition: json(form.draft_json), saved_at: form.draft_saved_at, by: form.draft_by, by_name: form.draft_by_name, base_version: form.draft_base_version, mine: Number(form.draft_by) === Number(user.id), locked: Number(form.draft_by) !== Number(user.id) && lockAge < FS_DRAFT_LOCK_SECONDS } : null,
      users, versions, pages: await pagesUsingForm(env, form.id),
      links: urls.map((u) => ({ url: u, status: statuses.get(u) || 'pending' })),
      answer_counts: counts, max_recipients: FS_MAX_RECIPIENTS,
    });
  }
  if (action === 'draft') {
    if (method === 'DELETE') {
      await env.DB.prepare('UPDATE cms_forms SET draft_json = NULL, draft_saved_at = NULL, draft_by = NULL, draft_by_name = \'\', draft_base_version = NULL WHERE id = ?').bind(form.id).run();
      await audit('change.forms', `discarded unsaved changes to ${form.title}`, { form_id: form.id });
      return J({ ok: true });
    }
    if (method !== 'PUT' && method !== 'POST') return J({ detail: 'Method not allowed' }, 405);
    const body = await request.json().catch(() => ({}));
    const text = JSON.stringify(normalizeDefinition(body.definition || {}, form.title));
    if (text.length > 120_000) return J({ detail: 'Draft too large' }, 413);
    const today = new Date().toISOString().slice(0, 10);
    const writes = form.draft_writes_day === today ? Number(form.draft_writes || 0) : 0;
    if (writes >= FS_DRAFT_MAX_PER_DAY) return J({ detail: 'Server autosave paused for today; your browser copy is still kept.', code: 'draft_cap' }, 429);
    const age = form.draft_saved_at ? (Date.now() - Date.parse(`${form.draft_saved_at}Z`)) / 1000 : Infinity;
    const other = form.draft_by && Number(form.draft_by) !== Number(user.id);
    if (other && age < FS_DRAFT_LOCK_SECONDS && !body.take_over) return J({ detail: `${form.draft_by_name || 'Someone'} is editing (autosaved ${Math.max(1, Math.round(age / 60))} min ago).`, code: 'locked' }, 409);
    if (!other && age < FS_DRAFT_MIN_SECONDS) return J({ detail: 'Autosave runs at most once a minute.', code: 'too_soon', retry_after: Math.ceil(FS_DRAFT_MIN_SECONDS - age) }, 429);
    await env.DB.prepare(`UPDATE cms_forms SET draft_json = ?, draft_saved_at = strftime('%Y-%m-%d %H:%M:%S','now'), draft_by = ?, draft_by_name = ?, draft_base_version = ?,
      draft_writes_day = ?, draft_writes = ? WHERE id = ?`).bind(text, user.id, who(user), Number(body.base_version) || form.version, today, writes + 1, form.id).run();
    if (other && body.take_over) await audit('change.forms', `took over editing ${form.title} from ${form.draft_by_name}`, { form_id: form.id });
    return J({ ok: true, saved_at: new Date().toISOString(), writes_today: writes + 1 });
  }
  if (action === 'save' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const next = normalizeDefinition(body.definition || {}, form.title);
    const errors = validateDefinition(next);
    const userIds = new Set((await deps.listUsers(env)).filter((u) => u.can_email).map((u) => Number(u.id)));
    const rawTo = Array.isArray(body.definition?.email?.to_user_ids) ? body.definition.email.to_user_ids : [];
    if (rawTo.length > FS_MAX_RECIPIENTS) errors.push(`At most ${FS_MAX_RECIPIENTS} staff recipients.`);
    if (rawTo.some((x) => !userIds.has(Number(x)))) errors.push('Recipients must be staff user accounts.');
    if (errors.length) return J({ detail: errors[0], errors }, 422);
    // Links: check new ones now (≤20), the rest stay pending for the cron.
    const urls = definitionLinks(next);
    const known = await linkStatuses(env, urls);
    const fresh = urls.filter((u) => !['ok', 'approved', 'blocked'].includes(known.get(u)));
    const blockedNow = urls.filter((u) => known.get(u) === 'blocked');
    let checked = [];
    if (fresh.length) {
      const { results } = await checkLinks(env, fresh.slice(0, LINK_MAX_PER_SAVE), { fetchImpl: deps.fetchImpl });
      checked = results;
      const overflow = fresh.slice(LINK_MAX_PER_SAVE).map((u) => ({ url: u, final_url: u, status: 'pending', reason: 'waiting for the scheduled check', http_status: null, threats: [] }));
      await storeLinkResults(env, [...results, ...overflow], { formId: form.id, userId: user.id });
    }
    const hardBlocked = [...checked.filter((r) => r.status === 'blocked'), ...blockedNow.map((u) => ({ url: u, reason: 'blocked' }))];
    if (hardBlocked.length && !body.send_to_admin) {
      return J({ detail: `Can't save this link: ${hardBlocked[0].url} (${hardBlocked[0].reason}). Send it to a Super Admin to verify?`, code: 'link_blocked', links: hardBlocked }, 422);
    }
    const text = JSON.stringify(next);
    const res = await env.DB.prepare(`UPDATE cms_forms SET definition_json = ?, title = ?, recipient_user_ids = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP, updated_by_name = ?,
      draft_json = NULL, draft_saved_at = NULL, draft_by = NULL, draft_by_name = '', draft_base_version = NULL WHERE id = ? AND version = ?`)
      .bind(text, next.title, JSON.stringify(next.email.to_user_ids), who(user), form.id, Number(body.base_version)).run();
    if (!res?.meta?.changes) {
      const cur = await formRow(env, form.id);
      return J({ detail: `${cur?.updated_by_name || 'Someone'} saved this form at ${cur?.updated_at || ''} UTC; reload to see their changes.`, code: 'conflict' }, 409);
    }
    const version = Number(body.base_version) + 1;
    await env.DB.batch([
      env.DB.prepare('INSERT INTO cms_form_versions (form_id, version, definition_json, saved_by, saved_by_name) VALUES (?, ?, ?, ?, ?)').bind(form.id, version, text, user.id, who(user)),
      env.DB.prepare('DELETE FROM cms_form_versions WHERE form_id = ? AND version <= ?').bind(form.id, version - FS_VERSIONS_KEPT),
    ]);
    const pages = await pagesUsingForm(env, form.id);
    if (deps.invalidatePages) await deps.invalidatePages(pages.map((x) => x.path));
    const removed = def.fields.filter((f) => !next.fields.some((n) => n.id === f.id));
    const subjectChanged = def.email.subject !== next.email.subject;
    const pending = [...checked.filter((r) => r.status !== 'ok')];
    await audit('change.forms', `saved the form ${next.title} (${next.fields.length} fields; live on ${pages.length} page${pages.length === 1 ? '' : 's'})${removed.length ? `; removed ${removed.map((f) => f.label).join(', ')}` : ''}${subjectChanged ? '; changed the email subject' : ''}${pending.length ? `; ${pending.length} link(s) sent to the Super Admins for review` : ''}`, { form_id: form.id, version });
    if (pending.length && deps.notice) await deps.notice(user.id, `${pending.length} link(s) on ${next.title} were sent for Super Admin review and stay disabled until approved.`, '/admin/forms-builder#/edit/' + form.id);
    return J({ ok: true, version, pages: pages.length, links: checked.map((r) => ({ url: r.url, status: r.status, reason: r.reason })) });
  }
  if (action === 'duplicate' && method === 'POST') {
    const copy = normalizeDefinition({ ...def, title: `${def.title} (copy)`.slice(0, 160), fields: def.fields.map((f) => ({ ...f, id: '' })) });
    const id = await insertForm(env, copy, user, '');
    await audit('change.forms', `duplicated ${def.title} as ${copy.title}`, { form_id: id, from: form.id });
    return J({ ok: true, id });
  }
  if (!action && method === 'DELETE') {
    const body = await request.json().catch(() => ({}));
    if (String(body.confirm_title || '') !== form.title) return J({ detail: 'Type the form title to confirm.' }, 422);
    const pages = await pagesUsingForm(env, form.id);
    let removedSubs = 0;
    if (body.delete_submissions) {
      if (!canDeleteSubmissions(user, deps.isSuperAdmin, deps.hasPermission)) return J({ detail: 'Only Super Admin, President, Vice President or Director can delete sign-ups early' }, 403);
      removedSubs = Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM form_submissions WHERE form_id = ? AND kind != 'inkind'").bind(form.id).first())?.n || 0);
      await env.DB.prepare("DELETE FROM form_submissions WHERE form_id = ? AND kind != 'inkind'").bind(form.id).run();
    }
    await env.DB.prepare('UPDATE cms_forms SET deleted_at = CURRENT_TIMESTAMP, draft_json = NULL WHERE id = ?').bind(form.id).run();
    if (deps.invalidatePages) await deps.invalidatePages(pages.map((x) => x.path));
    await audit('change.forms', `deleted the form ${form.title} (removed from ${pages.length} page${pages.length === 1 ? '' : 's'}; ${removedSubs ? `${removedSubs} sign-ups deleted` : 'sign-ups kept'})`, { form_id: form.id });
    return J({ ok: true });
  }
  if (action === 'submissions' && method === 'GET') {
    const w = subWhere(form);
    const status = url.searchParams.get('status') || '';
    const q = String(url.searchParams.get('q') || '').slice(0, 80);
    const offset = Math.max(0, Number(url.searchParams.get('offset') || 0) | 0);
    const extra = []; const binds = [...w.binds];
    if (['new', 'seen', 'done', 'spam'].includes(status)) { extra.push("COALESCE(s.status, 'new') = ?"); binds.push(status); }
    if (q) { extra.push('s.payload_json LIKE ?'); binds.push(`%${q.replace(/[%_]/g, '')}%`); }
    if (url.searchParams.get('from')) { extra.push('s.created_at >= ?'); binds.push(url.searchParams.get('from')); }
    if (url.searchParams.get('to')) { extra.push('s.created_at < date(?, \'+1 day\')'); binds.push(url.searchParams.get('to')); }
    const rows = (await env.DB.prepare(`SELECT s.* FROM form_submissions s WHERE ${w.sql}${extra.length ? ` AND ${extra.join(' AND ')}` : ''} ORDER BY s.created_at DESC, s.id DESC LIMIT 51 OFFSET ?`).bind(...binds, offset).all()).results || [];
    return J({ form: { id: form.id, title: form.title, deleted: Boolean(form.deleted_at) }, fields: def.fields.filter((f) => !['heading', 'note', 'pricing'].includes(f.type)).map((f) => ({ name: f.name, label: f.label })), submissions: rows.slice(0, 50).map(submissionRow), more: rows.length > 50, can_delete: canDeleteSubmissions(user, deps.isSuperAdmin, deps.hasPermission) });
  }
  if (action === 'export' && method === 'GET') {
    const w = subWhere(form);
    const offset = Math.max(0, Number(url.searchParams.get('offset') || 0) | 0);
    const rows = (await env.DB.prepare(`SELECT s.* FROM form_submissions s WHERE ${w.sql} ORDER BY s.id LIMIT 500 OFFSET ?`).bind(...w.binds, offset).all()).results || [];
    const cols = def.fields.filter((f) => !['heading', 'note', 'pricing'].includes(f.type));
    const lines = [['id', 'submitted_at', 'status', ...cols.map((c) => c.label)].map(csvCell).join(',')];
    for (const r of rows) { const flat = flatValues(json(r.payload_json)); lines.push([r.id, r.created_at, r.status || 'new', ...cols.map((c) => flat[c.name])].map(csvCell).join(',')); }
    await audit('change.forms', `exported ${rows.length} ${form.title} entries to CSV`, { form_id: form.id, offset });
    return new Response(`${lines.join('\r\n')}\r\n`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="form-${form.id}-${offset}.csv"`, 'cache-control': 'no-store' } });
  }
  if (action === 'test-email' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const d = normalizeDefinition(body.definition || def, form.title);
    const sample = {}; for (const f of d.fields) if (!['heading', 'note', 'pricing'].includes(f.type)) sample[f.name] = { value: f.type === 'email' ? 'example@example.com' : `EXAMPLE ${f.label}`.slice(0, 60), label: f.label };
    const mail = buildStaffMail(d, sample, await deps.siteTitle(env));
    const to = deps.userEmail(user);
    if (!to) return J({ preview: mail, detail: 'Your account has no email address; preview only.' });
    const result = await guardedSend(env, deps, { to: [to], subject: `[Test] ${mail.subject}`, text: mail.text, html: mail.html });
    return J({ preview: { subject: mail.subject, html: mail.html }, result: result === 'off' ? 'skipped (email off on this site)' : result });
  }
  if (action === 'links' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const list = (Array.isArray(body.urls) ? body.urls : []).map(String).slice(0, LINK_MAX_PER_SAVE);
    const { results } = await checkLinks(env, list, { fetchImpl: deps.fetchImpl });
    return J({ links: results.map((r) => ({ url: r.url, status: r.status, reason: r.reason })) });
  }
  return J({ detail: 'Not found' }, 404);
}

async function insertForm(env, def, user, legacyKind) {
  const slug = `fb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const row = await env.DB.prepare(`INSERT INTO cms_forms (slug, path, title, definition_json, recipient_user_ids, builder, legacy_kind, created_by, updated_by_name, version)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 1) RETURNING id`).bind(slug, `/_form-builder/${slug}`, def.title, JSON.stringify(def), JSON.stringify(def.email.to_user_ids), legacyKind, user.id, who(user)).first();
  await env.DB.prepare('INSERT INTO cms_form_versions (form_id, version, definition_json, saved_by, saved_by_name) VALUES (?, 1, ?, ?, ?)').bind(row.id, JSON.stringify(def), user.id, who(user)).run();
  return row.id;
}

// ---------- public submit ----------
async function submitForm(request, env, ctx, deps, id) {
  const J = deps.jsonResponse;
  await ensureFormStudioSchema(env);
  const row = await env.DB.prepare('SELECT id, title, definition_json FROM cms_forms WHERE id = ? AND builder = 1 AND deleted_at IS NULL').bind(id).first();
  if (!row) return J({ detail: 'Form not found' }, 404);
  const def = normalizeDefinition(json(row.definition_json), row.title);
  const payload = await request.json().catch(() => ({}));
  const ip = deps.clientIp(request) || 'unknown';
  const ipHash = (await sha256(`${ip}|${env.EFBAND_SECRET || 'efhs'}`)).slice(0, 32);
  if (String(payload.company || '').trim()) {
    await deps.spamAudit(request, def.title, 'honeypot', ctx);
    return J({ ok: true });
  }
  const now = Math.floor(Date.now() / 1000);
  const bucket = `submit:${ipHash}:${Math.floor(now / FS_RATE_WINDOW_S)}`;
  const hit = await env.DB.prepare('INSERT INTO form_rate (bucket, hits, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET hits = hits + 1 RETURNING hits').bind(bucket, now + FS_RATE_WINDOW_S).first();
  if (Number(hit?.hits || 0) > FS_RATE_LIMIT) return J({ detail: 'Too many sign-ups from this device. Please wait 10 minutes and try again.' }, 429);
  if (env.TURNSTILE_SECRET) {
    const token = String(payload['cf-turnstile-response'] || '');
    let ok = false;
    if (token) {
      try {
        const res = await (deps.fetchImpl || fetch)('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }) });
        ok = Boolean((await res.json())?.success);
      } catch { ok = false; }
    }
    if (!ok) { await deps.spamAudit(request, def.title, 'failed spam check', ctx); return J({ detail: 'Please complete the spam check and try again.' }, 403); }
  }
  const norm = normalizeSubmission(payload, def);
  if (!norm.ok) return J({ detail: norm.errors[0], errors: norm.errors }, 422);
  const purge = new Date(Date.now() + FS_RETENTION_DAYS * 864e5).toISOString().replace('T', ' ').slice(0, 19);
  const inserted = await env.DB.prepare(`INSERT INTO form_submissions (kind, payload_json, delivered, delivery_error, form_id, status, ip_hash, purge_after, mail_state)
    VALUES ('form-builder', ?, 0, '', ?, 'new', ?, ?, '{}') RETURNING id`).bind(JSON.stringify(norm.data), id, ipHash, purge).first();
  const subId = inserted?.id;
  // Mail: staff first, then the confirmation copy. Entry is already saved.
  const state = {};
  const queue = [];
  for (const kind of ['staff', 'confirm']) {
    const msg = await composeMail(env, deps, def, norm.data, kind, subId);
    if (!msg) { state[kind] = kind === 'staff' ? 'no recipients' : 'off'; continue; }
    const r = await guardedSend(env, deps, msg);
    state[kind] = r === 'off' ? 'skipped (email off on dev)' : r === 'queued' ? 'email delayed' : r;
    if (r === 'queued') queue.push(kind);
  }
  const stmts = [env.DB.prepare('UPDATE form_submissions SET mail_state = ?, delivered = ?, delivery_error = ? WHERE id = ?').bind(JSON.stringify(state), state.staff === 'sent' ? 1 : 0, String(state.staff || '').startsWith('failed') ? state.staff : '', subId)];
  for (const kind of queue) stmts.push(env.DB.prepare('INSERT INTO form_mail_queue (submission_id, kind) VALUES (?, ?)').bind(subId, kind));
  await env.DB.batch(stmts);
  return J({ ok: true, id: subId, detail: def.success_message || `Thank you. Your ${def.title} was sent.` });
}

export async function composeMail(env, deps, def, data, kind, subId) {
  const siteTitle = await deps.siteTitle(env);
  const flat = flatValues(data);
  if (kind === 'staff') {
    const to = await deps.recipientEmails(env, def.email.to_user_ids.slice(0, FS_MAX_RECIPIENTS));
    if (!to.length) return null;
    const mail = buildStaffMail(def, data, siteTitle);
    const replyTo = flat[def.email.reply_to_field] || flat.email || undefined;
    return { to, replyTo, subject: mail.subject, text: mail.text, html: mail.html, attachments: [{ filename: `form-${subId}.pdf`, content: mail.pdf, content_type: 'application/pdf' }] };
  }
  if (!def.email.confirm_copy) return null;
  const emailField = def.fields.find((f) => f.type === 'email' && flat[f.name]);
  if (!emailField) return null;
  const mail = buildConfirmMail(def, data, siteTitle);
  return { to: [flat[emailField.name]], subject: mail.subject, text: mail.text, html: mail.html };
}

// ---------- link review queue (Super Admin only) ----------
async function linkReviewApi(request, env, url, ctx, deps) {
  const J = deps.jsonResponse;
  const auth = await deps.requireLogin(request, env);
  if (auth.response) return auth.response;
  if (!deps.isSuperAdmin(auth.user)) return J({ detail: 'Only a Super Admin can review links' }, 403);
  await ensureFormStudioSchema(env);
  const user = auth.user; const method = request.method;
  const audit = (detail, meta = {}) => deps.audit(request, user, { action: 'change.admin', detail, meta, status: 200, ctx });
  if (url.pathname === '/api/admin/link-reviews' && method === 'GET') {
    const rows = (await env.DB.prepare(`SELECT r.id, r.reason, r.status, r.created_at, r.requested_by, c.url, c.status AS check_status, c.http_status, c.checked_at,
      (SELECT COUNT(*) FROM link_uses u WHERE u.url_hash = r.url_hash) AS uses FROM link_reviews r LEFT JOIN link_checks c ON c.url_hash = r.url_hash
      WHERE r.status = 'pending' ORDER BY r.id DESC LIMIT 100`).all()).results || [];
    const broken = (await env.DB.prepare("SELECT url, status, reason, checked_at FROM link_checks WHERE status IN ('unreachable','blocked') AND url_hash IN (SELECT url_hash FROM link_uses) LIMIT 100").all()).results || [];
    const blocklist = (await env.DB.prepare('SELECT id, pattern, reason, created_at FROM link_blocklist ORDER BY pattern').all()).results || [];
    return J({ reviews: rows, broken, blocklist, safe_browsing: env.GOOGLE_SAFE_BROWSING ? 'configured' : 'Safe Browsing unavailable (no key)' });
  }
  const dm = url.pathname.match(/^\/api\/admin\/link-reviews\/(\d+)$/);
  if (dm && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const decision = body.decision === 'approve' ? 'approved' : body.decision === 'reject' ? 'rejected' : '';
    if (!decision) return J({ detail: 'decision must be approve or reject' }, 422);
    const r = await env.DB.prepare('SELECT r.*, c.url FROM link_reviews r LEFT JOIN link_checks c ON c.url_hash = r.url_hash WHERE r.id = ?').bind(Number(dm[1])).first();
    if (!r) return J({ detail: 'Not found' }, 404);
    const note = String(body.note || '').slice(0, 300);
    await env.DB.batch([
      env.DB.prepare('UPDATE link_reviews SET status = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP, note = ? WHERE id = ?').bind(decision, user.id, note, r.id),
      env.DB.prepare(`UPDATE link_checks SET status = ? WHERE url_hash = ?`).bind(decision === 'approved' ? 'approved' : 'blocked', r.url_hash),
      ...(r.requested_by ? [env.DB.prepare('INSERT INTO studio_notices (user_id, text) VALUES (?, ?)').bind(r.requested_by, `${r.url} was ${decision} by a Super Admin.`)] : []),
    ]);
    const uses = Number((await env.DB.prepare('SELECT COUNT(*) AS n FROM link_uses WHERE url_hash = ?').bind(r.url_hash).first())?.n || 0);
    await audit(`${decision} ${r.url}${decision === 'approved' ? ` (now enabled in ${uses} place${uses === 1 ? '' : 's'})` : ''}${note ? `. Note: ${note}` : ''}`, { review_id: r.id });
    return J({ ok: true });
  }
  if (url.pathname === '/api/admin/link-reviews/blocklist' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const pattern = String(body.pattern || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(pattern)) return J({ detail: 'Enter a host name like example.net' }, 422);
    await env.DB.prepare('INSERT OR IGNORE INTO link_blocklist (pattern, reason, created_by) VALUES (?, ?, ?)').bind(pattern, String(body.reason || '').slice(0, 200), user.id).run();
    await audit(`added ${pattern} to the link blocklist`);
    return J({ ok: true });
  }
  const bm = url.pathname.match(/^\/api\/admin\/link-reviews\/blocklist\/(\d+)$/);
  if (bm && method === 'DELETE') {
    const b = await env.DB.prepare('SELECT pattern FROM link_blocklist WHERE id = ?').bind(Number(bm[1])).first();
    await env.DB.prepare('DELETE FROM link_blocklist WHERE id = ?').bind(Number(bm[1])).run();
    if (b) await audit(`removed ${b.pattern} from the link blocklist`);
    return J({ ok: true });
  }
  return J({ detail: 'Not found' }, 404);
}

async function noticesApi(request, env, deps) {
  const auth = await deps.requireLogin(request, env);
  if (auth.response) return auth.response;
  await ensureFormStudioSchema(env);
  if (request.method === 'POST') {
    await env.DB.prepare('UPDATE studio_notices SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL').bind(auth.user.id).run();
    return deps.jsonResponse({ ok: true });
  }
  const rows = (await env.DB.prepare('SELECT id, text, link, read_at, created_at FROM studio_notices WHERE user_id = ? ORDER BY id DESC LIMIT 20').bind(auth.user.id).all()).results || [];
  return deps.jsonResponse({ notices: rows });
}

export { renderFormHtml, esc };
