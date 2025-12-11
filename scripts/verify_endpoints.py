#!/usr/bin/env python3
"""
Verification Script: Test Vayne API Endpoints
This script verifies that all endpoints are correctly configured and accessible.
"""

import requests
import json
import sys
from typing import Dict, Any

# Configuration
import os
BASE_URL = os.getenv("API_URL", "https://api.billionverifier.io")  # Default to Railway/production URL
API_BASE = f"{BASE_URL}/api/vayne"

# Test credentials (you'll need to get a valid token)
# For testing, you can get a token by logging in first
AUTH_TOKEN = None  # Set this after getting a token from login


def get_auth_token(email: str, password: str) -> str:
    """Get authentication token by logging in."""
    response = requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        json={"email": email, "password": password}
    )
    if response.status_code == 200:
        return response.json()["access_token"]
    raise Exception(f"Login failed: {response.status_code} - {response.text}")


def test_endpoint(method: str, endpoint: str, expected_status: int = 200, **kwargs) -> Dict[str, Any]:
    """Test an endpoint and return the result."""
    url = f"{API_BASE}{endpoint}"
    headers = kwargs.pop("headers", {})
    
    if AUTH_TOKEN:
        headers["Authorization"] = f"Bearer {AUTH_TOKEN}"
    
    print(f"\n{'='*60}")
    print(f"Testing: {method} {endpoint}")
    print(f"URL: {url}")
    print(f"{'='*60}")
    
    try:
        response = requests.request(method, url, headers=headers, **kwargs)
        
        print(f"Status Code: {response.status_code}")
        print(f"Expected: {expected_status}")
        
        if response.status_code == expected_status:
            print("✅ PASSED")
        else:
            print("❌ FAILED")
        
        try:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)}")
        except:
            print(f"Response (text): {response.text}")
        
        return {
            "endpoint": endpoint,
            "method": method,
            "status_code": response.status_code,
            "expected": expected_status,
            "passed": response.status_code == expected_status,
            "response": response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
        }
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return {
            "endpoint": endpoint,
            "method": method,
            "error": str(e),
            "passed": False
        }


def main():
    """Run all endpoint verification tests."""
    global AUTH_TOKEN
    
    print("="*60)
    print("VAYNE API ENDPOINT VERIFICATION")
    print("="*60)
    
    # Step 1: Verify endpoint paths exist
    print("\n📋 Step 1: Verifying Endpoint Paths")
    print("-" * 60)
    
    # Test endpoints (some will fail without auth, but we're checking if they exist)
    endpoints_to_test = [
        ("GET", "/auth", 200),  # Should work without auth or return 401
        ("GET", "/credits", 401),  # Requires auth
        ("POST", "/url-check", 401),  # Requires auth
        ("POST", "/orders", 401),  # Requires auth
        ("GET", "/orders", 401),  # Requires auth
    ]
    
    results = []
    for method, endpoint, expected in endpoints_to_test:
        result = test_endpoint(method, endpoint, expected_status=expected)
        results.append(result)
    
    # Step 2: Test with authentication (if token provided)
    if len(sys.argv) > 1:
        email = sys.argv[1]
        password = sys.argv[2] if len(sys.argv) > 2 else input("Enter password: ")
        
        print("\n📋 Step 2: Testing with Authentication")
        print("-" * 60)
        
        try:
            AUTH_TOKEN = get_auth_token(email, password)
            print(f"✅ Authentication successful")
            
            # Test authenticated endpoints
            auth_endpoints = [
                ("GET", "/credits", 200),
                ("GET", "/orders", 200),
            ]
            
            for method, endpoint, expected in auth_endpoints:
                result = test_endpoint(method, endpoint, expected_status=expected)
                results.append(result)
                
        except Exception as e:
            print(f"❌ Authentication failed: {e}")
    
    # Step 3: Test order status endpoint path specifically
    print("\n📋 Step 3: Testing Order Status Endpoint Path")
    print("-" * 60)
    print("Testing: GET /api/vayne/orders/{order_id}/status")
    
    # This will fail with 404 if order doesn't exist, but we're checking the path
    test_order_id = "00000000-0000-0000-0000-000000000000"  # Dummy UUID
    result = test_endpoint("GET", f"/orders/{test_order_id}/status", expected_status=404)
    results.append(result)
    
    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    
    passed = sum(1 for r in results if r.get("passed", False))
    total = len(results)
    
    print(f"Passed: {passed}/{total}")
    
    for result in results:
        status = "✅" if result.get("passed", False) else "❌"
        print(f"{status} {result.get('method', '?')} {result.get('endpoint', '?')}")
    
    if passed == total:
        print("\n✅ All endpoint paths are correctly configured!")
    else:
        print("\n⚠️  Some endpoints may need attention. Check the results above.")


if __name__ == "__main__":
    main()
