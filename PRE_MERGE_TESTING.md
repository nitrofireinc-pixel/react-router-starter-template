# CMS Improvements - Pre-Merge Testing Guide

## Quick Start: Local Testing

### 1. Switch to Test Branch
```bash
git checkout feature/cms-improvements-test
git pull origin feature/cms-improvements-test
```

### 2. Install Dependencies
```bash
# Ensure you have all required packages
uv sync
```

### 3. Run Automated Tests
```bash
# Make test runner executable
chmod +x run_tests.sh

# Run all tests
./run_tests.sh
```

**Expected Output:**
```
✅ All backend tests passed!

Summary:
  ✓ Site Settings & Staff Email
  ✓ Sponsor CRUD Operations
  ✓ User Authentication & Permissions
  ✓ Admin Dashboard Access
  ✓ Data Validation
  ✓ Public API Endpoints

Ready to merge feature/cms-improvements-test → main
```

---

## Detailed Testing Steps

### Step 1: Start the Backend Server

```bash
# Set test environment variables
export EFBAND_SECRET="test-secret-key-12345"
export EFBAND_ADMIN_USERNAME="admin"
export EFBAND_ADMIN_PASSWORD="admin123$"

# Start the server
uv run uvicorn backend.app:app --host 0.0.0.0 --port 8080 --reload
```

**Expected Output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8080 (Press CTRL+C to quit)
INFO:     Application startup complete
```

### Step 2: Test Login & Authentication

Open a new terminal while server is running:

```bash
# Test login
curl -X POST http://localhost:8080/admin/login \
  -d "username=admin&password=admin123$" \
  -c cookies.txt \
  -L

# Should redirect to /admin dashboard
```

### Step 3: Access Admin Dashboard

1. Open browser: `http://localhost:8080/admin`
2. You should see login form
3. Log in with:
   - **Username:** `admin`
   - **Password:** `admin123$`

---

## Feature Testing Checklist

### ✅ Staff Email Feature

1. **Access Site Settings:**
   - Log into admin dashboard
   - Scroll to "Site Settings" section
   - Look for "Staff Email (Reply-To)" input field

2. **Test Staff Email Input:**
   ```bash
   # Via API
   curl -X POST http://localhost:8080/api/admin/site \
     -H "Content-Type: application/json" \
     -b cookies.txt \
     -d '{
       "title": "East Forsyth Band",
       "hero_title": "Sound. Spirit. Eagle Pride.",
       "hero_subtitle": "A polished home for the band program...",
       "footer_note": "Draft website...",
       "staff_email": "director@efhs.edu"
     }'
   ```

3. **Verify Email is Saved:**
   ```bash
   curl http://localhost:8080/api/site | jq '.staff_email'
   # Output: "director@efhs.edu"
   ```

### ✅ Sponsor Modal/Toast UI

1. **Open Sponsor Modal:**
   - Click "Add Sponsor" button (should open modal overlay)
   - Modal title should say "Add Sponsor"

2. **Test Adding Sponsor:**
   ```
   Fill in form:
   - Sponsor Name: "Local Bank Inc"
   - Level: "Premier Sponsor"
   - Address: "123 Main St"
   - Logo URL: "https://example.com/logo.png"
   - Mark Text: "🏦"
   - Check "Active" checkbox
   - Click "Save Sponsor"
   ```
   - Should show "Saved." message
   - Modal should close after 600ms
   - Sponsor should appear in list below

3. **Test Editing Sponsor:**
   - Click "Edit" button on sponsor in list
   - Modal title should say "Edit Sponsor"
   - Form should pre-fill with existing data
   - Change a field (e.g., Level: "Community")
   - Click "Save Sponsor"
   - Should see "Saved." message
   - List should update with new data

4. **Test Deleting Sponsor:**
   - Click "Delete" button on sponsor
   - Confirm in browser prompt
   - Sponsor should be removed from list

5. **Test Bypass Payment Checkbox:**
   - Add or edit sponsor
   - Look for "Bypass Payment (CMS Only)" checkbox
   - It should be visible (admin user)
   - Can toggle it on/off

### ✅ Sponsor API Tests

```bash
# Get all sponsors (public endpoint - no auth needed)
curl http://localhost:8080/api/sponsors | jq

# Create sponsor
curl -X POST http://localhost:8080/api/admin/sponsors \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "name": "Test Sponsor",
    "level": "Community Sponsor",
    "address": "123 Main",
    "logo_url": "",
    "mark_text": "★",
    "sort_order": 1,
    "active": true
  }' | jq

# Update sponsor (replace ID)
curl -X PUT http://localhost:8080/api/admin/sponsors/1 \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "name": "Updated Name",
    "level": "Premier",
    "address": "456 Oak",
    "logo_url": "https://example.com/logo.png",
    "mark_text": "★",
    "sort_order": 1,
    "active": true
  }' | jq

# Delete sponsor
curl -X DELETE http://localhost:8080/api/admin/sponsors/1 \
  -b cookies.txt | jq
```

### ✅ User Permissions Test

```bash
# Get current user info
curl http://localhost:8080/api/admin/me \
  -b cookies.txt | jq

# Expected response:
# {
#   "user": {
#     "username": "admin",
#     "role": "admin"
#   },
#   "can_bypass_sponsor_payment": true
# }
```

---

## Automated Test Suite Details

### Run Specific Test Class
```bash
# Run only site settings tests
uv run pytest tests/test_cms_improvements.py::TestSiteSettings -v

# Run only sponsor tests
uv run pytest tests/test_cms_improvements.py::TestSponsors -v

# Run only permission tests
uv run pytest tests/test_cms_improvements.py::TestUserPermissions -v
```

### Run Single Test
```bash
uv run pytest tests/test_cms_improvements.py::TestSponsors::test_create_sponsor_authenticated -v
```

### Run with More Verbose Output
```bash
uv run pytest tests/test_cms_improvements.py -vv --tb=long
```

### Generate Test Coverage Report
```bash
uv run pytest tests/test_cms_improvements.py --cov=backend --cov-report=html
# Opens in htmlcov/index.html
```

---

## Test Results Expected

### Automated Tests (27 total)
```
✅ Site Settings: 4/4 passing
   - Get site content
   - Update authenticated
   - Reject unauthenticated
   - Staff email persists

✅ Sponsors: 8/8 passing
   - Get empty list
   - Create authenticated
   - Reject unauthenticated
   - Create multiple
   - Update sponsor
   - Update unauthenticated (rejected)
   - Delete sponsor
   - Delete nonexistent (404)
   - Sponsor sorting

✅ Permissions: 3/3 passing
   - Get current user
   - User unauthenticated (rejected)
   - Invalid cookie (rejected)

✅ Admin Dashboard: 5/5 passing
   - Login page accessible
   - Dashboard requires auth
   - Dashboard with auth
   - Login correct credentials
   - Login wrong password

✅ Data Validation: 3/3 passing
   - Sponsor name required
   - Site content validation
   - Active boolean stored

✅ Public API: 4/4 passing
   - Public sponsors endpoint
   - Public site endpoint
   - Staff email included
```

---

## Troubleshooting Common Issues

### Issue: "Address already in use" on port 8080
```bash
# Use different port
uv run uvicorn backend.app:app --host 0.0.0.0 --port 8081 --reload

# Or kill existing process
lsof -ti:8080 | xargs kill -9
```

### Issue: "Module not found: backend"
```bash
# Make sure you're in repo root directory
cd /path/to/react-router-starter-template

# Reinstall dependencies
uv sync
```

### Issue: Tests fail with "database locked"
```bash
# Delete test database files
rm -rf /tmp/pytest-*

# Re-run tests
./run_tests.sh
```

### Issue: Modal doesn't appear when clicking "Add Sponsor"
1. Open browser console (F12)
2. Check for JavaScript errors
3. Verify `/admin.js` loaded correctly (Network tab)
4. Refresh page and try again

### Issue: "Saved." message doesn't appear
1. Check browser console for fetch errors
2. Verify `/api/admin/sponsors` endpoint is responding
3. Check network requests in DevTools
4. Verify authentication cookie is present

---

## Database Inspection

### View SQLite Database During Testing

```bash
# While server is running in another terminal
sqlite3 data/site.db

# List tables
.tables

# View sponsors
SELECT * FROM sponsors;

# View site content
SELECT key, value FROM site_content;

# Exit
.quit
```

---

## Performance Testing

### Load Testing Sponsors
```bash
# Create 100 sponsors and measure response time
for i in {1..100}; do
  curl -X POST http://localhost:8080/api/admin/sponsors \
    -H "Content-Type: application/json" \
    -b cookies.txt \
    -d "{\"name\": \"Sponsor $i\", \"level\": \"Community\", \"address\": \"\", \"logo_url\": \"\", \"mark_text\": \"★\", \"sort_order\": $i, \"active\": true}" \
    -w "Time: %{time_total}s\\n" \
    -o /dev/null -s
done

# Get all sponsors (should be fast)
time curl http://localhost:8080/api/sponsors -o /dev/null -s
```

---

## Browser DevTools Testing

### Check Network Requests
1. Open DevTools (F12)
2. Go to Network tab
3. Perform actions:
   - Add sponsor → should see POST `/api/admin/sponsors`
   - Edit sponsor → should see PUT `/api/admin/sponsors/{id}`
   - Delete sponsor → should see DELETE `/api/admin/sponsors/{id}`
4. Verify responses are valid JSON with 200/201 status

### Check Console for Errors
1. Open DevTools Console tab
2. No red errors should appear
3. Yellow warnings are okay
4. Look for fetch error messages

### Check Application Storage
1. Open DevTools Application tab
2. Go to Cookies → localhost:8080
3. Verify `efband_session` cookie exists when logged in
4. Check cookie is HttpOnly (security feature)

---

## Final Checklist Before Merge

- [ ] All 27 automated tests pass (`./run_tests.sh`)
- [ ] No errors in browser console
- [ ] Staff email field appears and saves correctly
- [ ] Sponsor modal opens with "Add Sponsor" button
- [ ] Can create new sponsor via modal
- [ ] Can edit existing sponsor (form pre-fills)
- [ ] Can delete sponsor with confirmation
- [ ] "Bypass Payment" checkbox appears
- [ ] "Saved." message shows on form submit
- [ ] Modal closes after save
- [ ] Sponsor list updates in real-time
- [ ] Public `/api/sponsors` endpoint works without auth
- [ ] Public `/api/site` endpoint includes staff_email
- [ ] Login/logout works correctly
- [ ] Unauthenticated access is blocked
- [ ] No database errors in logs

---

## Next: Create Pull Request

Once all tests pass:

```bash
# Push final test commits
git push origin feature/cms-improvements-test

# Create PR on GitHub
# Title: "feat: Add staff email, sponsor modal, and permissions system"
# Description: Reference this testing guide
# Link issue if applicable
```

---

## Questions During Testing?

**Common Questions:**

**Q: Where's the staff email used?**
A: It's displayed in `/api/site` for contact form reply-to configuration. Currently stored, ready for contact form integration.

**Q: Can non-admins see the bypass payment checkbox?**
A: Currently all users see it (set to true in `/api/admin/me`). When full permission system is implemented, only users with `sponsors:bypass_payment` permission will see it.

**Q: Why does the modal close automatically?**
A: Better UX - automatically closes after 600ms when save succeeds. User can still see the sponsor was added by looking at the list.

**Q: How are sponsors sorted?**
A: By `sort_order` field (ascending). Edit the field to reorder them.

---

For detailed API documentation, see `TESTING.md`
