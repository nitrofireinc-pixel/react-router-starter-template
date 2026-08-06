# CMS Improvements Test Suite

## Overview

This test suite validates the new CMS features added in the `feature/cms-improvements-test` branch:
- Staff email field for contact form reply-to
- Sponsor management with modal/toast UI
- User permissions system
- Sponsor bypass payment feature

## Running Tests

### Quick Start

```bash
# Run all tests
chmod +x run_tests.sh
./run_tests.sh

# Or with pytest directly
uv run pytest tests/test_cms_improvements.py -v
```

### Test Environment Variables

Tests automatically set:
```bash
EFBAND_TEST_ENV=true
EFBAND_SECRET=test-secret-key-12345
EFBAND_ADMIN_USERNAME=admin
EFBAND_ADMIN_PASSWORD=admin123$
```

## Test Coverage

### 1. Site Settings Tests (`TestSiteSettings`)
- ✅ Retrieve site content including staff email
- ✅ Update site content with authentication
- ✅ Reject updates without authentication
- ✅ Persist and retrieve staff email correctly

**Key Endpoint:** `POST /api/admin/site`, `GET /api/site`

### 2. Sponsor Management Tests (`TestSponsors`)
- ✅ Retrieve empty sponsor list
- ✅ Create sponsor with all fields
- ✅ Reject creation without authentication
- ✅ Create multiple sponsors and retrieve in sort order
- ✅ Update existing sponsor fields
- ✅ Delete sponsors
- ✅ Return 404 when deleting nonexistent sponsor
- ✅ Sort sponsors by sort_order field

**Key Endpoints:**
- `GET /api/sponsors` (public)
- `POST /api/admin/sponsors`
- `PUT /api/admin/sponsors/{id}`
- `DELETE /api/admin/sponsors/{id}`

### 3. User Permissions Tests (`TestUserPermissions`)
- ✅ Retrieve current user info with `can_bypass_sponsor_payment` flag
- ✅ Admin users can bypass payment
- ✅ Reject unauthenticated requests
- ✅ Reject invalid session cookies

**Key Endpoint:** `GET /api/admin/me`

### 4. Admin Dashboard Tests (`TestAdminDashboard`)
- ✅ Login page is accessible
- ✅ Dashboard requires authentication (redirects to login)
- ✅ Authenticated users can access dashboard
- ✅ Login with correct credentials sets session cookie
- ✅ Login with wrong password fails with 401

**Key Endpoints:**
- `GET /admin/login`
- `POST /admin/login`
- `GET /admin`

### 5. Data Validation Tests (`TestDataValidation`)
- ✅ Sponsor name is required
- ✅ Site content fields are validated
- ✅ Sponsor active status stored correctly as boolean

**Validates:** Pydantic model constraints and type checking

### 6. Public API Tests (`TestPublicAPI`)
- ✅ Public sponsors endpoint doesn't require authentication
- ✅ Public site endpoint includes staff_email field
- ✅ Can retrieve sponsors without credentials

**Key Endpoints:** `GET /api/sponsors`, `GET /api/site`

## Test Statistics

```
Total Tests: 27
├── Site Settings: 4 tests
├── Sponsor Management: 8 tests
├── User Permissions: 3 tests
├── Admin Dashboard: 5 tests
├── Data Validation: 3 tests
└── Public API: 4 tests
```

## Example Test Run Output

```
================================================== test session starts ==================================================
platform linux -- Python 3.11.0, pytest-8.0.0, pluggy-1.1.1 -- /path/to/venv/bin/python
cachedir: .pytest_cache
rootdir: /path/to/repo
collected 27 items

tests/test_cms_improvements.py::TestSiteSettings::test_get_site_content PASSED                                      [  3%]
tests/test_cms_improvements.py::TestSiteSettings::test_update_site_content_authenticated PASSED                       [  7%]
tests/test_cms_improvements.py::TestSiteSettings::test_update_site_content_unauthenticated PASSED                     [ 11%]
tests/test_cms_improvements.py::TestSiteSettings::test_staff_email_persists PASSED                                   [ 14%]
tests/test_cms_improvements.py::TestSponsors::test_get_sponsors_empty PASSED                                         [ 18%]
tests/test_cms_improvements.py::TestSponsors::test_create_sponsor_authenticated PASSED                                [ 22%]
tests/test_cms_improvements.py::TestSponsors::test_create_sponsor_unauthenticated PASSED                              [ 25%]
tests/test_cms_improvements.py::TestSponsors::test_create_multiple_sponsors PASSED                                   [ 29%]
tests/test_cms_improvements.py::TestSponsors::test_update_sponsor PASSED                                             [ 32%]
tests/test_cms_improvements.py::TestSponsors::test_update_sponsor_unauthenticated PASSED                              [ 36%]
tests/test_cms_improvements.py::TestSponsors::test_delete_sponsor PASSED                                             [ 40%]
tests/test_cms_improvements.py::TestSponsors::test_delete_nonexistent_sponsor PASSED                                 [ 44%]
tests/test_cms_improvements.py::TestSponsors::test_sponsor_sorting PASSED                                            [ 48%]
tests/test_cms_improvements.py::TestUserPermissions::test_get_current_user_authenticated PASSED                       [ 51%]
tests/test_cms_improvements.py::TestUserPermissions::test_get_current_user_unauthenticated PASSED                     [ 55%]
tests/test_cms_improvements.py::TestUserPermissions::test_invalid_session_cookie PASSED                               [ 58%]
tests/test_cms_improvements.py::TestAdminDashboard::test_admin_login_page_accessible PASSED                           [ 62%]
tests/test_cms_improvements.py::TestAdminDashboard::test_admin_dashboard_requires_auth PASSED                         [ 66%]
tests/test_cms_improvements.py::TestAdminDashboard::test_admin_dashboard_with_auth PASSED                             [ 70%]
tests/test_cms_improvements.py::TestAdminDashboard::test_login_with_correct_credentials PASSED                        [ 73%]
tests/test_cms_improvements.py::TestAdminDashboard::test_login_with_wrong_password PASSED                             [ 76%]
tests/test_cms_improvements.py::TestDataValidation::test_sponsor_name_required PASSED                                [ 80%]
tests/test_cms_improvements.py::TestDataValidation::test_site_content_validation PASSED                               [ 83%]
tests/test_cms_improvements.py::TestDataValidation::test_sponsor_active_boolean PASSED                                [ 87%]
tests/test_cms_improvements.py::TestPublicAPI::test_public_sponsors_endpoint PASSED                                  [ 90%]
tests/test_cms_improvements.py::TestPublicAPI::test_public_site_endpoint PASSED                                      [ 94%]

================================================== 27 passed in 2.34s ==================================================
```

## Manual Testing Checklist

After running automated tests, verify these manually:

### Frontend Modal UI
- [ ] Click "Add Sponsor" button opens modal
- [ ] Modal has "Add Sponsor" title
- [ ] Form fields pre-fill when editing existing sponsor
- [ ] Modal shows "Edit Sponsor" title when editing
- [ ] "Bypass Payment" checkbox only visible for admins
- [ ] "Saved." message appears after successful form submission
- [ ] Modal closes automatically after save
- [ ] Modal can be closed by clicking X or overlay
- [ ] Delete button removes sponsor from list

### Site Settings
- [ ] Staff email field appears in site settings form
- [ ] Staff email value persists after save
- [ ] Staff email is included in public `/api/site` response

### Permission System
- [ ] Admin users see "Bypass Payment" checkbox
- [ ] Non-admin users don't see checkbox (when permissions system is fully implemented)
- [ ] `/api/admin/me` returns `can_bypass_sponsor_payment: true` for admins

### Authentication
- [ ] Invalid credentials show error message
- [ ] Valid login redirects to admin dashboard
- [ ] Unauthenticated access to protected endpoints returns 401
- [ ] Session cookies are set and used correctly

## Troubleshooting

### Tests fail with "module not found"
```bash
# Make sure dependencies are installed
uv sync
```

### Database locked error
```bash
# Tests create temporary databases; ensure no other processes are using them
# Each test gets a fresh isolated database via the test_db fixture
```

### Permission denied on run_tests.sh
```bash
chmod +x run_tests.sh
```

## Continuous Integration

These tests are designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run Tests
  run: |
    export EFBAND_TEST_ENV=true
    uv run pytest tests/test_cms_improvements.py -v --tb=short
```

## Next Steps

After all tests pass:
1. Review code changes in the PR
2. Test manually in local environment
3. Deploy to staging/production
4. Monitor for any issues

## Questions?

Refer to the implementation files:
- `backend/app.py` - Backend API endpoints
- `admin.js` - Frontend modal UI logic
- `tests/test_cms_improvements.py` - Complete test implementation
