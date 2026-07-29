from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import shutil
import sqlite3
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA_DIR = ROOT / "data"
SESSION_COOKIE = "efband_session"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def data_dir() -> Path:
    path = Path(os.environ.get("EFBAND_DATA_DIR", DEFAULT_DATA_DIR))
    path.mkdir(parents=True, exist_ok=True)
    (path / "uploads").mkdir(exist_ok=True)
    return path


def db_path() -> Path:
    return data_dir() / "site.db"


def secret_key() -> str:
    return os.environ.get("EFBAND_SECRET", "change-me-before-launch")


def admin_username() -> str:
    return os.environ.get("EFBAND_ADMIN_USERNAME", "admin")


def admin_password() -> str:
    return os.environ.get("EFBAND_ADMIN_PASSWORD", "admin123$")


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    iterations = 260_000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), iterations)
    encoded = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    return f"pbkdf2_sha256${iterations}${salt}${encoded}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations_text, salt, expected = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iterations_text))
        actual = base64.urlsafe_b64encode(digest).decode().rstrip("=")
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def get_admin_password_hash() -> str:
    with connect() as conn:
        row = conn.execute("SELECT value FROM auth_settings WHERE key = 'admin_password_hash'").fetchone()
    if row is None:
        return hash_password(admin_password())
    return row["value"]


def verify_admin_password(password: str) -> bool:
    return verify_password(password, get_admin_password_hash())


def set_admin_password(password: str) -> None:
    password_hash = hash_password(password)
    with connect() as conn:
        conn.execute(
            "INSERT INTO auth_settings (key, value) VALUES ('admin_password_hash', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (password_hash,),
        )


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    return conn


DEFAULT_SITE = {
    "title": "East Forsyth Band",
    "hero_title": "Sound. Spirit. Eagle Pride.",
    "hero_subtitle": "A polished home for the East Forsyth Band program — built for students, families, alumni, sponsors, and the Kernersville community.",
    "footer_note": "Draft website for the East Forsyth High School band program. Replace placeholder copy with official program details before launch.",
}

DEFAULT_EVENTS = [
    {
        "date_label": "Aug",
        "date_detail": "01",
        "title": "Band Camp / Preseason Prep",
        "description": "Placeholder: add official summer band camp dates, times, and location.",
        "sort_order": 1,
    },
    {
        "date_label": "Aug",
        "date_detail": "TBD",
        "title": "Parent Preview Night",
        "description": "Placeholder: add location and what families should bring.",
        "sort_order": 2,
    },
    {
        "date_label": "Sep",
        "date_detail": "FRI",
        "title": "Football Game Performance",
        "description": "Placeholder: add football schedule and call times when available.",
        "sort_order": 3,
    },
    {
        "date_label": "Oct",
        "date_detail": "TBD",
        "title": "Marching Competition",
        "description": "Placeholder: add itinerary, address, ticket info, and volunteer needs.",
        "sort_order": 4,
    },
]


class SiteContent(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    hero_title: str = Field(min_length=1, max_length=160)
    hero_subtitle: str = Field(min_length=1, max_length=500)
    footer_note: str = Field(min_length=1, max_length=500)


class EventPayload(BaseModel):
    date_label: str = Field(min_length=1, max_length=20)
    date_detail: str = Field(min_length=1, max_length=20)
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=800)
    sort_order: int = 0


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


def init_db() -> None:
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS site_content (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date_label TEXT NOT NULL,
                date_detail TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS photos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                original_name TEXT NOT NULL,
                alt_text TEXT NOT NULL,
                caption TEXT NOT NULL DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        existing_site = conn.execute("SELECT COUNT(*) FROM site_content").fetchone()[0]
        existing_password = conn.execute("SELECT COUNT(*) FROM auth_settings WHERE key = 'admin_password_hash'").fetchone()[0]
        if existing_password == 0:
            conn.execute(
                "INSERT INTO auth_settings (key, value) VALUES ('admin_password_hash', ?)",
                (hash_password(admin_password()),),
            )
        if existing_site == 0:
            conn.executemany(
                "INSERT INTO site_content (key, value) VALUES (?, ?)",
                DEFAULT_SITE.items(),
            )
        existing_events = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        if existing_events == 0:
            conn.executemany(
                """
                INSERT INTO events (date_label, date_detail, title, description, sort_order)
                VALUES (:date_label, :date_detail, :title, :description, :sort_order)
                """,
                DEFAULT_EVENTS,
            )


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return dict(row)


def get_site_content() -> dict[str, str]:
    with connect() as conn:
        rows = conn.execute("SELECT key, value FROM site_content").fetchall()
    payload = DEFAULT_SITE.copy()
    payload.update({row["key"]: row["value"] for row in rows})
    return payload


def get_events() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, date_label, date_detail, title, description, sort_order FROM events ORDER BY sort_order, id"
        ).fetchall()
    return [row_to_dict(row) for row in rows]


def get_photos() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, filename, original_name, alt_text, caption, sort_order FROM photos ORDER BY sort_order, id"
        ).fetchall()
    photos = []
    for row in rows:
        item = row_to_dict(row)
        item["url"] = f"/uploads/{quote(item['filename'])}"
        photos.append(item)
    return photos


def sign(value: str) -> str:
    digest = hmac.new(secret_key().encode(), value.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def make_session(username: str) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({"u": username, "t": int(time.time())}).encode()).decode().rstrip("=")
    return f"{payload}.{sign(payload)}"


def verify_session(cookie: str | None) -> bool:
    if not cookie or "." not in cookie:
        return False
    payload, supplied = cookie.rsplit(".", 1)
    if not hmac.compare_digest(sign(payload), supplied):
        return False
    try:
        decoded = base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))
        data = json.loads(decoded)
    except Exception:
        return False
    return data.get("u") == admin_username()


def require_admin(request: Request) -> None:
    if not verify_session(request.cookies.get(SESSION_COOKIE)):
        raise HTTPException(status_code=401, detail="Admin login required")


def wants_html(request: Request) -> bool:
    return "text/html" in request.headers.get("accept", "")


app = FastAPI(title="East Forsyth Band Backend")
init_db()
app.mount("/assets", StaticFiles(directory=ROOT / "assets"), name="assets")
app.mount("/uploads", StaticFiles(directory=data_dir() / "uploads"), name="uploads")


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/api/site")
def api_site() -> dict[str, str]:
    return get_site_content()


@app.get("/api/events")
def api_events() -> list[dict[str, Any]]:
    return get_events()


@app.get("/api/photos")
def api_photos() -> list[dict[str, Any]]:
    return get_photos()


@app.post("/api/admin/site")
def update_site(payload: SiteContent, _: None = Depends(require_admin)) -> dict[str, str]:
    with connect() as conn:
        conn.executemany(
            "INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            payload.model_dump().items(),
        )
    return get_site_content()


@app.post("/api/admin/password")
def change_password(payload: PasswordChange, _: None = Depends(require_admin)) -> dict[str, bool]:
    if not verify_admin_password(payload.current_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    set_admin_password(payload.new_password)
    return {"ok": True}


@app.post("/api/admin/events")
def create_event(payload: EventPayload, _: None = Depends(require_admin)) -> dict[str, Any]:
    with connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO events (date_label, date_detail, title, description, sort_order)
            VALUES (?, ?, ?, ?, ?)
            """,
            (payload.date_label, payload.date_detail, payload.title, payload.description, payload.sort_order),
        )
        event_id = cur.lastrowid
        row = conn.execute("SELECT id, date_label, date_detail, title, description, sort_order FROM events WHERE id = ?", (event_id,)).fetchone()
    return row_to_dict(row)


@app.put("/api/admin/events/{event_id}")
def update_event(event_id: int, payload: EventPayload, _: None = Depends(require_admin)) -> dict[str, Any]:
    with connect() as conn:
        cur = conn.execute(
            """
            UPDATE events SET date_label = ?, date_detail = ?, title = ?, description = ?, sort_order = ?
            WHERE id = ?
            """,
            (payload.date_label, payload.date_detail, payload.title, payload.description, payload.sort_order, event_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Event not found")
        row = conn.execute("SELECT id, date_label, date_detail, title, description, sort_order FROM events WHERE id = ?", (event_id,)).fetchone()
    return row_to_dict(row)


@app.delete("/api/admin/events/{event_id}")
def delete_event(event_id: int, _: None = Depends(require_admin)) -> dict[str, bool]:
    with connect() as conn:
        cur = conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Event not found")
    return {"ok": True}


@app.post("/api/admin/photos")
def upload_photo(
    file: UploadFile = File(...),
    alt_text: str = Form(...),
    caption: str = Form(""),
    sort_order: int = Form(0),
    _: None = Depends(require_admin),
) -> dict[str, Any]:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Upload a JPG, PNG, WEBP, or GIF image")
    safe_name = f"{int(time.time())}-{secrets.token_hex(6)}{ext}"
    destination = data_dir() / "uploads" / safe_name
    with destination.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO photos (filename, original_name, alt_text, caption, sort_order) VALUES (?, ?, ?, ?, ?)",
            (safe_name, file.filename or safe_name, alt_text, caption, sort_order),
        )
        photo_id = cur.lastrowid
        row = conn.execute("SELECT id, filename, original_name, alt_text, caption, sort_order FROM photos WHERE id = ?", (photo_id,)).fetchone()
    item = row_to_dict(row)
    item["url"] = f"/uploads/{quote(item['filename'])}"
    return item


@app.delete("/api/admin/photos/{photo_id}")
def delete_photo(photo_id: int, _: None = Depends(require_admin)) -> dict[str, bool]:
    with connect() as conn:
        row = conn.execute("SELECT filename FROM photos WHERE id = ?", (photo_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Photo not found")
        conn.execute("DELETE FROM photos WHERE id = ?", (photo_id,))
    try:
        (data_dir() / "uploads" / row["filename"]).unlink()
    except FileNotFoundError:
        pass
    return {"ok": True}


@app.get("/admin/login", response_class=HTMLResponse)
def login_page() -> str:
    return LOGIN_HTML


@app.post("/admin/login")
def login(username: str = Form(...), password: str = Form(...)) -> Response:
    if username != admin_username() or not verify_admin_password(password):
        return HTMLResponse(LOGIN_HTML.replace("</form>", "<p class='error'>Invalid username or password.</p></form>"), status_code=401)
    response = RedirectResponse("/admin", status_code=303)
    response.set_cookie(SESSION_COOKIE, make_session(username), httponly=True, samesite="lax")
    return response


@app.post("/admin/logout")
def logout() -> Response:
    response = RedirectResponse("/admin/login", status_code=303)
    response.delete_cookie(SESSION_COOKIE)
    return response


@app.get("/admin", response_class=HTMLResponse)
def admin_dashboard(request: Request):
    if not verify_session(request.cookies.get(SESSION_COOKIE)):
        return RedirectResponse("/admin/login", status_code=303)
    return ADMIN_HTML


@app.get("/")
def home() -> FileResponse:
    return FileResponse(ROOT / "index.html")


@app.get("/{filename:path}")
def static_page(filename: str, request: Request) -> Response:
    requested = (ROOT / filename).resolve()
    if not str(requested).startswith(str(ROOT.resolve())):
        raise HTTPException(status_code=404)
    if requested.is_file():
        return FileResponse(requested)
    if filename == "":
        return FileResponse(ROOT / "index.html")
    raise HTTPException(status_code=404)


LOGIN_HTML = """
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Login | East Forsyth Band</title><link rel="stylesheet" href="/styles.css"></head>
<body class="admin-body"><main class="admin-shell small"><h1>East Forsyth Band Admin</h1><p>Log in to edit website information, events, and photos.</p><form class="admin-card" method="post" action="/admin/login"><label>Username<input name="username" required autocomplete="username"></label><label>Password<input name="password" type="password" required autocomplete="current-password"></label><button class="btn primary" type="submit">Log in</button></form></main></body></html>
"""


ADMIN_HTML = """
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Website Admin | East Forsyth Band</title><link rel="stylesheet" href="/styles.css"></head>
<body class="admin-body"><main class="admin-shell"><div class="admin-top"><div><p class="kicker">Custom backend</p><h1>Website Admin</h1><p>Edit the public site without touching code.</p></div><form method="post" action="/admin/logout"><button class="btn secondary">Log out</button></form></div>
<section class="admin-grid"><form id="site-form" class="admin-card"><h2>Site text</h2><label>Site title<input name="title" required></label><label>Hero title<input name="hero_title" required></label><label>Hero subtitle<textarea name="hero_subtitle" required rows="4"></textarea></label><label>Footer note<textarea name="footer_note" required rows="3"></textarea></label><button class="btn primary">Save site text</button><p class="status" id="site-status"></p></form>
<form id="password-form" class="admin-card"><h2>Change password</h2><p>Use this after logging in to replace the temporary password.</p><label>Current password<input name="current_password" type="password" required autocomplete="current-password"></label><label>New password<input name="new_password" type="password" required minlength="8" autocomplete="new-password"></label><button class="btn primary">Update password</button><p class="status" id="password-status"></p></form>
<div class="admin-card"><h2>Events</h2><form id="event-form" class="stack"><input type="hidden" name="id"><label>Month / label<input name="date_label" placeholder="Aug" required></label><label>Day / detail<input name="date_detail" placeholder="01 or TBD" required></label><label>Event title<input name="title" required></label><label>Description<textarea name="description" rows="3" required></textarea></label><label>Sort order<input name="sort_order" type="number" value="0"></label><button class="btn primary">Save event</button><button class="btn outline" type="button" id="new-event">New event</button></form><div id="events-list" class="admin-list"></div></div>
<div class="admin-card"><h2>Photos</h2><form id="photo-form" class="stack"><label>Photo<input name="file" type="file" accept="image/*" required></label><label>Alt text<input name="alt_text" required placeholder="Students performing on the field"></label><label>Caption<input name="caption"></label><label>Sort order<input name="sort_order" type="number" value="0"></label><button class="btn primary">Upload photo</button></form><div id="photos-list" class="admin-list"></div></div></section></main><script src="/admin.js"></script></body></html>
"""
