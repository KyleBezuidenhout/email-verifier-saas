#!/usr/bin/env python3
"""
Simple script to export Vayne order using direct API call
Usage: python3 export_vayne_simple.py <vayne_order_id> <api_key>
"""

import sys
import requests
import json

def export_vayne_order(vayne_order_id: str, api_key: str):
    """Export order from Vayne API directly."""
    base_url = "https://www.vayne.io"
    
    # Step 1: Get order status
    print(f"📥 Fetching order {vayne_order_id} from Vayne...")
    response = requests.get(
        f"{base_url}/api/orders/{vayne_order_id}",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    )
    
    if response.status_code != 200:
        print(f"❌ Failed to get order: {response.status_code}")
        print(response.text)
        return None
    
    order_data = response.json()
    order = order_data.get("order", {})
    scraping_status = order.get("scraping_status", "unknown")
    export_format = order.get("export_format", "simple")
    
    print(f"✅ Order status: {scraping_status}")
    print(f"   Export format: {export_format}")
    
    # Step 2: Export CSV
    print(f"\n📤 Exporting CSV...")
    export_response = requests.post(
        f"{base_url}/api/orders/{vayne_order_id}/export",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        },
        json={"export_format": export_format}
    )
    
    if export_response.status_code != 200:
        print(f"❌ Failed to export: {export_response.status_code}")
        print(export_response.text)
        return None
    
    export_data = export_response.json()
    order_export = export_data.get("order", {})
    exports = order_export.get("exports", {})
    export_info = exports.get(export_format, {})
    file_url = export_info.get("file_url")
    
    if not file_url:
        print(f"❌ No file URL in response")
        print(json.dumps(export_data, indent=2))
        return None
    
    print(f"✅ Export successful!")
    print(f"   File URL: {file_url}")
    
    # Step 3: Download CSV
    print(f"\n📥 Downloading CSV from {file_url}...")
    csv_response = requests.get(file_url)
    
    if csv_response.status_code != 200:
        print(f"❌ Failed to download CSV: {csv_response.status_code}")
        return None
    
    csv_data = csv_response.content
    print(f"✅ CSV downloaded ({len(csv_data)} bytes)")
    
    # Step 4: Save to file
    filename = f"vayne_order_{vayne_order_id}_export.csv"
    with open(filename, 'wb') as f:
        f.write(csv_data)
    
    print(f"✅ CSV saved to: {filename}")
    print(f"\n📋 Next steps:")
    print(f"   1. Upload this file to R2 manually, OR")
    print(f"   2. Use the backend export endpoint to store it automatically")
    
    return filename

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 export_vayne_simple.py <vayne_order_id> <api_key>")
        sys.exit(1)
    
    vayne_order_id = sys.argv[1]
    api_key = sys.argv[2]
    
    export_vayne_order(vayne_order_id, api_key)

