/* People & Access (plan 2.24 / 2.24a, mockups 16a). */
(function () {
  "use strict";
  var root = document.getElementById("pp-root");
  if (!root) return;
  var body = document.body;
  var ME = Number(body.dataset.me || 0);
  var IS_SUPER = body.dataset.super === "1";
  var IS_ADMIN = body.dataset.siteAdmin === "1";
  var ROLES = { staff: [["director", "Director"], ["assistant-director", "Assistant Director"], ["staff", "Staff"]], boosters: [["president", "President"], ["vice-president", "Vice President"], ["secretary", "Secretary"], ["treasurer", "Treasurer"], ["committee", "Committee"]] };
  var SITE = { editor: "Editor", site_admin: "Admin", admin: "Super Admin" };
  var PERM_LABEL = { site: "Site settings", pages: "Pages", sponsors: "Sponsors", treasurer: "Treasurer", president: "President", "vice-president": "Vice President", staff: "Staff cards", boosters: "Booster cards", users: "People & Access", mail: "Mail", events: "Events", forms: "Forms", photos: "Photos", fundraising: "Fundraising", "minutes:edit": "Minutes", caldev: "Calendar", director: "Director" };
  var state = { data: null, filter: "all", q: "" };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function api(path, opts) {
    opts = opts || {};
    return fetch(path, { method: opts.method || "GET", credentials: "same-origin", headers: opts.body ? { "content-type": "application/json" } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.detail || ("Error " + r.status)); e.status = r.status; throw e; } return j; }); });
  }
  function roleLabel(p) {
    var list = ROLES[p.person_group] || [];
    for (var i = 0; i < list.length; i++) if (list[i][0] === p.group_role) return p.group_role === "committee" && p.committee_label ? "Committee · " + p.committee_label : list[i][1];
    return "";
  }
  function tags(p) {
    var t = [];
    if (p.role === "admin") t.push('<span class="pp-tag super">Super Admin</span>');
    else if (p.role === "site_admin") t.push('<span class="pp-tag admin">Admin</span>');
    if (p.locked) t.push('<span class="pp-tag lock">🔒 Locked</span>');
    if (!p.can_login) t.push('<span class="pp-tag off">Profile only</span>');
    if (!p.active) t.push('<span class="pp-tag off">Inactive</span>');
    if (p.card_show) t.push('<span class="pp-tag">Public card</span>');
    return t.join("");
  }
  var FILTERS = [["all", "All"], ["staff", "Staff"], ["boosters", "Boosters"], ["login", "Can log in"], ["profile", "Profile only"], ["admins", "Site admins"], ["locked", "🔒 Locked"]];
  function matches(p, f) {
    if (f === "staff" || f === "boosters") return p.person_group === f;
    if (f === "login") return p.can_login;
    if (f === "profile") return !p.can_login;
    if (f === "admins") return p.role === "admin" || p.role === "site_admin";
    if (f === "locked") return p.locked;
    return true;
  }
  function visible() {
    var q = state.q.toLowerCase();
    return state.data.people.filter(function (p) {
      return matches(p, state.filter) && (!q || (p.display_name + " " + p.username + " " + roleLabel(p) + " " + p.card_title).toLowerCase().indexOf(q) >= 0);
    });
  }

  function render() {
    var d = state.data;
    var rows = visible();
    var html = '<div class="pp-head"><h1>People &amp; Access</h1><div class="pp-tools"><input class="pp-search" type="search" placeholder="Search people" aria-label="Search people" value="' + esc(state.q) + '">' +
      '<button class="pp-btn primary" data-act="add">+ Add person</button>' +
      (IS_ADMIN ? '<button class="pp-btn" data-act="migrate">Move old cards…</button>' : "") + "</div></div>";
    html += '<div class="pp-pills" role="group" aria-label="Filter">' + FILTERS.map(function (f) {
      var n = d.people.filter(function (p) { return matches(p, f[0]); }).length;
      return '<button class="pp-pill" data-filter="' + f[0] + '" aria-pressed="' + (state.filter === f[0]) + '">' + esc(f[1]) + "<b>" + n + "</b></button>";
    }).join("") + "</div>";
    if (d.review && d.review.length) {
      html += '<div class="pp-review"><strong>' + d.review.length + " need a decision</strong> — these names are on both the Staff and Boosters lists (or match more than one login)." +
        d.review.map(function (r) {
          return '<div class="pp-review-row"><span class="pp-name">' + esc(r.name) + "</span>" +
            (r.staff_id ? '<button class="pp-btn" data-review="' + r.id + '" data-keep="staff">Keep Staff</button>' : "") +
            (r.booster_id ? '<button class="pp-btn" data-review="' + r.id + '" data-keep="boosters">Keep Boosters</button>' : "") + "</div>";
        }).join("") + "</div>";
    }
    if (!rows.length) html += '<p class="pp-empty">No people match.</p>';
    else {
      html += '<table class="pp-table"><colgroup><col style="width:30%"><col style="width:22%"><col style="width:30%"><col style="width:18%"></colgroup><thead><tr><th>Name</th><th>Group role</th><th>Access</th><th>Last login</th></tr></thead><tbody>' +
        rows.map(function (p) {
          return '<tr data-id="' + p.id + '" tabindex="0"><td><div class="pp-name">' + esc(p.display_name) + '</div><div class="pp-sub">' + esc(p.username || "—") + "</div></td><td>" + esc(roleLabel(p) || "—") + "</td><td>" + tags(p) + "</td><td class=\"pp-sub\">" + esc(p.last_login_at ? String(p.last_login_at).slice(0, 10) : "—") + "</td></tr>";
        }).join("") + "</tbody></table>";
      html += '<div class="pp-cards">' + rows.map(function (p) {
        return '<div class="pp-card" data-id="' + p.id + '" tabindex="0"><div class="pp-name">' + esc(p.display_name) + '</div><div class="pp-sub">' + esc(roleLabel(p) || p.username || "") + "</div><div>" + tags(p) + "</div></div>";
      }).join("") + "</div>";
    }
    html += matrix();
    root.innerHTML = html;
  }

  function matrix() {
    var presets = state.data.presets || {};
    var perms = state.data.permissions.filter(function (k) { return k !== "users"; });
    var roles = Object.keys(presets);
    return '<section class="pp-matrix" aria-label="Role defaults"><h3 style="margin:0 0 6px;font-size:13px;color:#5b6680;text-transform:uppercase">Role defaults' + (IS_SUPER ? "" : " (read-only)") + '</h3><table><thead><tr><th>Role</th><th>Login</th>' +
      perms.map(function (k) { return "<th>" + esc(PERM_LABEL[k] || k) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      roles.map(function (r) {
        var pr = presets[r];
        return "<tr><td>" + esc(r) + '</td><td><input type="checkbox" data-preset="' + r + '" data-login="1"' + (pr.login_default ? " checked" : "") + (IS_SUPER && r !== "committee" ? "" : " disabled") + ' aria-label="' + esc(r) + ' login"></td>' +
          perms.map(function (k) { return '<td><input type="checkbox" data-preset="' + r + '" data-perm="' + k + '"' + (pr.permissions.indexOf(k) >= 0 ? " checked" : "") + (IS_SUPER ? "" : " disabled") + ' aria-label="' + esc(r + " " + k) + '"></td>'; }).join("") + "</tr>";
      }).join("") + "</tbody></table>" + (IS_SUPER ? '<div class="pp-row" style="margin-top:8px"><button class="pp-btn" data-act="save-presets">Save role defaults</button><span class="pp-sub" data-preset-msg></span></div>' : "") + "</section>";
  }

  function closeSheet() { var v = document.querySelector(".pp-veil"); if (v) v.remove(); body.classList.remove("pp-modal"); }

  function openSheet(p) {
    var isNew = !p;
    p = p || { display_name: "", username: "", role: "editor", permissions: [], active: true, can_login: true, person_group: "", group_role: "", committee_label: "", card_title: "", card_bio: "", card_photo_id: "", card_show: false, card_order: 0, email: "", locked: false };
    var self = !isNew && Number(p.id) === ME;
    var draft = JSON.parse(JSON.stringify(p));
    var veil = document.createElement("div");
    veil.className = "pp-veil";
    body.appendChild(veil);
    body.classList.add("pp-modal");
    function seg(name, opts, val, disabledFn) {
      return '<div class="pp-seg" role="group" data-seg="' + name + '">' + opts.map(function (o) { return '<button type="button" data-v="' + esc(o[0]) + '" aria-pressed="' + (val === o[0]) + '"' + (disabledFn && disabledFn(o[0]) ? " disabled" : "") + ">" + esc(o[1]) + "</button>"; }).join("") + "</div>";
    }
    function draw(err) {
      var superTarget = p.role === "admin" && !isNew;
      var lockedOut = superTarget && !IS_SUPER;
      var roleOpts = [["editor", "Editor"], ["site_admin", "Admin"], ["admin", "Super Admin"]];
      var siteDisabled = function (v) { if (lockedOut) return true; if (self && !IS_SUPER) return v !== p.role; if (v === "admin") return !IS_SUPER; if (v === "site_admin") return !IS_ADMIN; return false; };
      var permsDisabled = lockedOut || (self && !IS_SUPER) || draft.role !== "editor";
      var html = '<div class="pp-sheet" role="dialog" aria-modal="true" aria-label="' + (isNew ? "Add person" : "Edit " + esc(p.display_name)) + '"><header><h2>' + (isNew ? "Add person" : esc(p.display_name)) + '</h2><button class="pp-x" data-close aria-label="Close">×</button></header><div class="pp-body">';
      html += '<div class="pp-sec"><h3>Person</h3><div class="pp-row"><input class="pp-in" data-f="display_name" placeholder="Full name" aria-label="Full name" value="' + esc(draft.display_name) + '"><input class="pp-in" data-f="email" placeholder="Email (optional)" aria-label="Email" value="' + esc(draft.email) + '"></div>' +
        '<div class="pp-row"><label>Group</label>' + seg("person_group", [["", "None"], ["staff", "Staff"], ["boosters", "Boosters"]], draft.person_group) + "</div>" +
        (draft.person_group ? '<div class="pp-row"><label>Role</label>' + seg("group_role", ROLES[draft.person_group], draft.group_role) +
          (draft.group_role === "committee" ? '<input class="pp-in" data-f="committee_label" placeholder="Committee (e.g. Concessions)" aria-label="Committee" value="' + esc(draft.committee_label) + '">' : "") +
          (draft.group_role ? '<button type="button" class="pp-btn" data-act="apply-preset">Use role defaults</button>' : "") + "</div>" : "") + "</div>";
      var realUser = draft.username && draft.username.indexOf("profile-") !== 0;
      html += '<div class="pp-sec"><h3>Login</h3><div class="pp-row"><label><input type="checkbox" data-f="can_login"' + (draft.can_login ? " checked" : "") + (lockedOut || (draft.group_role === "committee" && !IS_ADMIN && !p.can_login) ? " disabled" : "") + "> Can log in</label>" +
        (!isNew ? '<label><input type="checkbox" data-f="active"' + (draft.active ? " checked" : "") + (lockedOut || self ? " disabled" : "") + "> Active</label>" : "") + "</div>" +
        (draft.can_login ? '<div class="pp-row"><input class="pp-in" data-f="username" placeholder="Username" aria-label="Username" autocomplete="off" value="' + esc(realUser ? draft.username : "") + '"' + (lockedOut ? " disabled" : "") + '><input class="pp-in" type="password" data-f="password" autocomplete="new-password" placeholder="' + (p.can_login && realUser ? "New password (leave blank to keep)" : "Password") + '" aria-label="Password"' + (lockedOut ? " disabled" : "") + "></div>" : '<p class="pp-note">Profile only — this person has a public card but cannot log in.</p>') +
        (!isNew ? '<div class="pp-row"><span>' + (p.locked ? '<span class="pp-tag lock">🔒 Locked</span>' : '<span class="pp-tag">Not locked</span>') + "</span>" +
          (IS_ADMIN && !self && !lockedOut ? '<button type="button" class="pp-btn ' + (p.locked ? "" : "danger") + '" data-act="' + (p.locked ? "unlock" : "lock") + '">' + (p.locked ? "Unlock" : "Lock account") + "</button>" : "") +
          '<p class="pp-note">A locked person sees the locked message only after typing the right password.</p></div>' : "") + "</div>";
      html += '<div class="pp-sec"><h3>Site access</h3><div class="pp-row"><label>Site role</label>' + seg("role", roleOpts, draft.role, siteDisabled) + "</div>" +
        (draft.role === "editor" ? '<div class="pp-perms">' + state.data.permissions.filter(function (k) { return k !== "users" || IS_ADMIN; }).map(function (k) {
          return '<label><input type="checkbox" data-perm="' + k + '"' + (draft.permissions.indexOf(k) >= 0 ? " checked" : "") + (permsDisabled ? " disabled" : "") + "> " + esc(PERM_LABEL[k] || k) + "</label>";
        }).join("") + "</div>" : '<p class="pp-note">' + (draft.role === "admin" ? "Super Admin can do everything." : "Admin can do everything except themes, the logo and the Security Log, and can't change a Super Admin.") + "</p>") +
        (self && !IS_SUPER ? '<p class="pp-note">You can’t change your own role or permissions.</p>' : "") + "</div>";
      html += '<div class="pp-sec"><h3>Public card</h3><div class="pp-row"><label><input type="checkbox" data-f="card_show"' + (draft.card_show ? " checked" : "") + '> Show on the public page</label><input class="pp-in" data-f="card_order" type="number" min="0" max="999" style="flex:0 0 90px" aria-label="Order" value="' + esc(draft.card_order) + '"></div>' +
        '<div class="pp-row"><input class="pp-in" data-f="card_title" placeholder="Card title" aria-label="Card title" value="' + esc(draft.card_title) + '"><input class="pp-in" data-f="card_photo_id" placeholder="Photo (from the photo library)" aria-label="Photo" value="' + esc(draft.card_photo_id) + '"></div>' +
        '<div class="pp-row"><textarea class="pp-in" data-f="card_bio" placeholder="Bio" aria-label="Bio">' + esc(draft.card_bio) + '</textarea><p class="pp-note">Public Staff and Boosters pages still use the old lists until the switch is made.</p></div></div>';
      html += (err ? '<p class="pp-err" role="alert">' + esc(err) + "</p>" : "") + "</div>";
      html += '<footer><p class="pp-foot-note">Every change is recorded in the Security Log.</p><div class="pp-left"></div><div class="pp-right"><button type="button" class="pp-btn" data-close>Cancel</button><button type="button" class="pp-btn primary" data-act="save"' + (lockedOut ? " disabled" : "") + ">Save</button></div></footer></div>";
      veil.innerHTML = html;
    }
    function collect() {
      veil.querySelectorAll("[data-f]").forEach(function (el) {
        var k = el.dataset.f;
        if (el.type === "checkbox") draft[k] = el.checked; else if (k === "card_order") draft[k] = Number(el.value || 0); else draft[k] = el.value;
      });
      if (draft.role === "editor") {
        var boxes = veil.querySelectorAll("[data-perm]");
        if (boxes.length) draft.permissions = Array.prototype.filter.call(boxes, function (b) { return b.checked; }).map(function (b) { return b.dataset.perm; });
      }
    }
    draw();
    veil.addEventListener("click", function (e) {
      var t = e.target;
      if (t === veil || t.closest("[data-close]")) { closeSheet(); return; }
      var segBtn = t.closest("[data-seg] button");
      if (segBtn && !segBtn.disabled) {
        collect();
        var name = segBtn.parentNode.dataset.seg;
        draft[name] = segBtn.dataset.v;
        if (name === "person_group") { draft.group_role = ""; draft.committee_label = ""; }
        if (name === "group_role" && isNew) {
          var pr = state.data.presets[draft.group_role];
          if (pr) { draft.permissions = pr.permissions.slice(); draft.can_login = Boolean(pr.login_default); }
        }
        draw();
        return;
      }
      var act = t.closest("[data-act]");
      if (!act) return;
      var a = act.dataset.act;
      if (a === "apply-preset") { collect(); var pr2 = state.data.presets[draft.group_role]; if (pr2) draft.permissions = pr2.permissions.slice(); draw(); }
      if (a === "lock" || a === "unlock") {
        if (a === "lock" && !confirm("Lock " + p.display_name + "? They won’t be able to sign in until unlocked.")) return;
        act.disabled = true;
        api("/api/admin/people/" + p.id + "/" + a, { method: "POST", body: {} }).then(function () { closeSheet(); load(); }).catch(function (er) { draw(er.message); });
      }
      if (a === "save") {
        collect();
        act.disabled = true;
        var payload = { display_name: draft.display_name, email: draft.email, role: draft.role, permissions: draft.permissions, active: draft.active, can_login: draft.can_login, person_group: draft.person_group, group_role: draft.group_role, committee_label: draft.committee_label, card_title: draft.card_title, card_bio: draft.card_bio, card_photo_id: draft.card_photo_id, card_show: draft.card_show, card_order: draft.card_order, username: draft.username || "", password: draft.password || "" };
        api(isNew ? "/api/admin/people" : "/api/admin/people/" + p.id, { method: isNew ? "POST" : "PUT", body: payload }).then(function () { closeSheet(); load(); }).catch(function (er) { draft.password = ""; draw(er.message); });
      }
    });
    veil.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });
    var first = veil.querySelector("[data-f=display_name]"); if (first) first.focus();
  }

  root.addEventListener("input", function (e) { if (e.target.classList.contains("pp-search")) { state.q = e.target.value; var pos = e.target.selectionStart; render(); var s = root.querySelector(".pp-search"); s.focus(); s.setSelectionRange(pos, pos); } });
  root.addEventListener("click", function (e) {
    var t = e.target;
    var f = t.closest("[data-filter]"); if (f) { state.filter = f.dataset.filter; render(); return; }
    var row = t.closest("[data-id]"); if (row) { var id = Number(row.dataset.id); openSheet(state.data.people.filter(function (p) { return p.id === id; })[0]); return; }
    var rv = t.closest("[data-review]");
    if (rv) { rv.disabled = true; api("/api/admin/people/review/" + rv.dataset.review, { method: "POST", body: { keep: rv.dataset.keep } }).then(load).catch(function (er) { alert(er.message); rv.disabled = false; }); return; }
    var act = t.closest("[data-act]"); if (!act) return;
    if (act.dataset.act === "add") openSheet(null);
    if (act.dataset.act === "migrate") {
      api("/api/admin/people/migrate", { method: "POST", body: { dry_run: true } }).then(function (plan) {
        var links = plan.actions.filter(function (a) { return a.type === "link"; }).length;
        var ins = plan.actions.length - links;
        if (!plan.actions.length && !plan.review.length) { alert("Nothing left to move."); return; }
        if (confirm("Move old Staff/Booster cards?\n\n" + links + " join an existing login\n" + ins + " become profile-only people\n" + plan.review.length + " need a decision\n\nPublic pages don’t change.")) {
          api("/api/admin/people/migrate", { method: "POST", body: { dry_run: false } }).then(load).catch(function (er) { alert(er.message); });
        }
      }).catch(function (er) { alert(er.message); });
    }
    if (act.dataset.act === "save-presets") {
      var out = {};
      root.querySelectorAll("[data-preset]").forEach(function (b) {
        var r = b.dataset.preset; out[r] = out[r] || { permissions: [], login_default: 0 };
        if (b.dataset.login) out[r].login_default = b.checked ? 1 : 0; else if (b.checked) out[r].permissions.push(b.dataset.perm);
      });
      api("/api/admin/people/presets", { method: "PUT", body: out }).then(function (j) { state.data.presets = j.presets; var m = root.querySelector("[data-preset-msg]"); if (m) m.textContent = "Saved."; }).catch(function (er) { alert(er.message); });
    }
  });
  root.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.matches("[data-id]")) e.target.click(); });

  function load() {
    return api("/api/admin/people").then(function (d) { state.data = d; render(); }).catch(function (er) { root.innerHTML = '<p class="pp-empty">' + esc(er.message) + "</p>"; });
  }
  load().then(function () {
    var want = Number(new URLSearchParams(location.search).get("edit") || 0);
    var list = state.data && (state.data.people || []);
    var hit = want && list.filter(function (x) { return Number(x.id) === want; })[0];
    if (hit) openSheet(hit);
  });
})();
