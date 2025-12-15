#!/usr/bin/env python3
"""
Test Script: Create Vayne Scraping Order

This script directly calls the Vayne API to create a new scraping order.
It tests the /api/orders endpoint with provided Sales Navigator URL, name, and LinkedIn cookie.

Usage:
    python3 Scripts/test_vayne_order_create.py

Configuration:
    - API key, URL, name, and LinkedIn cookie are pre-configured in this script
    - Modify the constants below to change the test parameters
"""

import requests
import json
import sys
from datetime import datetime
from typing import Dict, Any, Optional

# ============================================================================
# CONFIGURATION - Modify these values as needed
# ============================================================================

# Vayne API Configuration
VAYNE_API_BASE_URL = "https://www.vayne.io"
VAYNE_API_KEY = "323df96322bd118f6d34009fc2d7672a8e0224fe75c9f1bb79022f0210246d68"

# Order Parameters
SALES_NAV_URL = "https://www.linkedin.com/sales/search/people?query=(recentSearchParam%3A(id%3A5083845938%2CdoLogHistory%3Atrue)%2Cfilters%3AList((type%3AINDUSTRY%2Cvalues%3AList((id%3A2048%2Ctext%3AChiropractors%2CselectionType%3AINCLUDED)))%2C(type%3APAST_TITLE%2Cvalues%3AList((id%3A31007%2Ctext%3AStay-at-Home%2520Parent%2CselectionType%3AINCLUDED)))))&sessionId=l81ClwNnTVquCzSaE5VaIg%3D%3D&viewAllFilters=true"

ORDER_NAME = "Q1 Sales"

LINKEDIN_COOKIE = "AQEFAREBAAAAABlt0NoAAAGanNEn2QAAAZsukK2DTgAAtHVybjpsaTplbnRlcnByaXNlQXV0aFRva2VuOmVKeGpaQUFDM2p0YkkwRzBpTTUyVFJBdGRmQ21DQ09JVVpHdDR3Sm14T3hLODJkZ0JBQ3dXZ2dDXnVybjpsaTplbnRlcnByaXNlUHJvZmlsZToodXJuOmxpOmVudGVycHJpc2VBY2NvdW50OjIzMjU2ODE1MywzMzg0NzQ3OTMpXnVybjpsaTptZW1iZXI6MTM1OTI3NTQ2NYKJ5nG2t-8B-i7XKIzlL7XFpoYILGc5aHypXUzWBF6uLS0whyIwrdSHisdW0EXmrwbp860jOCYevp2ekqUTMgzGfmRKcn303MgkLb3w2Sj8DA25E2hMOCfU56Qo_EWsnD5UC6JbSNt_3OuUZ-Lo1qbm69yH2gm6Me9htxk-Xf2pZWxnPjYIuaV8ojwZpn8aK9rhHfg"

# Optional Order Settings
ORDER_LIMIT = None  # Set to a number to limit leads, or None for no limit
EMAIL_ENRICHMENT = False  # Set to True to enable email enrichment
SAVED_SEARCH = False  # Set to True if this is a saved search
SECONDARY_WEBHOOK = ""  # Webhook URL for notifications (empty string if not used)
EXPORT_FORMAT = "simple"  # "simple" or "advanced"

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def print_header(title: str):
    """Print a formatted header."""
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70)


def print_status(message: str, status: str = "info"):
    """Print a status message with timestamp and emoji."""
    timestamp = datetime.now().strftime("%H:%M:%S")
    emoji = {
        "success": "✅",
        "error": "❌",
        "wait": "⏳",
        "info": "ℹ️",
        "warning": "⚠️"
    }.get(status, "•")
    print(f"[{timestamp}] {emoji} {message}")


def get_headers() -> Dict[str, str]:
    """Get request headers with API key authorization."""
    return {
        "Authorization": f"Bearer {VAYNE_API_KEY}",
        "Content-Type": "application/json",
    }


# ============================================================================
# API FUNCTIONS
# ============================================================================

def update_linkedin_session() -> Dict[str, Any]:
    """Update the LinkedIn session cookie before creating order."""
    print_status("Updating LinkedIn session cookie...")
    
    try:
        response = requests.patch(
            f"{VAYNE_API_BASE_URL}/api/linkedin_authentication",
            headers=get_headers(),
            json={"session_cookie": LINKEDIN_COOKIE},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print_status("LinkedIn session updated successfully", "success")
            return {"success": True, "data": data}
        else:
            error_msg = response.text
            try:
                error_data = response.json()
                error_msg = error_data.get("detail", error_data)
            except:
                pass
            print_status(f"Failed to update LinkedIn session: {response.status_code} - {error_msg}", "error")
            return {"success": False, "error": error_msg, "status_code": response.status_code}
    except Exception as e:
        print_status(f"Error updating LinkedIn session: {e}", "error")
        return {"success": False, "error": str(e)}




def check_credits() -> Dict[str, Any]:
    """Check available credits before creating order."""
    print_status("Checking available credits...")
    
    try:
        response = requests.get(
            f"{VAYNE_API_BASE_URL}/api/credits",
            headers=get_headers(),
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print_status("Credits check successful", "success")
            print(f"    Credits info: {json.dumps(data, indent=2)}")
            return {"success": True, "data": data}
        else:
            print_status(f"Credits check failed: {response.status_code}", "warning")
            return {"success": False, "status_code": response.status_code}
    except Exception as e:
        print_status(f"Error checking credits: {e}", "error")
        return {"success": False, "error": str(e)}


def validate_url() -> Dict[str, Any]:
    """Validate the Sales Navigator URL before creating order."""
    print_status("Validating Sales Navigator URL...")
    print_status(f"URL: {SALES_NAV_URL[:80]}...")
    
    try:
        response = requests.post(
            f"{VAYNE_API_BASE_URL}/api/url_checks",
            headers=get_headers(),
            json={"url": SALES_NAV_URL},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print_status("URL validation successful", "success")
            print(f"    Validation result: {json.dumps(data, indent=2)}")
            return {"success": True, "data": data}
        else:
            error_msg = response.text
            try:
                error_data = response.json()
                error_msg = error_data.get("detail", error_data)
            except:
                pass
            print_status(f"URL validation failed: {response.status_code} - {error_msg}", "error")
            return {"success": False, "error": error_msg, "status_code": response.status_code}
    except Exception as e:
        print_status(f"Error validating URL: {e}", "error")
        return {"success": False, "error": str(e)}


def create_order() -> Dict[str, Any]:
    """Create a new scraping order with Vayne API."""
    print_status("Creating scraping order...")
    print_status(f"Name: {ORDER_NAME}")
    print_status(f"URL: {SALES_NAV_URL[:80]}...")
    print_status(f"Limit: {ORDER_LIMIT if ORDER_LIMIT else 'No limit'}")
    print_status(f"Email Enrichment: {EMAIL_ENRICHMENT}")
    print_status(f"Export Format: {EXPORT_FORMAT}")
    
    payload = {
        "name": ORDER_NAME,
        "url": SALES_NAV_URL,
        "limit": ORDER_LIMIT,
        "email_enrichment": EMAIL_ENRICHMENT,
        "saved_search": SAVED_SEARCH,
        "secondary_webhook": SECONDARY_WEBHOOK,
        "export_format": EXPORT_FORMAT,
    }
    
    try:
        response = requests.post(
            f"{VAYNE_API_BASE_URL}/api/orders",
            headers=get_headers(),
            json=payload,
            timeout=60
        )
        
        print_status(f"Response Status Code: {response.status_code}")
        
        if response.status_code in [200, 201]:
            data = response.json()
            print_status("Order created successfully!", "success")
            print("\n" + "-" * 50)
            print("ORDER DETAILS:")
            print("-" * 50)
            print(json.dumps(data, indent=2))
            print("-" * 50)
            
            # Extract key info
            order_id = data.get("id") or data.get("order_id")
            if order_id:
                print_status(f"Order ID: {order_id}", "success")
                print_status(f"Check status at: GET {VAYNE_API_BASE_URL}/api/orders/{order_id}")
            
            return {"success": True, "data": data, "order_id": order_id}
        else:
            error_msg = response.text
            try:
                error_data = response.json()
                error_msg = json.dumps(error_data, indent=2)
            except:
                pass
            print_status(f"Order creation failed: {response.status_code}", "error")
            print(f"    Error: {error_msg}")
            return {"success": False, "error": error_msg, "status_code": response.status_code}
    except Exception as e:
        print_status(f"Error creating order: {e}", "error")
        return {"success": False, "error": str(e)}


def get_order_status(order_id: str) -> Dict[str, Any]:
    """Get the status of an existing order."""
    print_status(f"Getting order status for: {order_id}")
    
    try:
        response = requests.get(
            f"{VAYNE_API_BASE_URL}/api/orders/{order_id}",
            headers=get_headers(),
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print_status("Order status retrieved", "success")
            print(json.dumps(data, indent=2))
            return {"success": True, "data": data}
        else:
            print_status(f"Failed to get order status: {response.status_code}", "error")
            return {"success": False, "status_code": response.status_code}
    except Exception as e:
        print_status(f"Error getting order status: {e}", "error")
        return {"success": False, "error": str(e)}


# ============================================================================
# MAIN EXECUTION
# ============================================================================

def main():
    """Execute the Vayne order creation test."""
    print_header("VAYNE ORDER CREATION TEST")
    print(f"Target API: {VAYNE_API_BASE_URL}")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    results = {}
    
    # Step 1: Update LinkedIn session cookie
    print_header("STEP 1: Update LinkedIn Session Cookie")
    results["session_update"] = update_linkedin_session()
    
    # Step 2: Check credits
    print_header("STEP 2: Check Available Credits")
    results["credits"] = check_credits()
    
    # Step 3: Validate URL (optional but recommended)
    print_header("STEP 3: Validate Sales Navigator URL")
    results["url_validation"] = validate_url()
    
    # Step 4: Create the order
    print_header("STEP 4: Create Scraping Order")
    results["order"] = create_order()
    
    # Step 5: If order created, get initial status
    if results["order"].get("success") and results["order"].get("order_id"):
        print_header("STEP 5: Get Initial Order Status")
        order_id = results["order"]["order_id"]
        results["status"] = get_order_status(order_id)
    
    # Summary
    print_header("TEST SUMMARY")
    
    summary_items = [
        ("Session Update", results.get("session_update")),
        ("Credits Check", results.get("credits")),
        ("URL Validation", results.get("url_validation")),
        ("Order Creation", results.get("order")),
        ("Initial Status", results.get("status")),
    ]
    
    for name, result in summary_items:
        if result:
            status = "✅ PASS" if result.get("success") else "❌ FAIL"
            print(f"  {status} - {name}")
        else:
            print(f"  ⏭️  SKIP - {name}")
    
    # Final order info
    if results["order"].get("success"):
        order_id = results["order"].get("order_id")
        print("\n" + "=" * 70)
        print("ORDER CREATED SUCCESSFULLY!")
        print("=" * 70)
        if order_id:
            print(f"  Order ID: {order_id}")
            print(f"  Monitor at: {VAYNE_API_BASE_URL}/api/orders/{order_id}")
    else:
        print("\n❌ Order creation failed. Check errors above.")
        sys.exit(1)
    
    print(f"\nCompleted at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)


if __name__ == "__main__":
    main()

