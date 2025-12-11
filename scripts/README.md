# Verification Scripts for Sales Nav Scraper Fix

This directory contains scripts to verify each step of fixing the 404 error in the sales nav scraper.

## Scripts

### 1. `verify_endpoints.py`
Tests that all endpoint paths are correctly configured and accessible.

**Usage:**
```bash
# Test endpoints without auth (will show 401 errors, but confirms endpoints exist)
python scripts/verify_endpoints.py

# Test with authentication
python scripts/verify_endpoints.py your@email.com yourpassword
```

**What it verifies:**
- Endpoint paths exist at `/api/vayne/*`
- Order status endpoint path: `/api/vayne/orders/{order_id}/status`
- All endpoints return expected status codes

### 2. `verify_order_flow.py`
Tests the complete order creation and status polling flow to identify the timing issue.

**Usage:**
```bash
python scripts/verify_order_flow.py your@email.com yourpassword
```

**What it verifies:**
1. URL validation works
2. Order creation succeeds
3. Order exists in database
4. **Order status endpoint returns 404 immediately after creation (THE BUG)**
5. Order status endpoint works after a delay
6. Multiple status polls work correctly

**Key Test:** Step 4 specifically tests the bug - checking order status immediately after creation should fail with 404, confirming the timing issue.

### 3. `verify_with_curl.sh`
Quick curl-based tests for manual verification.

**Usage:**
```bash
# First, get an auth token
TOKEN=$(curl -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"your@email.com","password":"yourpassword"}' \
  | jq -r '.access_token')

# Run verification
bash scripts/verify_with_curl.sh $TOKEN
```

**What it verifies:**
- All endpoints are accessible
- Order creation works
- Order status endpoint behavior (immediate vs delayed)

## Test Data

The scripts use the following test data (provided by user):
- **LinkedIn Cookie:** `AQEFAREBAAAAABlt0NoAAAGanNEn2QAAAZsukK2DTgAAtHVybjpsaTplbnRlcnByaXNlQXV0aFRva2VuOmVKeGpaQUFDM2p0YkkwRzBpTTUyVFJBdGRmQ21DQ09JVVpHdDR3Sm14T3hLODJkZ0JBQ3dXZ2dDXnVybjpsaTplbnRlcnByaXNlUHJvZmlsZToodXJuOmxpOmVudGVycHJpc2VBY2NvdW50OjIzMjU2ODE1MywzMzg0NzQ3OTMpXnVybjpsaTptZW1iZXI6MTM1OTI3NTQ2NYKJ5nG2t-8B-i7XKIzlL7XFpoYILGc5aHypXUzWBF6uLS0whyIwrdSHisdW0EXmrwbp860jOCYevp2ekqUTMgzGfmRKcn303MgkLb3w2Sj8DA25E2hMOCfU56Qo_EWsnD5UC6JbSNt_3OuUZ-Lo1qbm69yH2gm6Me9htxk-Xf2pZWxnPjYIuaV8ojwZpn8aK9rhHfg`
- **Sales Nav URL:** `https://www.linkedin.com/sales/search/people?query=(recentSearchParam%3A(id%3A5083845938%2CdoLogHistory%3Atrue)%2Cfilters%3AList((type%3AINDUSTRY%2Cvalues%3AList((id%3A2048%2Ctext%3AChiropractors%2CselectionType%3AINCLUDED)))%2C(type%3APAST_TITLE%2Cvalues%3AList((id%3A31007%2Ctext%3AStay-at-Home%2520Parent%2CselectionType%3AINCLUDED)))))&sessionId=l81ClwNnTVquCzSaE5VaIg%3D%3D&viewAllFilters=true`

## Configuration

All scripts use `http://localhost:8000` as the default backend URL. To change this:

**Python scripts:**
```python
BASE_URL = "https://your-backend-url.com"
```

**Bash script:**
```bash
export BASE_URL="https://your-backend-url.com"
bash scripts/verify_with_curl.sh $TOKEN
```

## Expected Results

### Before Fix:
- ✅ Order creation succeeds
- ✅ Order exists in database (GET /orders/{id} works)
- ❌ **Order status endpoint returns 404 immediately after creation**
- ✅ Order status endpoint works after 1-2 second delay

### After Fix:
- ✅ Order creation succeeds
- ✅ Order exists in database
- ✅ Order status endpoint works immediately (or handles 404 gracefully with retry)
- ✅ Order status endpoint works after delay

## Running All Tests

```bash
# 1. Get auth token
TOKEN=$(curl -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"your@email.com","password":"yourpassword"}' \
  | jq -r '.access_token')

# 2. Test endpoints
python scripts/verify_endpoints.py your@email.com yourpassword

# 3. Test full flow
python scripts/verify_order_flow.py your@email.com yourpassword

# 4. Quick curl test
bash scripts/verify_with_curl.sh $TOKEN
```

## Troubleshooting

### "Module not found" errors
Install required Python packages:
```bash
pip install requests
```

### "jq: command not found"
Install jq for JSON parsing:
```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq
```

### Authentication errors
Make sure you're using valid credentials and the backend is running.

### Connection errors
Check that:
1. Backend is running on the expected URL
2. CORS is configured correctly
3. Network connectivity is working
