import io
import os
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient


def make_client():
    tmpdir = tempfile.TemporaryDirectory()
    os.environ["EFBAND_DATA_DIR"] = tmpdir.name
    os.environ["EFBAND_SECRET"] = "test-secret"
    os.environ["EFBAND_ADMIN_USERNAME"] = "admin"
    os.environ["EFBAND_ADMIN_PASSWORD"] = "admin123$"

    import importlib
    import backend.app as app_module

    importlib.reload(app_module)
    client = TestClient(app_module.app)
    client._tmpdir = tmpdir
    return client


def login(client):
    response = client.post(
        "/admin/login",
        data={"username": "admin", "password": "admin123$"},
        follow_redirects=False,
    )
    assert response.status_code == 303
    return response


def test_health_and_default_public_content_are_available():
    client = make_client()

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["ok"] is True

    site = client.get("/api/site")
    assert site.status_code == 200
    payload = site.json()
    assert payload["title"] == "East Forsyth Band"
    assert "Sound. Spirit. Eagle Pride." in payload["hero_title"]

    events = client.get("/api/events")
    assert events.status_code == 200
    assert len(events.json()) >= 3


def test_admin_login_required_for_dashboard_and_content_updates():
    client = make_client()

    assert client.get("/admin", follow_redirects=False).status_code == 303
    blocked = client.post("/api/admin/site", json={"title": "Blocked"})
    assert blocked.status_code == 401

    login(client)
    dashboard = client.get("/admin")
    assert dashboard.status_code == 200
    assert "Website Admin" in dashboard.text

    response = client.post(
        "/api/admin/site",
        json={
            "title": "East Forsyth Eagle Band",
            "hero_title": "New Hero",
            "hero_subtitle": "Updated from the admin backend.",
            "footer_note": "Updated footer.",
        },
    )
    assert response.status_code == 200
    assert client.get("/api/site").json()["title"] == "East Forsyth Eagle Band"


def test_admin_can_change_password_after_login():
    client = make_client()

    blocked = client.post(
        "/api/admin/password",
        json={
            "current_password": "admin123$",
            "new_password": "newAdmin456$",
            "confirm_password": "newAdmin456$",
        },
    )
    assert blocked.status_code == 401

    login(client)
    wrong_current = client.post(
        "/api/admin/password",
        json={
            "current_password": "wrong",
            "new_password": "newAdmin456$",
            "confirm_password": "newAdmin456$",
        },
    )
    assert wrong_current.status_code == 400

    mismatch = client.post(
        "/api/admin/password",
        json={
            "current_password": "admin123$",
            "new_password": "newAdmin456$",
            "confirm_password": "different456$",
        },
    )
    assert mismatch.status_code == 422

    changed = client.post(
        "/api/admin/password",
        json={
            "current_password": "admin123$",
            "new_password": "newAdmin456$",
            "confirm_password": "newAdmin456$",
        },
    )
    assert changed.status_code == 200
    assert changed.json()["ok"] is True

    client.post("/admin/logout")
    old_login = client.post(
        "/admin/login",
        data={"username": "admin", "password": "admin123$"},
        follow_redirects=False,
    )
    assert old_login.status_code == 401

    new_login = client.post(
        "/admin/login",
        data={"username": "admin", "password": "newAdmin456$"},
        follow_redirects=False,
    )
    assert new_login.status_code == 303


def test_admin_can_create_update_delete_events():
    client = make_client()
    login(client)

    created = client.post(
        "/api/admin/events",
        json={
            "date_label": "Nov",
            "date_detail": "12",
            "title": "Veterans Day Parade",
            "description": "Meet at the band room at 8:00 AM.",
            "sort_order": 10,
        },
    )
    assert created.status_code == 200
    event_id = created.json()["id"]

    events = client.get("/api/events").json()
    assert any(event["title"] == "Veterans Day Parade" for event in events)

    updated = client.put(
        f"/api/admin/events/{event_id}",
        json={
            "date_label": "Nov",
            "date_detail": "13",
            "title": "Updated Parade",
            "description": "Updated details.",
            "sort_order": 2,
        },
    )
    assert updated.status_code == 200
    assert any(event["title"] == "Updated Parade" for event in client.get("/api/events").json())

    deleted = client.delete(f"/api/admin/events/{event_id}")
    assert deleted.status_code == 200
    assert not any(event["id"] == event_id for event in client.get("/api/events").json())


def test_admin_can_upload_photo_and_public_gallery_returns_it():
    client = make_client()
    login(client)

    image_bytes = b"\x89PNG\r\n\x1a\n" + b"0" * 20
    response = client.post(
        "/api/admin/photos",
        files={"file": ("band.png", io.BytesIO(image_bytes), "image/png")},
        data={"alt_text": "Band on the field", "caption": "Friday night lights", "sort_order": "1"},
    )
    assert response.status_code == 200
    photo = response.json()
    assert photo["url"].startswith("/uploads/")

    gallery = client.get("/api/photos").json()
    assert gallery[0]["alt_text"] == "Band on the field"
    assert client.get(photo["url"]).status_code == 200
