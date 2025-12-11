# Running Verification Scripts

## Prerequisites

1. **Backend must be running** on `http://localhost:8000`
2. **Python 3** with `requests` module installed
3. **Valid user credentials** for authentication

## Quick Start

### 1. Start the Backend

First, ensure your backend is running:

```bash
# Navigate to backend directory
cd backend

# Install dependencies (if not already done)
pip install -r requirements.txt

# Start the FastAPI server
uvicorn app.main:app --reload --port 8000
```

Or if you have a different way to start the backend, use that.

### 2. Verify Backend is Running

```bash
curl http://localhost:8000/health
```

Should return: `{"status":"healthy"}`

### 3. Run Verification Scripts

#### Option A: Endpoint Verification (No Auth Required)

Tests that all endpoint paths exist:

```bash
python3 scripts/verify_endpoints.py
```

This will show connection errors if backend isn't running, but will verify endpoint paths once backend is up.

#### Option B: Full Order Flow Test (Requires Auth)

Tests the complete order creation and status polling flow:

```bash
python3 scripts/verify_order_flow.py your@email.com yourpassword
```

This will:
1. Validate the Sales Navigator URL
2. Create a scraping order
3. Test immediate status check (should show 404 bug)
4. Test delayed status check (should work)
5. Poll status multiple times

#### Option C: Quick Curl Test (Requires Auth Token)

First, get an auth token:

```bash
TOKEN=$(curl -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"your@email.com","password":"yourpassword"}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")
```

Then run the curl verification:

```bash
bash scripts/verify_with_curl.sh $TOKEN
```

## Expected Results

### Before Fix:
- ✅ Order creation succeeds
- ✅ Order exists in database
- ❌ **Order status endpoint returns 404 immediately after creation** (THE BUG)
- ✅ Order status endpoint works after 1-2 second delay

### After Fix:
- ✅ Order creation succeeds
- ✅ Order exists in database
- ✅ Order status endpoint works immediately (or handles 404 gracefully with retry)
- ✅ Order status endpoint works after delay

## Troubleshooting

### "Connection refused" errors
- Backend is not running
- Backend is running on a different port
- Update `BASE_URL` in the scripts if backend is on a different host/port

### "Module not found: requests"
```bash
pip3 install requests
```

### Authentication errors
- Check your email and password are correct
- Ensure the user exists in the database
- Check backend logs for authentication issues

### 404 errors on order status
- This is the bug we're fixing!
- The scripts will show this behavior before the fix
- After the fix, it should retry gracefully or work immediately

## What the Scripts Test

1. **verify_endpoints.py**: Tests that all endpoint paths are correctly configured
2. **verify_order_flow.py**: Tests the complete flow including the 404 bug
3. **verify_with_curl.sh**: Quick manual verification using curl

All scripts use the test data provided:
- LinkedIn Cookie: (from user)
- Sales Nav URL: (from user)
