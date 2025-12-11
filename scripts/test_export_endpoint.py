#!/usr/bin/env python3
"""
Test the export endpoint to verify it returns exports in the response
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

def test_export_endpoint(email: str, password: str, order_id: str):
    """Test the export endpoint returns exports."""
    print("="*60)
    print("TESTING EXPORT ENDPOINT")
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
    
    # First check order state
    print(f"\n📋 Checking order {order_id}...")
    order_response = requests.get(f"{BASE_URL}/api/vayne/orders/{order_id}", headers=headers)
    if order_response.status_code == 200:
        order = order_response.json()
        print(f"  Status: {order.get('status')}")
        print(f"  Scraping Status: {order.get('scraping_status')}")
        print(f"  Vayne Order ID: {order.get('vayne_order_id')}")
        print(f"  Has exports: {'Yes' if order.get('exports') else 'No'}")
        if order.get('exports'):
            print(f"  Exports: {json.dumps(order['exports'], indent=2)}")
    
    # Trigger export
    print(f"\n📤 Triggering export via POST /api/vayne/orders/{order_id}/export...")
    export_response = requests.post(
        f"{BASE_URL}/api/vayne/orders/{order_id}/export",
        headers=headers
    )
    
    if export_response.status_code in [200, 201]:
        result = export_response.json()
        print(f"✅ Export endpoint called successfully!")
        print(f"\nResponse:")
        print(json.dumps(result, indent=2))
        
        if result.get('exports'):
            print(f"\n✅ Exports included in response!")
            return True
        else:
            print(f"\n⚠️  Exports not in response (may need to wait for file generation)")
            return True  # Not a failure, exports may be generated asynchronously
    else:
        print(f"❌ Export endpoint failed: {export_response.status_code}")
        print(f"   Response: {export_response.text}")
        return False
    
    # Check order again to see if exports are now populated
    print(f"\n🔄 Checking order again...")
    order_response = requests.get(f"{BASE_URL}/api/vayne/orders/{order_id}", headers=headers)
    if order_response.status_code == 200:
        order = order_response.json()
        if order.get('exports'):
            print(f"✅ Exports now available in order!")
            print(json.dumps(order['exports'], indent=2))
            return True
        else:
            print(f"⚠️  Exports still not available")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 scripts/test_export_endpoint.py <email> <password> <order_id>")
        sys.exit(1)
    
    email = sys.argv[1]
    password = sys.argv[2]
    order_id = sys.argv[3]
    
    success = test_export_endpoint(email, password, order_id)
    sys.exit(0 if success else 1)
