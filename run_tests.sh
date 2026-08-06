#!/bin/bash
# Test runner for CMS improvements feature branch

set -e

echo "🧪 East Forsyth Band CMS Improvements - Test Suite"
echo "=================================================="
echo ""

# Check if running in test environment
if [ -z "$EFBAND_TEST_ENV" ]; then
    echo "⚠️  Setting up test environment..."
    export EFBAND_TEST_ENV=true
    export EFBAND_SECRET="test-secret-key-12345"
    export EFBAND_ADMIN_USERNAME="admin"
    export EFBAND_ADMIN_PASSWORD="admin123$"
fi

echo "✓ Test environment configured"
echo ""

# Run Python tests
echo "📋 Running Backend Tests (pytest)..."
echo "-----------------------------------"
uv run pytest tests/test_cms_improvements.py -v --tb=short

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All backend tests passed!"
else
    echo ""
    echo "❌ Backend tests failed"
    exit 1
fi

echo ""
echo "=================================================="
echo "✅ Test Suite Complete - All Tests Passed"
echo "=================================================="
echo ""
echo "Summary:"
echo "  ✓ Site Settings & Staff Email"
echo "  ✓ Sponsor CRUD Operations"
echo "  ✓ User Authentication & Permissions"
echo "  ✓ Admin Dashboard Access"
echo "  ✓ Data Validation"
echo "  ✓ Public API Endpoints"
echo ""
echo "Ready to merge feature/cms-improvements-test → main"
