#!/usr/bin/env python3
"""
Test script to verify exports are included in order responses
"""

import requests
import json
import sys
import os

BASE_URL = os.getenv("API_URL", "https://api.billionverifier.io")

def get_auth_token(email: str, password: str) -> str:
    """Get authentication token by logging in."""
    response = requests.post(
        f"{BASE_URL}/api/v1/auth/login",
        json={"email": email, "password": password}
    )
    if response.status_code == 200:
        return response.json()["access_token"]
    raise Exception(f"Login failed: {response.status_code} - {response.text}")

def test_order_with_exports(email: str, password: str, order_id: str = None):
    """Test that order responses include exports field."""
    print("="*60)
    print("TESTING EXPORTS IN ORDER RESPONSES")
    print("="*60)
    
    # Authenticate
    try:
        token = get_auth_token(email, password)
        print(f"\n✅ Authentication successful")
    except Exception as e:
        print(f"\n❌ Authentication failed: {e}")
        return False
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # Test 1: Get order list
    print("\n📋 Test 1: Checking order list includes exports")
    print("-" * 60)
    response = requests.get(f"{BASE_URL}/api/vayne/orders?limit=5", headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        orders = data.get("orders", [])
        print(f"Found {len(orders)} orders")
        
        if orders:
            # Check first completed order for exports
            for order in orders:
                order_id_to_test = order.get("id")
                print(f"\nChecking order: {order_id_to_test[:8]}...")
                print(f"  Status: {order.get('status')}")
                print(f"  Scraping Status: {order.get('scraping_status')}")
                print(f"  Has exports field: {'exports' in order}")
                
                if 'exports' in order:
                    exports = order.get('exports')
                    if exports:
                        print(f"  ✅ Exports included!")
                        if exports.get('simple'):
                            simple = exports['simple']
                            print(f"    Simple: status={simple.get('status')}, file_url={'Yes' if simple.get('file_url') else 'No'}")
                        if exports.get('advanced'):
                            advanced = exports['advanced']
                            print(f"    Advanced: status={advanced.get('status')}, file_url={'Yes' if advanced.get('file_url') else 'No'}")
                    else:
                        print(f"  ⚠️  Exports field is None")
                else:
                    print(f"  ❌ Exports field missing")
                
                # Use this order for detailed test if it's completed
                if order.get('status') == 'completed' and order.get('scraping_status') == 'finished':
                    if order_id is None:
                        order_id = order_id_to_test
                        break
        else:
            print("⚠️  No orders found")
            return True  # Not a failure, just no data to test
    
    # Test 2: Get specific order
    if order_id:
        print(f"\n📋 Test 2: Testing GET /api/vayne/orders/{order_id}")
        print("-" * 60)
        response = requests.get(f"{BASE_URL}/api/vayne/orders/{order_id}", headers=headers)
        
        if response.status_code == 200:
            order = response.json()
            print(f"✅ Order retrieved successfully")
            print(f"  Status: {order.get('status')}")
            print(f"  Scraping Status: {order.get('scraping_status')}")
            
            if 'exports' in order:
                exports = order.get('exports')
                if exports:
                    print(f"\n  ✅ Exports structure:")
                    if exports.get('simple'):
                        simple = exports['simple']
                        print(f"    Simple:")
                        print(f"      Status: {simple.get('status')}")
                        if simple.get('file_url'):
                            print(f"      File URL: {simple.get('file_url')[:80]}...")
                        else:
                            print(f"      File URL: None")
                    
                    if exports.get('advanced'):
                        advanced = exports['advanced']
                        print(f"    Advanced:")
                        print(f"      Status: {advanced.get('status')}")
                        if advanced.get('file_url'):
                            print(f"      File URL: {advanced.get('file_url')[:80]}...")
                        else:
                            print(f"      File URL: None")
                else:
                    print(f"  ⚠️  Exports field is None")
            else:
                print(f"  ❌ Exports field missing from response")
                return False
        else:
            print(f"❌ Failed to get order: {response.status_code}")
            print(f"   Response: {response.text}")
            return False
    
    print("\n" + "="*60)
    print("TEST COMPLETE")
    print("="*60)
    return True

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 scripts/test_exports.py <email> <password> [order_id]")
        sys.exit(1)
    
    email = sys.argv[1]
    password = sys.argv[2]
    order_id = sys.argv[3] if len(sys.argv) > 3 else None
    
    success = test_order_with_exports(email, password, order_id)
    sys.exit(0 if success else 1)
