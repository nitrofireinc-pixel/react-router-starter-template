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
    staff_email: str = Field(default="", max_length=255)


class EventPayload(BaseModel):
    date_label: str = Field(min_length=1, max_length=20)
    date_detail: str = Field(min_length=1, max_length=20)
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=800)
    sort_order: int = 0


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


class UserProfile(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    display_name: str = Field(min_length=1, max_length=200)
    email: str = Field(default="", max_length=255)
    active: bool = True
    password: str = Field(default="", max_length=200)
    role: str = "editor"


class SponsorPayload(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(default="", max_length=500)
    level: str = Field(default="Community Sponsor", max_length=100)
    logo_url: str = Field(default="", max_length=500)
    mark_text: str = Field(default="★", max_length=50)
    sort_order: int = 0
    active: bool = True


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
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                email TEXT NOT NULL DEFAULT '',
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'editor',
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                permission TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id),
                UNIQUE(user_id, permission)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sponsors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                address TEXT NOT NULL DEFAULT '',
                level TEXT NOT NULL DEFAULT 'Community Sponsor',
                logo_url TEXT NOT NULL DEFAULT '',
                mark_text TEXT NOT NULL DEFAULT '★',
                sort_order INTEGER NOT NULL DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
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


def get_sponsors() -> list[dict[str, Any]]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, name, address, level, logo_url, mark_text, sort_order, active FROM sponsors ORDER BY sort_order, id"
        ).fetchall()
    return [row_to_dict(row) for row in rows]


def sign(value: str) -> str:
    digest = hmac.new(secret_key().encode(), value.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def make_session(username: str) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({"u": username, "t": int(time.time())}).encode()).decode().rstrip("=")
    return f"{payload}.{sign(payload)}"


def verify_session(cookie: str | None) -> tuple[str | None, dict]:
    if not cookie or "." not in cookie:
        return None, {}
    payload, supplied = cookie.rsplit(".", 1)
    if not hmac.compare_digest(sign(payload), supplied):
        return None, {}
    try:
        decoded = base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))
        data = json.loads(decoded)
    except Exception:
        return None, {}
    return data.get("u"), data


def get_user_permissions(user_id: int) -> list[str]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT permission FROM user_permissions WHERE user_id = ?",
            (user_id,)
        ).fetchall()
    return [row["permission"] for row in rows]


def get_user_by_username(username: str) -> dict[str, Any] | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT id, username, display_name, email, password_hash, role, active FROM users WHERE username = ?",
            (username,)
        ).fetchone()
    if row is None:
        return None
    user = row_to_dict(row)
    user["permissions"] = get_user_permissions(user["id"])
    return user


def require_admin(request: Request) -> dict[str, Any]:
    username, _ = verify_session(request.cookies.get(SESSION_COOKIE))
    if not username:
        raise HTTPException(status_code=401, detail="Admin login required")
    
    user = get_user_by_username(username)
    if not user or not user.get("active"):
        raise HTTPException(status_code=401, detail="Admin login required")
    
    if user.get("role") != "admin" and "all" not in user.get("permissions", []):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    return user


def requires_permission(permission: str):
    def dependency(request: Request) -> dict[str, Any]:
        username, _ = verify_session(request.cookies.get(SESSION_COOKIE))
        if not username:
            raise HTTPException(status_code=401, detail="Login required")
        
        user = get_user_by_username(username)
        if not user or not user.get("active"):
            raise HTTPException(status_code=401, detail="Login required")
        
        if user.get("role") == "admin":
            return user
        
        if permission not in user.get("permissions", []) and "all" not in user.get("permissions", []):
            raise HTTPException(status_code=403, detail=f"Permission '{permission}' required")
        
        return user
    return dependency


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


@app.get("/api/sponsors")
def api_sponsors() -> list[dict[str, Any]]:
    return get_sponsors()


@app.post("/api/admin/site")
def update_site(payload: SiteContent, user: dict = Depends(requires_permission("site"))) -> dict[str, str]:
    with connect() as conn:
        conn.executemany(
            "INSERT INTO site_content (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            payload.model_dump().items(),
        )
    return get_site_content()


@app.post("/api/admin/password")
def change_password(payload: PasswordChange, user: dict = Depends(requires_permission("profile"))) -> dict[str, bool]:
    if not verify_admin_password(payload.current_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    set_admin_password(payload.new_password)
    return {"ok": True}


@app.get("/api/admin/me")
def get_current_user(request: Request) -> dict[str, Any]:
    username, _ = verify_session(request.cookies.get(SESSION_COOKIE))
    if not username:
        raise HTTPException(status_code=401, detail="Login required")
    
    user = get_user_by_username(username)
    if not user:
        raise HTTPException(status_code=401, detail="Login required")
    
    return {
        "user": user,
        "can_bypass_sponsor_payment": "sponsors:bypass_payment" in user.get("permissions", []) or user.get("role") == "admin"
    }


@app.post("/api/admin/events")
def create_event(payload: EventPayload, user: dict = Depends(requires_permission("events"))) -> dict[str, Any]:
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
def update_event(event_id: int, payload: EventPayload, user: dict = Depends(requires_permission("events"))) -> dict[str, Any]:
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
def delete_event(event_id: int, user: dict = Depends(requires_permission("events"))) -> dict[str, bool]:
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
    user: dict = Depends(requires_permission("photos")),
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
def delete_photo(photo_id: int, user: dict = Depends(requires_permission("photos"))) -> dict[str, bool]:
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


@app.post("/api/admin/sponsors")
def create_sponsor(payload: SponsorPayload, user: dict = Depends(requires_permission("sponsors"))) -> dict[str, Any]:
    with connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO sponsors (name, address, level, logo_url, mark_text, sort_order, active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (payload.name, payload.address, payload.level, payload.logo_url, payload.mark_text, payload.sort_order, int(payload.active)),
        )
        sponsor_id = cur.lastrowid
        row = conn.execute(
            "SELECT id, name, address, level, logo_url, mark_text, sort_order, active FROM sponsors WHERE id = ?",
            (sponsor_id,)
        ).fetchone()
    return row_to_dict(row)


@app.put("/api/admin/sponsors/{sponsor_id}")
def update_sponsor(sponsor_id: int, payload: SponsorPayload, user: dict = Depends(requires_permission("sponsors"))) -> dict[str, Any]:
    with connect() as conn:
        cur = conn.execute(
            """
            UPDATE sponsors SET name = ?, address = ?, level = ?, logo_url = ?, mark_text = ?, sort_order = ?, active = ?
            WHERE id = ?
            """,
            (payload.name, payload.address, payload.level, payload.logo_url, payload.mark_text, payload.sort_order, int(payload.active), sponsor_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Sponsor not found")
        row = conn.execute(
            "SELECT id, name, address, level, logo_url, mark_text, sort_order, active FROM sponsors WHERE id = ?",
            (sponsor_id,)
        ).fetchone()
    return row_to_dict(row)


@app.delete("/api/admin/sponsors/{sponsor_id}")
def delete_sponsor(sponsor_id: int, user: dict = Depends(requires_permission("sponsors"))) -> dict[str, bool]:
    with connect() as conn:
        cur = conn.execute("DELETE FROM sponsors WHERE id = ?", (sponsor_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Sponsor not found")
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
    username, _ = verify_session(request.cookies.get(SESSION_COOKIE))
    if not username:
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
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin Login | East Forsyth Band</title><link rel="stylesheet" href="/styles.css"><style>.admin-body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#edf3fa,#fff)}.admin-shell{max-width:400px;width:100%;padding:24px}.admin-card{background:#fff;border:1px solid #d9dee8;border-radius:24px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,.08)}.admin-card h1{margin:0 0 8px;font-size:24px;color:#002142}.admin-card p{color:#5b6472;margin:0 0 20px}.admin-card input{width:100%;padding:10px 12px;border:1px solid #d9dee8;border-radius:8px;font-size:14px;margin-bottom:12px}.admin-card button{width:100%;padding:12px;background:#002142;color:#fff;border:none;border-radius:8px;font-weight:900;cursor:pointer;font-size:14px}.admin-card button:hover{background:#014990}.admin-card .error{color:#e71321;font-size:14px;margin-bottom:12px}</style></head><body class="admin-body"><main class="admin-shell"><div class="admin-card"><h1>East Forsyth Band Admin</h1><p>Log in to edit website information, events, and photos.</p><form method="post" action="/admin/login"><input name="username" placeholder="Username" required><input name="password" type="password" placeholder="Password" required><button type="submit">Log In</button></form></div></main></body></html>
"""


ADMIN_HTML = """
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Website Admin | East Forsyth Band</title><link rel="stylesheet" href="/styles.css"><style>.admin-body{background:linear-gradient(135deg,#edf3fa,#fff);min-height:100vh}.admin-shell{max-width:1180px;margin:0 auto;padding:36px 20px}.admin-top{margin-bottom:36px}.admin-top h1{margin:0;font-size:32px;color:#002142}.admin-top .kicker{color:#5b6472;font-weight:900;font-size:12px;text-transform:uppercase;letter-spacing:1px}.admin-card{background:#fff;border:1px solid #d9dee8;border-radius:24px;padding:28px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,.08)}.admin-card h2{margin:0 0 16px;color:#002142}.admin-card label{display:block;margin-bottom:12px;font-weight:700;color:#111827}.admin-card input,.admin-card textarea,.admin-card select{width:100%;padding:10px 12px;border:1px solid #d9dee8;border-radius:8px;font-size:14px;font-family:inherit;margin-bottom:12px}.admin-card textarea{resize:vertical;min-height:80px}.admin-card button{padding:10px 16px;background:#002142;color:#fff;border:none;border-radius:8px;font-weight:900;cursor:pointer;font-size:14px}.admin-card button:hover{background:#014990}.admin-status{margin-top:12px;font-size:14px;color:#014990}.admin-status.error{color:#e71321}.sponsor-preview{border:1px solid #d9dee8;border-radius:12px;padding:16px;margin-top:12px}.sponsor-card{display:flex;gap:12px;padding:12px;border:1px solid #d9dee8;border-radius:12px;align-items:center}.sponsor-logo{width:48px;height:48px;background:#f5f7fb;border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden}.sponsor-logo img{width:100%;height:100%;object-fit:cover}.modal{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:1000;align-items:center;justify-content:center}.modal.active{display:flex}.modal-content{background:#fff;border-radius:24px;padding:28px;max-width:500px;width:90%;box-shadow:0 24px 70px rgba(0,33,66,.16)}.modal-content h2{margin:0 0 16px}.modal-close{position:absolute;top:16px;right:16px;background:none;border:none;font-size:24px;cursor:pointer;color:#5b6472}.sponsor-toast{position:fixed;bottom:20px;right:20px;background:#fff;border:1px solid #d9dee8;border-radius:12px;padding:16px 20px;box-shadow:0 12px 30px rgba(0,0,0,.12);z-index:999;display:none}.sponsor-toast.active{display:block}</style></head><body class="admin-body"><main class="admin-shell"><div class="admin-top"><div class="kicker">Custom backend</div><h1>Website Admin</h1><p>Edit the public site without touching code.</p></div><div class="admin-card"><h2>Sponsors</h2><p>Add, edit, and reorder sponsors.</p><button id="add-sponsor-btn">+ Add Sponsor</button><div id="sponsors-list"></div></div><div id="sponsor-modal" class="modal"><div class="modal-content"><h2 id="sponsor-modal-title">Add Sponsor</h2><form id="sponsor-form"><input type="hidden" name="id"><label>Name<input name="name" required></label><label>Level<input name="level" placeholder="Community Sponsor"></label><label>Address<input name="address"></label><label>Logo URL<input name="logo_url"></label><label>Mark Text<input name="mark_text" value="★"></label><label><input type="checkbox" name="active"> Active</label><button type="submit">Save Sponsor</button></form><div id="sponsor-status" class="admin-status"></div></div></div></main><script src="/admin.js"></script></body></html>
"""
