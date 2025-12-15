# Testing Guide: Vayne Direct API Endpoints

## ✅ Changes Pushed to GitHub

The `vayne_direct` router has been successfully registered in `main.py`. The following endpoints are now available at `/api/vayne/*` (without `/v1`):

---

## 🔧 Setup & Prerequisites

### 1. Base URL
- **Production**: `https://api.billionverifier.io`
- **Local Development**: `http://localhost:8000` (or your local backend URL)
- **Custom**: Set `NEXT_PUBLIC_API_URL` environment variable

### 2. Authentication
Most endpoints require a Bearer token. Get your token by:
1. Logging in via `/api/v1/auth/login`
2. Using the returned `access_token` in the `Authorization` header

**Format**: `Authorization: Bearer <your-token>`

### 3. Testing Tools
- **cURL** (command line)
- **Postman** (GUI)
- **Browser DevTools** (Network tab)
- **FastAPI Docs** (available at `/api/docs`)

---

## 📋 Complete List of Endpoints to Test

### Base Path: `/api/vayne`

---

### 1. ✅ **GET** `/api/vayne/auth`
**Purpose**: Check LinkedIn authentication status  
**Auth Required**: ✅ Yes (Bearer token)  
**Response**: `LinkedInAuthStatus`

**Test Command**:
```bash
curl -X GET "https://api.billionverifier.io/api/vayne/auth" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

**Expected Response**:
```json
{
  "authenticated": true/false,
  "session_id": "string or null"
}
```

---

### 2. ✅ **PATCH** `/api/vayne/auth`
**Purpose**: Update LinkedIn authentication session  
**Auth Required**: ✅ Yes (Bearer token)  
**Request Body**: `UpdateSessionRequest`

**Test Command**:
```bash
curl -X PATCH "https://api.billionverifier.io/api/vayne/auth" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "your-session-id",
    "cookies": "your-cookies-string"
  }'
```

**Expected Response**:
```json
{
  "authenticated": true,
  "session_id": "updated-session-id"
}
```

---

### 3. ✅ **GET** `/api/vayne/credits`
**Purpose**: Get available Vayne credits  
**Auth Required**: ✅ Yes (Bearer token)  
**Response**: `CreditsResponse`

**Test Command**:
```bash
curl -X GET "https://api.billionverifier.io/api/vayne/credits" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

**Expected Response**:
```json
{
  "credits": 1000,
  "message": "Credits retrieved successfully"
}
```

---

### 4. ✅ **POST** `/api/vayne/url-check`
**Purpose**: Validate LinkedIn Sales Navigator URL  
**Auth Required**: ❌ No (public endpoint)  
**Request Body**: `UrlCheckRequest`

**Test Command**:
```bash
curl -X POST "https://api.billionverifier.io/api/vayne/url-check" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/sales/search/people?query=(spell:true,keywords:CEO)"
  }'
```

**Expected Response**:
```json
{
  "valid": true,
  "message": "URL is valid",
  "normalized_url": "https://www.linkedin.com/sales/search/people?query=(spell:true,keywords:CEO)"
}
```

---

### 5. ✅ **POST** `/api/vayne/orders` ⚠️ **CRITICAL - THIS WAS THE 404 ISSUE**
**Purpose**: Create a new Vayne scraping order  
**Auth Required**: ✅ Yes (Bearer token)  
**Request Body**: `CreateOrderRequest`  
**Status Code**: `201 Created`

**Test Command**:
```bash
curl -X POST "https://api.billionverifier.io/api/vayne/orders" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/sales/search/people?query=(spell:true,keywords:CEO)",
    "name": "Test Order - CEO Search",
    "targeting": {
      "keywords": ["CEO"],
      "locations": ["United States"]
    }
  }'
```

**Expected Response** (201 Created):
```json
{
  "order_id": "uuid-string",
  "status": "queued",
  "url": "https://www.linkedin.com/sales/search/people?query=(spell:true,keywords:CEO)",
  "name": "Test Order - CEO Search",
  "created_at": "2024-01-01T00:00:00Z",
  "message": "Order created successfully"
}
```

**⚠️ This is the endpoint that was returning 404 before the fix!**

---

### 6. ✅ **GET** `/api/vayne/orders/{order_id}`
**Purpose**: Get order details and status  
**Auth Required**: ✅ Yes (Bearer token)  
**Path Parameter**: `order_id` (UUID string)

**Test Command**:
```bash
curl -X GET "https://api.billionverifier.io/api/vayne/orders/YOUR_ORDER_ID_HERE" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

**Expected Response**:
```json
{
  "order_id": "uuid-string",
  "status": "processing" | "completed" | "failed" | "queued",
  "url": "https://...",
  "name": "Order Name",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "progress": {
    "total": 100,
    "processed": 50,
    "percentage": 50
  }
}
```

---

### 7. ✅ **POST** `/api/vayne/orders/{order_id}/export`
**Purpose**: Trigger export of order results  
**Auth Required**: ✅ Yes (Bearer token)  
**Path Parameter**: `order_id` (UUID string)

**Test Command**:
```bash
curl -X POST "https://api.billionverifier.io/api/vayne/orders/YOUR_ORDER_ID_HERE/export" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

**Expected Response**:
```json
{
  "message": "Export initiated",
  "order_id": "uuid-string",
  "export_url": "https://r2-url-to-csv-file.csv"
}
```

---

## 🧪 Step-by-Step Testing Workflow

### Step 1: Verify Router Registration
First, check that the router is registered by accessing FastAPI docs:
```
https://api.billionverifier.io/api/docs
```
Look for the **"vayne-direct"** tag section with all endpoints listed.

### Step 2: Get Authentication Token
```bash
# Login to get token
curl -X POST "https://api.billionverifier.io/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }'
```

Save the `access_token` from the response.

### Step 3: Test URL Validation (No Auth Required)
```bash
curl -X POST "https://api.billionverifier.io/api/vayne/url-check" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/sales/search/people?query=(spell:true,keywords:CEO)"
  }'
```

### Step 4: Check Auth Status
```bash
curl -X GET "https://api.billionverifier.io/api/vayne/auth" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Step 5: Check Credits
```bash
curl -X GET "https://api.billionverifier.io/api/vayne/credits" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Step 6: **CRITICAL TEST - Create Order** (This was the 404 issue)
```bash
curl -X POST "https://api.billionverifier.io/api/vayne/orders" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/sales/search/people?query=(spell:true,keywords:CEO)",
    "name": "Test Order",
    "targeting": {}
  }'
```

**Expected**: `201 Created` with order details  
**Before Fix**: `404 Not Found`

### Step 7: Get Order Status
```bash
# Use the order_id from Step 6
curl -X GET "https://api.billionverifier.io/api/vayne/orders/ORDER_ID_FROM_STEP_6" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Step 8: Export Order (when status is "completed")
```bash
curl -X POST "https://api.billionverifier.io/api/vayne/orders/ORDER_ID_FROM_STEP_6/export" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## 🔍 Verification Checklist

- [ ] Router appears in FastAPI docs at `/api/docs` under "vayne-direct" tag
- [ ] `GET /api/vayne/auth` returns 200 (not 404)
- [ ] `GET /api/vayne/credits` returns 200 (not 404)
- [ ] `POST /api/vayne/url-check` returns 200 (not 404)
- [ ] **`POST /api/vayne/orders` returns 201 Created (not 404)** ⚠️ CRITICAL
- [ ] `GET /api/vayne/orders/{order_id}` returns 200 (not 404)
- [ ] `POST /api/vayne/orders/{order_id}/export` returns 200 (not 404)
- [ ] Frontend "Start Scraping" button works without 404 errors

---

## 🐛 Troubleshooting

### If you still get 404:
1. **Check backend logs** - Look for route registration messages on startup
2. **Verify router import** - Check `main.py` line 12 has `vayne_direct` imported
3. **Verify router registration** - Check `main.py` line 167 has the router included
4. **Restart backend** - Changes require a server restart
5. **Check FastAPI docs** - Visit `/api/docs` to see registered routes

### If you get 401 Unauthorized:
- Verify your token is valid and not expired
- Check the `Authorization` header format: `Bearer <token>`
- Try logging in again to get a fresh token

### If you get 422 Validation Error:
- Check request body matches the schema
- Verify required fields are present
- Check data types match (strings, numbers, etc.)

---

## 📝 Quick Test Script

Save this as `test_vayne_endpoints.sh`:

```bash
#!/bin/bash

# Configuration
BASE_URL="${NEXT_PUBLIC_API_URL:-https://api.billionverifier.io}"
EMAIL="your-email@example.com"
PASSWORD="your-password"

echo "🔐 Step 1: Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed!"
  exit 1
fi

echo "✅ Token obtained: ${TOKEN:0:20}..."

echo ""
echo "🔍 Step 2: Testing URL check..."
curl -X POST "${BASE_URL}/api/vayne/url-check" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.linkedin.com/sales/search/people?query=(spell:true,keywords:CEO)"}'

echo ""
echo ""
echo "📊 Step 3: Checking credits..."
curl -X GET "${BASE_URL}/api/vayne/credits" \
  -H "Authorization: Bearer ${TOKEN}"

echo ""
echo ""
echo "🚀 Step 4: Creating order (CRITICAL TEST)..."
ORDER_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/vayne/orders" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/sales/search/people?query=(spell:true,keywords:CEO)",
    "name": "Test Order",
    "targeting": {}
  }')

echo "$ORDER_RESPONSE" | jq '.'

ORDER_ID=$(echo $ORDER_RESPONSE | grep -o '"order_id":"[^"]*' | cut -d'"' -f4)

if [ -z "$ORDER_ID" ]; then
  echo "❌ Order creation failed!"
  exit 1
fi

echo ""
echo "✅ Order created: ${ORDER_ID}"
echo ""
echo "📋 Step 5: Getting order status..."
curl -X GET "${BASE_URL}/api/vayne/orders/${ORDER_ID}" \
  -H "Authorization: Bearer ${TOKEN}"

echo ""
echo ""
echo "✅ All tests completed!"
```

Make it executable and run:
```bash
chmod +x test_vayne_endpoints.sh
./test_vayne_endpoints.sh
```

---

## 🎯 Success Criteria

✅ **All endpoints return proper status codes (200, 201) instead of 404**  
✅ **Frontend "Start Scraping" button works**  
✅ **Orders can be created successfully**  
✅ **Router appears in FastAPI documentation**

---

## 📚 Additional Resources

- **FastAPI Docs**: `https://api.billionverifier.io/api/docs`
- **OpenAPI Schema**: `https://api.billionverifier.io/api/openapi.json`
- **Backend Logs**: Check for route registration messages on startup

