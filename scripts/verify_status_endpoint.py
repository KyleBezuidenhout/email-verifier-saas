#!/usr/bin/env python3
"""
Simplified Verification: Test Order Status Endpoint 404 Bug
This script tests the order status endpoint behavior to verify the 404 fix.
"""

import requests
import json
import sys
import time
import os

# Configuration
BASE_URL = os.getenv("API_URL", "https://api.billionverifier.io")
API_BASE = f"{BASE_URL}/api/vayne"

def get_auth_token(email: str, password: str) -> str:
    """Get authentication token by logging in."""
    response = requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        json={"email": email, "password": password}
    )
    if response.status_code == 200:
        return response.json()["access_token"]
    raise Exception(f"Login failed: {response.status_code} - {response.text}")

def test_status_endpoint(order_id: str, token: str, description: str):
    """Test the order status endpoint."""
    url = f"{API_BASE}/orders/{order_id}/status"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    print(f"\n{description}")
    print(f"  URL: {url}")
    
    response = requests.get(url, headers=headers)
    print(f"  Status: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"  ✅ Success!")
        print(f"  Order Status: {data.get('status', 'N/A')}")
        print(f"  Scraping Status: {data.get('scraping_status', 'N/A')}")
        print(f"  Progress: {data.get('progress_percentage', 0)}%")
        return {"success": True, "status_code": 200, "data": data}
    elif response.status_code == 404:
        print(f"  ❌ 404 Not Found")
        try:
            error_data = response.json()
            print(f"  Error: {error_data.get('detail', 'Not Found')}")
        except:
            print(f"  Error: {response.text}")
        return {"success": False, "status_code": 404, "error": "Not Found"}
    else:
        print(f"  ⚠️  Unexpected status")
        print(f"  Response: {response.text[:200]}")
        return {"success": False, "status_code": response.status_code, "error": response.text}

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 verify_status_endpoint.py <email> <password> [order_id]")
        print("\nIf order_id is not provided, the script will:")
        print("1. List your recent orders")
        print("2. Test the status endpoint with the most recent order")
        sys.exit(1)
    
    email = sys.argv[1]
    password = sys.argv[2] if len(sys.argv) > 2 else input("Enter password: ")
    
    print("="*60)
    print("ORDER STATUS ENDPOINT VERIFICATION")
    print("="*60)
    
    # Authenticate
    try:
        token = get_auth_token(email, password)
        print(f"\n✅ Authentication successful")
    except Exception as e:
        print(f"\n❌ Authentication failed: {e}")
        sys.exit(1)
    
    # Get order ID
    if len(sys.argv) > 3:
        order_id = sys.argv[3]
    else:
        # Get recent orders
        print("\n📋 Fetching recent orders...")
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        response = requests.get(f"{BASE_URL}/api/v1/vayne/orders?limit=5", headers=headers)
        
        if response.status_code == 200:
            data = response.json()
            orders = data.get("orders", [])
            if not orders:
                print("❌ No orders found. Please create an order first.")
                sys.exit(1)
            
            print(f"\nFound {len(orders)} recent order(s):")
            for i, order in enumerate(orders[:5], 1):
                print(f"  {i}. {order.get('id', 'N/A')[:8]}... - {order.get('status', 'N/A')}")
            
            order_id = orders[0].get("id")
            print(f"\nUsing most recent order: {order_id[:8]}...")
        else:
            print(f"❌ Failed to fetch orders: {response.status_code}")
            print("Please provide an order_id as the third argument")
            sys.exit(1)
    
    # Test 1: Immediate status check
    result1 = test_status_endpoint(
        order_id, 
        token, 
        "Test 1: Check Status Immediately"
    )
    
    # Test 2: Status check after delay
    print("\n⏳ Waiting 1 second...")
    time.sleep(1)
    result2 = test_status_endpoint(
        order_id, 
        token, 
        "Test 2: Check Status After 1s Delay"
    )
    
    # Test 3: Multiple polls
    print("\n📊 Polling status 3 times (2 second intervals)...")
    results = []
    for i in range(3):
        result = test_status_endpoint(
            order_id,
            token,
            f"  Poll #{i+1}/3"
        )
        results.append(result)
        if i < 2:
            time.sleep(2)
    
    # Summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    
    if result1["status_code"] == 404:
        print("🐛 BUG DETECTED: Order status returns 404 immediately")
        print("   This confirms the timing issue.")
        if result2["status_code"] == 200:
            print("✅ Status works after delay - confirms timing issue")
    elif result1["status_code"] == 200:
        print("✅ Status endpoint works immediately")
    else:
        print(f"⚠️  Unexpected behavior: Status {result1['status_code']}")
    
    success_count = sum(1 for r in results if r.get("success"))
    print(f"\nPolling results: {success_count}/3 successful")
    
    if result1["status_code"] == 404 and result2["status_code"] == 200:
        print("\n" + "="*60)
        print("RECOMMENDATION")
        print("="*60)
        print("The 404 bug is confirmed. The fix should:")
        print("1. Add delay before first status poll")
        print("2. Add retry logic for 404 errors")
        print("3. Handle 404 gracefully in refreshOrderStatus")

if __name__ == "__main__":
    main()
