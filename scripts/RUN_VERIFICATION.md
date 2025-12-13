# Running Verification Scripts

## Prerequisites

1. **Backend must be running** (scripts default to Railway: `https://api.billionverifier.io`)
   - For local testing, set `API_URL=http://localhost:8000` environment variable
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

#### Option C: Status Endpoint Test (Requires Auth)

Tests order status endpoint with existing or new orders:

```bash
# Uses most recent order if no order_id provided
python3 scripts/verify_status_endpoint.py your@email.com yourpassword

# Test with specific order ID
python3 scripts/verify_status_endpoint.py your@email.com yourpassword <order_id>
```

#### Option D: Quick Curl Test (Requires Auth Token)

First, get an auth token (defaults to Railway):

```bash
TOKEN=$(curl -X POST https://api.billionverifier.io/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"your@email.com","password":"yourpassword"}' \
  | jq -r '.access_token')
```

Then run the curl verification:

```bash
bash scripts/verify_with_curl.sh $TOKEN
```

## Expected Results

### Current Behavior (After Fix):
- ✅ Order creation succeeds
- ✅ Order exists in database
- ✅ Order status endpoint works immediately after creation
- ✅ Order status endpoint works after delay
- ✅ Multiple status polls work correctly

**Note:** If you see 404 errors on order status immediately after creation, this indicates the timing issue may still exist and needs to be investigated.

## Troubleshooting

### "Connection refused" errors
- Backend is not running (if testing locally)
- Backend is running on a different port
- Set `API_URL` environment variable to test against a different URL:
  ```bash
  export API_URL="http://localhost:8000"
  python3 scripts/verify_endpoints.py your@email.com yourpassword
  ```

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

1. **verify_endpoints.py**: Tests that all endpoint paths are correctly configured and accessible
2. **verify_status_endpoint.py**: Tests order status endpoint behavior with existing orders
3. **verify_order_flow.py**: Tests the complete flow including order creation and status polling
4. **verify_with_curl.sh**: Quick manual verification using curl

All scripts use the test data provided:
- LinkedIn Cookie: (embedded in scripts)
- Sales Nav URL: (embedded in scripts)

**Default Configuration:** All scripts default to Railway production URL (`https://api.billionverifier.io`). To test locally, set `export API_URL=http://localhost:8000` before running the scripts.
