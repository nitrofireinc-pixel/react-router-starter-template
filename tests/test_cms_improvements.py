import pytest
import json
import sqlite3
from pathlib import Path
from fastapi.testclient import TestClient
from backend.app import app, connect, hash_password, admin_username, admin_password, make_session

client = TestClient(app)

@pytest.fixture(scope="function")
def test_db(tmp_path):
    """Create a fresh test database for each test"""
    import os
    os.environ["EFBAND_DATA_DIR"] = str(tmp_path)
    
    # Initialize the database
    from backend.app import init_db
    init_db()
    
    yield tmp_path
    
    # Cleanup
    if "EFBAND_DATA_DIR" in os.environ:
        del os.environ["EFBAND_DATA_DIR"]


@pytest.fixture
def auth_cookie(test_db):
    """Generate a valid session cookie for testing"""
    return make_session(admin_username())


class TestSiteSettings:
    """Test site content and staff email management"""
    
    def test_get_site_content(self, test_db):
        """Test retrieving site content"""
        response = client.get("/api/site")
        assert response.status_code == 200
        data = response.json()
        assert "title" in data
        assert "staff_email" in data
        assert data["title"] == "East Forsyth Band"
    
    def test_update_site_content_authenticated(self, test_db, auth_cookie):
        """Test updating site content with authentication"""
        payload = {
            "title": "Updated Band",
            "hero_title": "Updated Hero",
            "hero_subtitle": "Updated Subtitle",
            "footer_note": "Updated Footer",
            "staff_email": "director@efhs.edu"
        }
        response = client.post(
            "/api/admin/site",
            json=payload,
            cookies={"efband_session": auth_cookie}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["staff_email"] == "director@efhs.edu"
        assert data["title"] == "Updated Band"
    
    def test_update_site_content_unauthenticated(self, test_db):
        """Test updating site content without authentication fails"""
        payload = {
            "title": "Hacked Band",
            "hero_title": "Hero",
            "hero_subtitle": "Subtitle",
            "footer_note": "Footer",
            "staff_email": "hacker@evil.com"
        }
        response = client.post("/api/admin/site", json=payload)
        assert response.status_code == 401
    
    def test_staff_email_persists(self, test_db, auth_cookie):
        """Test that staff email is saved and retrieved correctly"""
        # Update with email
        client.post(
            "/api/admin/site",
            json={
                "title": "Band",
                "hero_title": "Hero",
                "hero_subtitle": "Subtitle",
                "footer_note": "Footer",
                "staff_email": "contact@band.org"
            },
            cookies={"efband_session": auth_cookie}
        )
        
        # Retrieve and verify
        response = client.get("/api/site")
        assert response.json()["staff_email"] == "contact@band.org"


class TestSponsors:
    """Test sponsor CRUD operations"""
    
    def test_get_sponsors_empty(self, test_db):
        """Test retrieving empty sponsor list"""
        response = client.get("/api/sponsors")
        assert response.status_code == 200
        assert response.json() == []
    
    def test_create_sponsor_authenticated(self, test_db, auth_cookie):
        """Test creating a sponsor with authentication"""
        payload = {
            "name": "Local Bank Inc",
            "address": "123 Main St",
            "level": "Premier Sponsor",
            "logo_url": "https://example.com/logo.png",
            "mark_text": "🏦",
            "sort_order": 1,
            "active": True
        }
        response = client.post(
            "/api/admin/sponsors",
            json=payload,
            cookies={"efband_session": auth_cookie}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Local Bank Inc"
        assert data["id"] is not None
        assert data["active"] == 1
    
    def test_create_sponsor_unauthenticated(self, test_db):
        """Test creating sponsor without authentication fails"""
        payload = {
            "name": "Hacker Bank",
            "address": "Evil Place",
            "level": "Evil Sponsor",
            "logo_url": "",
            "mark_text": "",
            "sort_order": 1,
            "active": True
        }
        response = client.post("/api/admin/sponsors", json=payload)
        assert response.status_code == 401
    
    def test_create_multiple_sponsors(self, test_db, auth_cookie):
        """Test creating multiple sponsors and retrieving them"""
        sponsors = [\n            {"name": "Bank A", "level": "Premier", "address": "123 St", "logo_url": "", "mark_text": "A", "sort_order": 1, "active": True},
            {"name": "Bank B", "level": "Community", "address": "456 Ave", "logo_url": "", "mark_text": "B", "sort_order": 2, "active": True},
            {"name": "Bank C", "level": "Community", "address": "789 Ln", "logo_url": "", "mark_text": "C", "sort_order": 3, "active": False}
        ]
        
        for sponsor in sponsors:
            client.post(
                "/api/admin/sponsors",
                json=sponsor,
                cookies={"efband_session": auth_cookie}
            )
        
        # Retrieve all
        response = client.get("/api/sponsors")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
        assert data[0]["name"] == "Bank A"
        assert data[2]["active"] == 0
    
    def test_update_sponsor(self, test_db, auth_cookie):
        """Test updating a sponsor"""
        # Create
        create_response = client.post(
            "/api/admin/sponsors",
            json={
                "name": "Old Name",
                "level": "Community",
                "address": "",
                "logo_url": "",
                "mark_text": "★",
                "sort_order": 1,
                "active": True
            },
            cookies={"efband_session": auth_cookie}
        )
        sponsor_id = create_response.json()["id"]
        
        # Update
        update_response = client.put(
            f"/api/admin/sponsors/{sponsor_id}",
            json={
                "name": "New Name",
                "level": "Premier",
                "address": "123 Main St",
                "logo_url": "https://example.com/logo.png",
                "mark_text": "🏦",
                "sort_order": 1,
                "active": True
            },
            cookies={"efband_session": auth_cookie}
        )
        assert update_response.status_code == 200
        data = update_response.json()
        assert data["name"] == "New Name"
        assert data["level"] == "Premier"
        assert data["address"] == "123 Main St"
    
    def test_update_sponsor_unauthenticated(self, test_db, auth_cookie):
        """Test updating sponsor without authentication fails"""
        # Create first
        create_response = client.post(
            "/api/admin/sponsors",
            json={
                "name": "Bank",
                "level": "Community",
                "address": "",
                "logo_url": "",
                "mark_text": "★",
                "sort_order": 1,
                "active": True
            },
            cookies={"efband_session": auth_cookie}
        )
        sponsor_id = create_response.json()["id"]
        
        # Try to update without auth
        response = client.put(
            f"/api/admin/sponsors/{sponsor_id}",
            json={
                "name": "Hacked",
                "level": "Evil",
                "address": "",
                "logo_url": "",
                "mark_text": "✗",
                "sort_order": 1,
                "active": True
            }
        )
        assert response.status_code == 401
    
    def test_delete_sponsor(self, test_db, auth_cookie):
        """Test deleting a sponsor"""
        # Create
        create_response = client.post(
            "/api/admin/sponsors",
            json={
                "name": "Temp Sponsor",
                "level": "Community",
                "address": "",
                "logo_url": "",
                "mark_text": "★",
                "sort_order": 1,
                "active": True
            },
            cookies={"efband_session": auth_cookie}
        )
        sponsor_id = create_response.json()["id"]
        
        # Delete
        delete_response = client.delete(
            f"/api/admin/sponsors/{sponsor_id}",
            cookies={"efband_session": auth_cookie}
        )
        assert delete_response.status_code == 200
        assert delete_response.json()["ok"] is True
        
        # Verify deleted
        response = client.get("/api/sponsors")
        assert len(response.json()) == 0
    
    def test_delete_nonexistent_sponsor(self, test_db, auth_cookie):
        """Test deleting a nonexistent sponsor fails"""
        response = client.delete(
            "/api/admin/sponsors/99999",
            cookies={"efband_session": auth_cookie}
        )
        assert response.status_code == 404
    
    def test_sponsor_sorting(self, test_db, auth_cookie):
        """Test sponsors are returned in sort order"""
        for i in range(3):
            client.post(
                "/api/admin/sponsors",
                json={
                    "name": f"Sponsor {i}",
                    "level": "Community",
                    "address": "",
                    "logo_url": "",
                    "mark_text": str(i),
                    "sort_order": 3 - i,  # Reverse order
                    "active": True
                },
                cookies={"efband_session": auth_cookie}
            )
        
        response = client.get("/api/sponsors")
        data = response.json()
        assert data[0]["sort_order"] == 1
        assert data[1]["sort_order"] == 2
        assert data[2]["sort_order"] == 3


class TestUserPermissions:
    """Test user authentication and permissions"""
    
    def test_get_current_user_authenticated(self, test_db, auth_cookie):
        """Test retrieving current user info"""
        response = client.get(
            "/api/admin/me",
            cookies={"efband_session": auth_cookie}
        )
        assert response.status_code == 200
        data = response.json()
        assert "user" in data
        assert "can_bypass_sponsor_payment" in data
        assert data["user"]["username"] == admin_username()
        assert data["user"]["role"] == "admin"
        assert data["can_bypass_sponsor_payment"] is True  # Admin can always bypass
    
    def test_get_current_user_unauthenticated(self, test_db):
        """Test retrieving current user without authentication fails"""
        response = client.get("/api/admin/me")
        assert response.status_code == 401
    
    def test_invalid_session_cookie(self, test_db):
        """Test invalid session cookie is rejected"""
        response = client.get(
            "/api/admin/me",
            cookies={"efband_session": "invalid.cookie.here"}
        )
        assert response.status_code == 401


class TestAdminDashboard:
    """Test admin dashboard access"""
    
    def test_admin_login_page_accessible(self, test_db):
        """Test login page is accessible"""
        response = client.get("/admin/login")
        assert response.status_code == 200
        assert "Admin Login" in response.text or "admin" in response.text.lower()
    
    def test_admin_dashboard_requires_auth(self, test_db):
        """Test admin dashboard requires authentication"""
        response = client.get("/admin")
        assert response.status_code == 303  # Redirect to login
        assert "/admin/login" in response.headers.get("location", "")
    
    def test_admin_dashboard_with_auth(self, test_db, auth_cookie):
        """Test accessing admin dashboard with valid auth"""
        response = client.get(
            "/admin",
            cookies={"efband_session": auth_cookie}
        )
        assert response.status_code == 200
        assert "Website Admin" in response.text or "admin" in response.text.lower()
    
    def test_login_with_correct_credentials(self, test_db):
        """Test logging in with correct credentials"""
        response = client.post(
            "/admin/login",
            data={
                "username": admin_username(),
                "password": admin_password()
            },
            follow_redirects=False
        )
        assert response.status_code == 303
        assert response.headers.get("set-cookie") is not None
        assert "efband_session" in response.headers.get("set-cookie", "")
    
    def test_login_with_wrong_password(self, test_db):
        """Test logging in with wrong password fails"""
        response = client.post(
            "/admin/login",
            data={
                "username": admin_username(),
                "password": "wrongpassword"
            }
        )
        assert response.status_code == 401
        assert "Invalid" in response.text or "error" in response.text.lower()


class TestDataValidation:
    """Test data validation and constraints"""
    
    def test_sponsor_name_required(self, test_db, auth_cookie):
        """Test sponsor name is required"""
        response = client.post(
            "/api/admin/sponsors",
            json={
                "name": "",  # Empty name
                "level": "Community",
                "address": "",
                "logo_url": "",
                "mark_text": "★",
                "sort_order": 1,
                "active": True
            },
            cookies={"efband_session": auth_cookie}
        )
        assert response.status_code == 422  # Validation error
    
    def test_site_content_validation(self, test_db, auth_cookie):
        """Test site content validation"""
        response = client.post(
            "/api/admin/site",
            json={
                "title": "",  # Empty title
                "hero_title": "Hero",
                "hero_subtitle": "Subtitle",
                "footer_note": "Footer",
                "staff_email": "test@example.com"
            },
            cookies={"efband_session": auth_cookie}
        )
        assert response.status_code == 422
    
    def test_sponsor_active_boolean(self, test_db, auth_cookie):
        """Test sponsor active status is properly stored as boolean"""
        payload = {
            "name": "Test Bank",
            "level": "Community",
            "address": "",
            "logo_url": "",
            "mark_text": "★",
            "sort_order": 1,
            "active": False  # Explicitly false
        }
        response = client.post(
            "/api/admin/sponsors",
            json=payload,
            cookies={"efband_session": auth_cookie}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["active"] == 0  # SQLite stores as integer


class TestPublicAPI:
    """Test public API endpoints"""
    
    def test_public_sponsors_endpoint(self, test_db, auth_cookie):
        """Test public sponsors endpoint doesn't require auth"""
        # Add a sponsor
        client.post(
            "/api/admin/sponsors",
            json={
                "name": "Public Sponsor",
                "level": "Community",
                "address": "123 St",
                "logo_url": "",
                "mark_text": "★",
                "sort_order": 1,
                "active": True
            },
            cookies={"efband_session": auth_cookie}
        )
        
        # Access without auth
        response = client.get("/api/sponsors")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Public Sponsor"
    
    def test_public_site_endpoint(self, test_db):
        """Test public site endpoint includes staff email"""
        response = client.get("/api/site")
        assert response.status_code == 200
        data = response.json()
        assert "staff_email" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
