#!/bin/bash
# Verification Script: Quick curl-based tests for Vayne API endpoints
# Usage: ./verify_with_curl.sh <auth_token>

set -e

BASE_URL="${BASE_URL:-https://api.billionverifier.io}"
API_BASE="${BASE_URL}/api/vayne"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test data
LINKEDIN_COOKIE="AQEFAREBAAAAABlt0NoAAAGanNEn2QAAAZsukK2DTgAAtHVybjpsaTplbnRlcnByaXNlQXV0aFRva2VuOmVKeGpaQUFDM2p0YkkwRzBpTTUyVFJBdGRmQ21DQ09JVVpHdDR3Sm14T3hLODJkZ0JBQ3dXZ2dDXnVybjpsaTplbnRlcnByaXNlUHJvZmlsZToodXJuOmxpOmVudGVycHJpc2VBY2NvdW50OjIzMjU2ODE1MywzMzg0NzQ3OTMpXnVybjpsaTptZW1iZXI6MTM1OTI3NTQ2NYKJ5nG2t-8B-i7XKIzlL7XFpoYILGc5aHypXUzWBF6uLS0whyIwrdSHisdW0EXmrwbp860jOCYevp2ekqUTMgzGfmRKcn303MgkLb3w2Sj8DA25E2hMOCfU56Qo_EWsnD5UC6JbSNt_3OuUZ-Lo1qbm69yH2gm6Me9htxk-Xf2pZWxnPjYIuaV8ojwZpn8aK9rhHfg"
SALES_NAV_URL="https://www.linkedin.com/sales/search/people?query=(recentSearchParam%3A(id%3A5083845938%2CdoLogHistory%3Atrue)%2Cfilters%3AList((type%3AINDUSTRY%2Cvalues%3AList((id%3A2048%2Ctext%3AChiropractors%2CselectionType%3AINCLUDED)))%2C(type%3APAST_TITLE%2Cvalues%3AList((id%3A31007%2Ctext%3AStay-at-Home%2520Parent%2CselectionType%3AINCLUDED)))))&sessionId=l81ClwNnTVquCzSaE5VaIg%3D%3D&viewAllFilters=true"

AUTH_TOKEN="${1:-}"

if [ -z "$AUTH_TOKEN" ]; then
    echo -e "${YELLOW}Usage: $0 <auth_token>${NC}"
    echo "Or set AUTH_TOKEN environment variable"
    echo ""
    echo "To get a token, first login:"
    echo "curl -X POST ${BASE_URL}/api/v1/auth/login \\"
    echo "  -H 'Content-Type: application/json' \\"
    echo "  -d '{\"email\":\"your@email.com\",\"password\":\"yourpassword\"}'"
    exit 1
fi

echo "=========================================="
echo "VAYNE API ENDPOINT VERIFICATION (curl)"
echo "=========================================="
echo ""

# Function to make authenticated request
api_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    
    if [ -z "$data" ]; then
        curl -s -w "\nHTTP_STATUS:%{http_code}\n" \
            -X "$method" \
            -H "Authorization: Bearer $AUTH_TOKEN" \
            -H "Content-Type: application/json" \
            "${API_BASE}${endpoint}"
    else
        curl -s -w "\nHTTP_STATUS:%{http_code}\n" \
            -X "$method" \
            -H "Authorization: Bearer $AUTH_TOKEN" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "${API_BASE}${endpoint}"
    fi
}

# Test 1: Check credits
echo "Test 1: GET /credits"
echo "-------------------"
response=$(api_request "GET" "/credits")
http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_STATUS/d')
echo "Status: $http_status"
echo "Response: $body" | jq '.' 2>/dev/null || echo "$body"
if [ "$http_status" = "200" ]; then
    echo -e "${GREEN}✅ PASSED${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
fi
echo ""

# Test 2: Validate URL
echo "Test 2: POST /url-check"
echo "----------------------"
url_check_data="{\"sales_nav_url\":\"$SALES_NAV_URL\"}"
response=$(api_request "POST" "/url-check" "$url_check_data")
http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_STATUS/d')
echo "Status: $http_status"
echo "Response: $body" | jq '.' 2>/dev/null || echo "$body"
if [ "$http_status" = "200" ]; then
    echo -e "${GREEN}✅ PASSED${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
fi
echo ""

# Test 3: Create order
echo "Test 3: POST /orders"
echo "-------------------"
order_data="{\"sales_nav_url\":\"$SALES_NAV_URL\",\"linkedin_cookie\":\"$LINKEDIN_COOKIE\"}"
response=$(api_request "POST" "/orders" "$order_data")
http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_STATUS/d')
echo "Status: $http_status"
echo "Response: $body" | jq '.' 2>/dev/null || echo "$body"

if [ "$http_status" = "200" ] || [ "$http_status" = "201" ]; then
    echo -e "${GREEN}✅ PASSED${NC}"
    ORDER_ID=$(echo "$body" | jq -r '.order_id' 2>/dev/null)
    if [ -n "$ORDER_ID" ] && [ "$ORDER_ID" != "null" ]; then
        echo "Order ID: $ORDER_ID"
        export ORDER_ID
    fi
else
    echo -e "${RED}❌ FAILED${NC}"
    exit 1
fi
echo ""

# Test 4: Get order (should work)
echo "Test 4: GET /orders/{order_id}"
echo "------------------------------"
if [ -z "$ORDER_ID" ]; then
    echo -e "${YELLOW}⚠️  No order ID from previous step${NC}"
else
    response=$(api_request "GET" "/orders/$ORDER_ID")
    http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_STATUS/d')
    echo "Status: $http_status"
    echo "Response: $body" | jq '.' 2>/dev/null || echo "$body"
    if [ "$http_status" = "200" ]; then
        echo -e "${GREEN}✅ PASSED${NC}"
    else
        echo -e "${RED}❌ FAILED${NC}"
    fi
fi
echo ""

# Test 5: Get order status immediately (this is where the bug occurs)
echo "Test 5: GET /orders/{order_id}/status (IMMEDIATE)"
echo "--------------------------------------------------"
if [ -z "$ORDER_ID" ]; then
    echo -e "${YELLOW}⚠️  No order ID from previous step${NC}"
else
    response=$(api_request "GET" "/orders/$ORDER_ID/status")
    http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_STATUS/d')
    echo "Status: $http_status"
    echo "Response: $body" | jq '.' 2>/dev/null || echo "$body"
    if [ "$http_status" = "200" ]; then
        echo -e "${GREEN}✅ PASSED${NC}"
    elif [ "$http_status" = "404" ]; then
        echo -e "${RED}❌ FAILED - 404 Not Found (THIS IS THE BUG)${NC}"
        echo -e "${YELLOW}This confirms the timing issue!${NC}"
    else
        echo -e "${RED}❌ FAILED${NC}"
    fi
fi
echo ""

# Test 6: Get order status after delay
echo "Test 6: GET /orders/{order_id}/status (AFTER 1s DELAY)"
echo "------------------------------------------------------"
if [ -z "$ORDER_ID" ]; then
    echo -e "${YELLOW}⚠️  No order ID from previous step${NC}"
else
    sleep 1
    response=$(api_request "GET" "/orders/$ORDER_ID/status")
    http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_STATUS/d')
    echo "Status: $http_status"
    echo "Response: $body" | jq '.' 2>/dev/null || echo "$body"
    if [ "$http_status" = "200" ]; then
        echo -e "${GREEN}✅ PASSED${NC}"
    else
        echo -e "${RED}❌ FAILED${NC}"
    fi
fi
echo ""

echo "=========================================="
echo "VERIFICATION COMPLETE"
echo "=========================================="
