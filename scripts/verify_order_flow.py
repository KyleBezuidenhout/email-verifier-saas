#!/usr/bin/env python3
"""
Verification Script: Test Complete Order Creation and Status Flow
This script tests the full flow: create order, check status, handle 404 errors.
"""

import requests
import json
import sys
import time
from typing import Dict, Any, Optional

# Configuration
import os
BASE_URL = os.getenv("API_URL", "https://api.billionverifier.io")  # Default to Railway/production URL
API_BASE = f"{BASE_URL}/api/vayne"  # For orders endpoints
API_V1_BASE = f"{BASE_URL}/api/v1/vayne"  # For url-check and other v1 endpoints

# Test data (provided by user)
LINKEDIN_COOKIE = "AQEFAREBAAAAABlt0NoAAAGanNEn2QAAAZsukK2DTgAAtHVybjpsaTplbnRlcnByaXNlQXV0aFRva2VuOmVKeGpaQUFDM2p0YkkwRzBpTTUyVFJBdGRmQ21DQ09JVVpHdDR3Sm14T3hLODJkZ0JBQ3dXZ2dDXnVybjpsaTplbnRlcnByaXNlUHJvZmlsZToodXJuOmxpOmVudGVycHJpc2VBY2NvdW50OjIzMjU2ODE1MywzMzg0NzQ3OTMpXnVybjpsaTptZW1iZXI6MTM1OTI3NTQ2NYKJ5nG2t-8B-i7XKIzlL7XFpoYILGc5aHypXUzWBF6uLS0whyIwrdSHisdW0EXmrwbp860jOCYevp2ekqUTMgzGfmRKcn303MgkLb3w2Sj8DA25E2hMOCfU56Qo_EWsnD5UC6JbSNt_3OuUZ-Lo1qbm69yH2gm6Me9htxk-Xf2pZWxnPjYIuaV8ojwZpn8aK9rhHfg"
SALES_NAV_URL = "https://www.linkedin.com/sales/search/people?query=(recentSearchParam%3A(id%3A5083845938%2CdoLogHistory%3Atrue)%2Cfilters%3AList((type%3AINDUSTRY%2Cvalues%3AList((id%3A2048%2Ctext%3AChiropractors%2CselectionType%3AINCLUDED)))%2C(type%3APAST_TITLE%2Cvalues%3AList((id%3A31007%2Ctext%3AStay-at-Home%2520Parent%2CselectionType%3AINCLUDED)))))&sessionId=l81ClwNnTVquCzSaE5VaIg%3D%3D&viewAllFilters=true"

AUTH_TOKEN: Optional[str] = None


def get_auth_token(email: str, password: str) -> str:
    """Get authentication token by logging in."""
    response = requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        json={"email": email, "password": password}
    )
    if response.status_code == 200:
        return response.json()["access_token"]
    raise Exception(f"Login failed: {response.status_code} - {response.text}")


def make_request(method: str, endpoint: str, **kwargs) -> requests.Response:
    """Make an authenticated API request."""
    url = f"{API_BASE}{endpoint}"
    headers = kwargs.pop("headers", {})
    headers["Content-Type"] = "application/json"
    
    if AUTH_TOKEN:
        headers["Authorization"] = f"Bearer {AUTH_TOKEN}"
    
    return requests.request(method, url, headers=headers, **kwargs)


def test_step(step_name: str, test_func):
    """Run a test step and print results."""
    print("\n" + "="*60)
    print(f"STEP: {step_name}")
    print("="*60)
    
    try:
        result = test_func()
        if result.get("success"):
            print(f"✅ {step_name} - PASSED")
        else:
            print(f"❌ {step_name} - FAILED")
            print(f"   Error: {result.get('error', 'Unknown error')}")
        return result
    except Exception as e:
        print(f"❌ {step_name} - ERROR: {e}")
        return {"success": False, "error": str(e)}


def step1_validate_url() -> Dict[str, Any]:
    """Step 1: Validate the Sales Navigator URL."""
    print("Validating Sales Navigator URL...")
    
    # Use v1 endpoint for url-check
    url = f"{API_V1_BASE}/url-check"
    headers = {"Content-Type": "application/json"}
    if AUTH_TOKEN:
        headers["Authorization"] = f"Bearer {AUTH_TOKEN}"
    
    response = requests.post(url, headers=headers, json={"sales_nav_url": SALES_NAV_URL})
    
    if response.status_code == 200:
        data = response.json()
        print(f"   URL is valid: {data.get('is_valid', False)}")
        print(f"   Estimated results: {data.get('estimated_results', 0)}")
        return {"success": True, "data": data}
    else:
        return {"success": False, "error": f"Status {response.status_code}: {response.text}"}


def step2_create_order() -> Dict[str, Any]:
    """Step 2: Create a new scraping order."""
    print("Creating scraping order...")
    
    # Use v1 endpoint for order creation (vayne_direct may not be deployed)
    url = f"{API_V1_BASE}/orders"
    headers = {"Content-Type": "application/json"}
    if AUTH_TOKEN:
        headers["Authorization"] = f"Bearer {AUTH_TOKEN}"
    
    response = requests.post(
        url,
        headers=headers,
        json={
            "sales_nav_url": SALES_NAV_URL,
            "linkedin_cookie": LINKEDIN_COOKIE
        }
    )
    
    if response.status_code in [200, 201]:
        data = response.json()
        order_id = data.get("order_id")
        print(f"   Order created successfully!")
        print(f"   Order ID: {order_id}")
        print(f"   Status: {data.get('status', 'unknown')}")
        return {"success": True, "order_id": order_id, "data": data}
    else:
        error_data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {"detail": response.text}
        return {"success": False, "error": f"Status {response.status_code}: {error_data.get('detail', response.text)}"}


def step3_check_order_exists(order_id: str) -> Dict[str, Any]:
    """Step 3: Check if order exists by fetching it."""
    print(f"Checking if order {order_id} exists...")
    
    # Try both endpoints - vayne_direct first, then v1
    url = f"{API_BASE}/orders/{order_id}"
    headers = {"Content-Type": "application/json"}
    if AUTH_TOKEN:
        headers["Authorization"] = f"Bearer {AUTH_TOKEN}"
    
    response = requests.get(url, headers=headers)
    if response.status_code == 404:
        # Try v1 endpoint
        url = f"{API_V1_BASE}/orders/{order_id}"
        response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        print(f"   Order found!")
        print(f"   Status: {data.get('status', 'unknown')}")
        print(f"   Scraping Status: {data.get('scraping_status', 'unknown')}")
        return {"success": True, "data": data}
    elif response.status_code == 404:
        return {"success": False, "error": "Order not found (404)"}
    else:
        return {"success": False, "error": f"Status {response.status_code}: {response.text}"}


def step4_check_order_status_immediate(order_id: str) -> Dict[str, Any]:
    """Step 4: Check order status immediately after creation (this might fail with 404)."""
    print(f"Checking order status immediately (may fail with 404)...")
    
    # Use vayne_direct endpoint for status (this is the one we're testing)
    url = f"{API_BASE}/orders/{order_id}/status"
    headers = {"Content-Type": "application/json"}
    if AUTH_TOKEN:
        headers["Authorization"] = f"Bearer {AUTH_TOKEN}"
    
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        print(f"   Status endpoint works!")
        print(f"   Status: {data.get('status', 'unknown')}")
        print(f"   Scraping Status: {data.get('scraping_status', 'unknown')}")
        return {"success": True, "data": data, "immediate": True}
    elif response.status_code == 404:
        print(f"   ⚠️  Got 404 - Order not found (this is the bug we're fixing)")
        return {"success": False, "error": "404 Not Found", "status_code": 404, "immediate": True}
    else:
        return {"success": False, "error": f"Status {response.status_code}: {response.text}"}


def step5_check_order_status_with_delay(order_id: str, delay: float = 1.0) -> Dict[str, Any]:
    """Step 5: Check order status after a delay (should work)."""
    print(f"Waiting {delay} seconds before checking status...")
    time.sleep(delay)
    
    print(f"Checking order status after delay...")
    url = f"{API_BASE}/orders/{order_id}/status"
    headers = {"Content-Type": "application/json"}
    if AUTH_TOKEN:
        headers["Authorization"] = f"Bearer {AUTH_TOKEN}"
    
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        print(f"   Status endpoint works after delay!")
        print(f"   Status: {data.get('status', 'unknown')}")
        print(f"   Scraping Status: {data.get('scraping_status', 'unknown')}")
        print(f"   Progress: {data.get('progress_percentage', 0)}%")
        return {"success": True, "data": data, "delayed": True}
    elif response.status_code == 404:
        return {"success": False, "error": "404 Not Found (still failing after delay)", "status_code": 404}
    else:
        return {"success": False, "error": f"Status {response.status_code}: {response.text}"}


def step6_poll_order_status(order_id: str, max_attempts: int = 5) -> Dict[str, Any]:
    """Step 6: Poll order status multiple times to simulate frontend polling."""
    print(f"Polling order status {max_attempts} times...")
    
    url = f"{API_BASE}/orders/{order_id}/status"
    headers = {"Content-Type": "application/json"}
    if AUTH_TOKEN:
        headers["Authorization"] = f"Bearer {AUTH_TOKEN}"
    
    results = []
    for i in range(max_attempts):
        print(f"\n   Poll #{i+1}/{max_attempts}...")
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            print(f"      ✅ Success - Status: {data.get('status')}, Progress: {data.get('progress_percentage', 0)}%")
            results.append({"success": True, "attempt": i+1, "data": data})
        elif response.status_code == 404:
            print(f"      ❌ 404 Not Found (attempt {i+1})")
            results.append({"success": False, "attempt": i+1, "error": "404"})
        else:
            print(f"      ⚠️  Status {response.status_code}")
            results.append({"success": False, "attempt": i+1, "error": f"Status {response.status_code}"})
        
        if i < max_attempts - 1:
            time.sleep(2)  # Wait 2 seconds between polls
    
    success_count = sum(1 for r in results if r.get("success"))
    return {
        "success": success_count > 0,
        "success_count": success_count,
        "total_attempts": max_attempts,
        "results": results
    }


def main():
    """Run the complete order flow verification."""
    global AUTH_TOKEN
    
    print("="*60)
    print("VAYNE ORDER FLOW VERIFICATION")
    print("="*60)
    
    # Get authentication
    if len(sys.argv) < 2:
        print("\nUsage: python verify_order_flow.py <email> [password]")
        print("   Or set AUTH_TOKEN environment variable")
        sys.exit(1)
    
    email = sys.argv[1]
    password = sys.argv[2] if len(sys.argv) > 2 else input("Enter password: ")
    
    try:
        AUTH_TOKEN = get_auth_token(email, password)
        print(f"\n✅ Authentication successful")
    except Exception as e:
        print(f"\n❌ Authentication failed: {e}")
        sys.exit(1)
    
    # Run test steps
    results = {}
    
    # Step 1: Validate URL
    results["url_validation"] = test_step("1. Validate URL", step1_validate_url)
    if not results["url_validation"].get("success"):
        print("\n❌ URL validation failed. Cannot proceed.")
        return
    
    # Step 2: Create Order
    results["create_order"] = test_step("2. Create Order", step2_create_order)
    if not results["create_order"].get("success"):
        print("\n❌ Order creation failed. Cannot proceed.")
        return
    
    order_id = results["create_order"]["order_id"]
    
    # Step 3: Check if order exists
    results["order_exists"] = test_step("3. Check Order Exists", lambda: step3_check_order_exists(order_id))
    
    # Step 4: Check status immediately (this is where the bug occurs)
    results["status_immediate"] = test_step("4. Check Status Immediately", lambda: step4_check_order_status_immediate(order_id))
    
    # Step 5: Check status after delay
    results["status_delayed"] = test_step("5. Check Status After Delay", lambda: step5_check_order_status_with_delay(order_id, delay=1.0))
    
    # Step 6: Poll status multiple times
    results["poll_status"] = test_step("6. Poll Status Multiple Times", lambda: step6_poll_order_status(order_id, max_attempts=5))
    
    # Summary
    print("\n" + "="*60)
    print("VERIFICATION SUMMARY")
    print("="*60)
    
    for step_name, result in results.items():
        status = "✅" if result.get("success") else "❌"
        print(f"{status} {step_name}")
        if not result.get("success") and result.get("error"):
            print(f"   Error: {result.get('error')}")
    
    # Key finding
    if results.get("status_immediate", {}).get("status_code") == 404:
        print("\n" + "="*60)
        print("🐛 BUG CONFIRMED")
        print("="*60)
        print("The order status endpoint returns 404 immediately after order creation.")
        print("This confirms the timing issue that needs to be fixed.")
        print("\nRecommended fix:")
        print("1. Add a small delay (500ms-1s) before first status poll")
        print("2. Add retry logic for 404 errors in refreshOrderStatus")
        print("3. Ensure order is committed to DB before returning from create_order")


if __name__ == "__main__":
    main()
