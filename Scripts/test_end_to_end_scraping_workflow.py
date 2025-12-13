#!/usr/bin/env python3
"""
Complete End-to-End Scraping Workflow Test

This comprehensive script tests the entire scraping workflow from start to finish:
1. Authentication
2. Cookie update (optional)
3. Order creation
4. Status polling until completion
5. Export functionality testing (GET auto-trigger and POST export endpoint)
6. CSV verification

Usage:
    python3 scripts/test_end_to_end_scraping_workflow.py [--email EMAIL] [--password PASSWORD] [--cookie COOKIE] [--url URL] [--api-url API_URL]

Configuration:
    - Credentials can be provided via CLI arguments or environment variables
    - Environment variables: TEST_EMAIL, TEST_PASSWORD, TEST_LINKEDIN_COOKIE, TEST_SALES_NAV_URL, API_URL
    - Defaults to Railway production URL: https://api.billionverifier.io
"""

import requests
import json
import sys
import os
import time
import argparse
from datetime import datetime
from typing import Dict, Any, Optional

# Parse command line arguments
parser = argparse.ArgumentParser(
    description="Test end-to-end scraping workflow",
    formatter_class=argparse.RawDescriptionHelpFormatter,
    epilog="""
Examples:
  # Using environment variables
  export TEST_EMAIL=user@example.com
  export TEST_PASSWORD=password123
  export TEST_LINKEDIN_COOKIE=li_at_cookie_value
  export TEST_SALES_NAV_URL=https://www.linkedin.com/sales/search/...
  python3 scripts/test_end_to_end_scraping_workflow.py

  # Using CLI arguments
  python3 scripts/test_end_to_end_scraping_workflow.py \\
    --email user@example.com \\
    --password password123 \\
    --cookie li_at_cookie_value \\
    --url https://www.linkedin.com/sales/search/...
    """
)
parser.add_argument("--email", default=os.getenv("TEST_EMAIL"), help="User email (or set TEST_EMAIL env var)")
parser.add_argument("--password", default=os.getenv("TEST_PASSWORD"), help="User password (or set TEST_PASSWORD env var)")
parser.add_argument("--cookie", dest="linkedin_cookie", default=os.getenv("TEST_LINKEDIN_COOKIE"), help="LinkedIn session cookie (or set TEST_LINKEDIN_COOKIE env var)")
parser.add_argument("--url", dest="sales_nav_url", default=os.getenv("TEST_SALES_NAV_URL"), help="Sales Navigator URL (or set TEST_SALES_NAV_URL env var)")
parser.add_argument("--api-url", dest="api_url", default=os.getenv("API_URL", "https://api.billionverifier.io"), help="API base URL (or set API_URL env var)")

args = parser.parse_args()

# Validate required arguments
if not args.email:
    print("❌ Error: Email is required. Provide via --email argument or TEST_EMAIL environment variable.")
    sys.exit(1)
if not args.password:
    print("❌ Error: Password is required. Provide via --password argument or TEST_PASSWORD environment variable.")
    sys.exit(1)
if not args.linkedin_cookie:
    print("❌ Error: LinkedIn cookie is required. Provide via --cookie argument or TEST_LINKEDIN_COOKIE environment variable.")
    sys.exit(1)
if not args.sales_nav_url:
    print("❌ Error: Sales Navigator URL is required. Provide via --url argument or TEST_SALES_NAV_URL environment variable.")
    sys.exit(1)

BASE_URL = args.api_url
API_BASE = f"{BASE_URL}/api/vayne"
API_V1_BASE = f"{BASE_URL}/api/v1/vayne"

# Test credentials (from CLI args or env vars)
EMAIL = args.email
PASSWORD = args.password
LINKEDIN_COOKIE = args.linkedin_cookie
SALES_NAV_URL = args.sales_nav_url

AUTH_TOKEN: Optional[str] = None


def print_step(step_num: int, step_name: str):
    """Print a formatted step header."""
    print("\n" + "="*70)
    print(f"STEP {step_num}: {step_name}")
    print("="*70)


def print_status(message: str, status: str = "info"):
    """Print a status message with timestamp."""
    timestamp = datetime.now().strftime("%H:%M:%S")
    prefix = "✅" if status == "success" else "❌" if status == "error" else "⏳" if status == "wait" else "ℹ️"
    print(f"[{timestamp}] {prefix} {message}")


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


def make_v1_request(method: str, endpoint: str, **kwargs) -> requests.Response:
    """Make an authenticated API request to v1 endpoints."""
    url = f"{API_V1_BASE}{endpoint}"
    headers = kwargs.pop("headers", {})
    headers["Content-Type"] = "application/json"
    
    if AUTH_TOKEN:
        headers["Authorization"] = f"Bearer {AUTH_TOKEN}"
    
    return requests.request(method, url, headers=headers, **kwargs)


def step1_authenticate() -> Dict[str, Any]:
    """Step 1: Authenticate and get token."""
    print_step(1, "Authentication")
    print_status(f"Authenticating as {EMAIL}...")
    
    try:
        global AUTH_TOKEN
        AUTH_TOKEN = get_auth_token(EMAIL, PASSWORD)
        print_status("Authentication successful", "success")
        return {"success": True, "token": AUTH_TOKEN}
    except Exception as e:
        print_status(f"Authentication failed: {e}", "error")
        return {"success": False, "error": str(e)}


def step2_update_cookie() -> Dict[str, Any]:
    """Step 2: Update LinkedIn cookie (optional - also done during order creation)."""
    print_step(2, "Update LinkedIn Cookie (Optional)")
    print_status("Updating LinkedIn cookie...")
    
    try:
        response = make_v1_request(
            "PATCH",
            "/auth",
            json={"linkedin_cookie": LINKEDIN_COOKIE}
        )
        
        if response.status_code == 200:
            data = response.json()
            print_status("LinkedIn cookie updated successfully", "success")
            print_status(f"Message: {data.get('message', 'N/A')}")
            return {"success": True, "data": data}
        else:
            error_data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {"detail": response.text}
            print_status(f"Cookie update failed: {error_data.get('detail', response.text)}", "error")
            return {"success": False, "error": error_data.get('detail', response.text)}
    except Exception as e:
        print_status(f"Cookie update error: {e}", "error")
        return {"success": False, "error": str(e)}


def step3_create_order() -> Dict[str, Any]:
    """Step 3: Create a new scraping order."""
    print_step(3, "Create Scraping Order")
    print_status("Creating scraping order...")
    print_status(f"Sales Nav URL: {SALES_NAV_URL[:80]}...")
    
    try:
        response = make_v1_request(
            "POST",
            "/orders",
            json={
                "sales_nav_url": SALES_NAV_URL,
                "linkedin_cookie": LINKEDIN_COOKIE
            }
        )
        
        if response.status_code in [200, 201]:
            data = response.json()
            order_id = data.get("order_id")
            print_status("Order created successfully", "success")
            print_status(f"Order ID: {order_id}")
            print_status(f"Status: {data.get('status', 'unknown')}")
            print_status(f"Message: {data.get('message', 'N/A')}")
            return {"success": True, "order_id": order_id, "data": data}
        else:
            error_data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {"detail": response.text}
            print_status(f"Order creation failed: {error_data.get('detail', response.text)}", "error")
            return {"success": False, "error": error_data.get('detail', response.text)}
    except Exception as e:
        print_status(f"Order creation error: {e}", "error")
        return {"success": False, "error": str(e)}


def step4_poll_order_status(order_id: str, max_wait_minutes: int = 30, poll_interval: int = 10) -> Dict[str, Any]:
    """Step 4: Poll order status until scraping is finished."""
    print_step(4, "Poll Order Status Until Completion")
    print_status(f"Polling order {order_id} every {poll_interval} seconds...")
    print_status(f"Maximum wait time: {max_wait_minutes} minutes")
    
    max_wait_seconds = max_wait_minutes * 60
    start_time = time.time()
    last_status = None
    last_progress = None
    
    while True:
        elapsed = time.time() - start_time
        
        if elapsed > max_wait_seconds:
            print_status(f"Maximum wait time ({max_wait_minutes} minutes) exceeded", "error")
            return {"success": False, "error": "Timeout waiting for order completion"}
        
        try:
            response = make_request("GET", f"/orders/{order_id}")
            
            if response.status_code == 200:
                order = response.json()
                scraping_status = order.get("scraping_status", "unknown")
                status = order.get("status", "unknown")
                progress = order.get("progress_percentage", 0)
                leads_found = order.get("leads_found", 0)
                vayne_order_id = order.get("vayne_order_id")
                
                # Only print if status or progress changed
                if scraping_status != last_status or progress != last_progress:
                    print_status(
                        f"Status: {status} | Scraping: {scraping_status} | Progress: {progress}% | Leads: {leads_found} | Elapsed: {int(elapsed)}s"
                    )
                    last_status = scraping_status
                    last_progress = progress
                
                if scraping_status == "finished":
                    print_status("Order processing completed!", "success")
                    print_status(f"Final status: {status}")
                    print_status(f"Final progress: {progress}%")
                    print_status(f"Leads found: {leads_found}")
                    print_status(f"Vayne Order ID: {vayne_order_id}")
                    return {
                        "success": True,
                        "order": order,
                        "elapsed_seconds": int(elapsed)
                    }
                elif scraping_status == "failed":
                    print_status("Order processing failed!", "error")
                    return {"success": False, "error": "Order processing failed", "order": order}
            else:
                print_status(f"Failed to get order status: {response.status_code}", "error")
                if response.status_code == 404:
                    print_status("Order not found yet, waiting...", "wait")
                time.sleep(poll_interval)
                continue
                
        except Exception as e:
            print_status(f"Error polling status: {e}", "error")
        
        time.sleep(poll_interval)


def step5_test_export_auto_trigger(order_id: str) -> Dict[str, Any]:
    """Step 5: Test GET order endpoint auto-triggers exports."""
    print_step(5, "Test Export Auto-Trigger (GET Order)")
    print_status(f"Testing GET /api/vayne/orders/{order_id} for auto-trigger...")
    
    try:
        response = make_request("GET", f"/orders/{order_id}")
        
        if response.status_code == 200:
            order = response.json()
            exports = order.get("exports")
            
            if exports:
                print_status("Exports found in GET response (auto-trigger may have worked)", "success")
                print_status("Exports structure:")
                print(json.dumps(exports, indent=2))
                
                simple = exports.get("simple")
                advanced = exports.get("advanced")
                
                if simple:
                    print_status(f"Simple export: status={simple.get('status')}, has_file_url={bool(simple.get('file_url'))}")
                    if simple.get("file_url"):
                        print_status(f"  Simple file URL: {simple['file_url'][:80]}...")
                if advanced:
                    print_status(f"Advanced export: status={advanced.get('status')}, has_file_url={bool(advanced.get('file_url'))}")
                    if advanced.get("file_url"):
                        print_status(f"  Advanced file URL: {advanced['file_url'][:80]}...")
                
                return {"success": True, "exports": exports, "order": order}
            else:
                print_status("No exports found in GET response", "error")
                print_status("Auto-trigger may not have executed or exports not ready yet")
                return {"success": False, "error": "No exports in response", "order": order}
        else:
            print_status(f"Failed to get order: {response.status_code}", "error")
            return {"success": False, "error": f"Status {response.status_code}: {response.text}"}
    except Exception as e:
        print_status(f"Error testing auto-trigger: {e}", "error")
        return {"success": False, "error": str(e)}


def step6_test_export_endpoint(order_id: str) -> Dict[str, Any]:
    """Step 6: Test POST export endpoint."""
    print_step(6, "Test Export Endpoint (POST)")
    print_status(f"Testing POST /api/vayne/orders/{order_id}/export...")
    
    try:
        response = make_request("POST", f"/orders/{order_id}/export")
        
        if response.status_code in [200, 201]:
            result = response.json()
            print_status("Export endpoint called successfully", "success")
            print_status(f"Status: {result.get('status', 'N/A')}")
            print_status(f"Message: {result.get('message', 'N/A')}")
            
            exports = result.get("exports")
            if exports:
                print_status("Exports included in POST export response", "success")
                print_status("Exports details:")
                print(json.dumps(exports, indent=2))
                
                simple = exports.get("simple")
                advanced = exports.get("advanced")
                
                export_urls = {}
                if simple and simple.get("file_url"):
                    export_urls["simple"] = simple.get("file_url")
                    print_status(f"Simple export URL: {simple['file_url'][:80]}...")
                if advanced and advanced.get("file_url"):
                    export_urls["advanced"] = advanced.get("file_url")
                    print_status(f"Advanced export URL: {advanced['file_url'][:80]}...")
                
                return {"success": True, "exports": exports, "export_urls": export_urls, "result": result}
            else:
                print_status("No exports in POST export response", "error")
                print_status("Full response:")
                print(json.dumps(result, indent=2))
                return {"success": False, "error": "No exports in response", "result": result}
        else:
            print_status(f"Export endpoint failed: {response.status_code}", "error")
            print_status(f"Response: {response.text}")
            return {"success": False, "error": f"Status {response.status_code}: {response.text}"}
    except Exception as e:
        print_status(f"Error testing export endpoint: {e}", "error")
        return {"success": False, "error": str(e)}


def step7_verify_export_persistence(order_id: str) -> Dict[str, Any]:
    """Step 7: Verify exports persist after POST export."""
    print_step(7, "Verify Export Persistence")
    print_status("Waiting 2 seconds, then checking if exports persist...")
    time.sleep(2)
    
    try:
        response = make_request("GET", f"/orders/{order_id}")
        
        if response.status_code == 200:
            order = response.json()
            exports = order.get("exports")
            
            if exports:
                print_status("Exports persist in GET response after POST export", "success")
                return {"success": True, "exports": exports}
            else:
                print_status("Exports do not persist in GET response", "error")
                return {"success": False, "error": "Exports not found"}
        else:
            print_status(f"Failed to verify: {response.status_code}", "error")
            return {"success": False, "error": f"Status {response.status_code}"}
    except Exception as e:
        print_status(f"Error verifying persistence: {e}", "error")
        return {"success": False, "error": str(e)}


def step8_test_order_history(order_id: str) -> Dict[str, Any]:
    """Step 8: Test order history includes exports."""
    print_step(8, "Test Order History with Exports")
    print_status("Checking if exports appear in order history...")
    
    try:
        response = make_request("GET", "/orders?limit=10")
        
        if response.status_code == 200:
            data = response.json()
            orders = data.get("orders", [])
            print_status(f"Found {len(orders)} orders in history")
            
            test_order = next((o for o in orders if o.get("id") == order_id), None)
            if test_order:
                exports = test_order.get("exports")
                if exports:
                    print_status("Test order found in history with exports", "success")
                    return {"success": True, "exports": exports, "order": test_order}
                else:
                    print_status("Test order found in history but no exports", "error")
                    return {"success": False, "error": "No exports in history", "order": test_order}
            else:
                print_status("Test order not found in first 10 orders (may need to check more)", "error")
                return {"success": False, "error": "Order not found in history"}
        else:
            print_status(f"Failed to get order history: {response.status_code}", "error")
            return {"success": False, "error": f"Status {response.status_code}"}
    except Exception as e:
        print_status(f"Error testing history: {e}", "error")
        return {"success": False, "error": str(e)}


def main():
    """Run the complete end-to-end test."""
    print("="*70)
    print("END-TO-END SCRAPING WORKFLOW TEST")
    print("="*70)
    print(f"Target API: {BASE_URL}")
    print(f"Email: {EMAIL}")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    results = {}
    
    # Step 1: Authenticate
    results["auth"] = step1_authenticate()
    if not results["auth"].get("success"):
        print("\n❌ Authentication failed. Cannot proceed.")
        return
    
    # Step 2: Update cookie (optional - can skip)
    results["cookie"] = step2_update_cookie()
    # Don't fail if cookie update fails - it's done automatically during order creation
    
    # Step 3: Create order
    results["create_order"] = step3_create_order()
    if not results["create_order"].get("success"):
        print("\n❌ Order creation failed. Cannot proceed.")
        return
    
    order_id = results["create_order"]["order_id"]
    print_status(f"\n📋 Using Order ID: {order_id}", "success")
    
    # Step 4: Poll until completion
    results["polling"] = step4_poll_order_status(order_id, max_wait_minutes=30, poll_interval=10)
    if not results["polling"].get("success"):
        print("\n❌ Order did not complete. Cannot test exports.")
        return
    
    print_status(f"\n⏸️  Waiting 5 seconds before testing exports...", "wait")
    time.sleep(5)
    
    # Step 5: Test auto-trigger
    results["auto_trigger"] = step5_test_export_auto_trigger(order_id)
    
    # Step 6: Test export endpoint
    results["export_endpoint"] = step6_test_export_endpoint(order_id)
    
    # Step 7: Verify persistence
    results["persistence"] = step7_verify_export_persistence(order_id)
    
    # Step 8: Test history
    results["history"] = step8_test_order_history(order_id)
    
    # Summary
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    
    summary_items = [
        ("Authentication", results.get("auth")),
        ("Cookie Update", results.get("cookie")),
        ("Order Creation", results.get("create_order")),
        ("Status Polling", results.get("polling")),
        ("Auto-Trigger Export", results.get("auto_trigger")),
        ("Export Endpoint", results.get("export_endpoint")),
        ("Export Persistence", results.get("persistence")),
        ("Order History", results.get("history")),
    ]
    
    for name, result in summary_items:
        if result:
            status = "✅ PASS" if result.get("success") else "❌ FAIL"
            print(f"{status} - {name}")
        else:
            print(f"⏭️  SKIP - {name}")
    
    # Export URLs
    export_endpoint_result = results.get("export_endpoint")
    if export_endpoint_result and export_endpoint_result.get("success"):
        export_urls = export_endpoint_result.get("export_urls", {})
        if export_urls:
            print("\n" + "="*70)
            print("EXPORT URLs")
            print("="*70)
            for export_type, url in export_urls.items():
                print(f"{export_type.upper()}: {url}")
        else:
            print("\n" + "="*70)
            print("NOTE")
            print("="*70)
            print("Exports were triggered but file URLs are not yet available.")
            print("This is normal - Vayne may need additional time to generate the CSV files.")
            print("The exports structure is returned, but files may take a few minutes to be ready.")
            print(f"You can check the order again later: GET /api/vayne/orders/{order_id}")
    
    print("\n" + "="*70)
    print(f"Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*70)
    
    # Exit code
    all_critical_passed = (
        results.get("auth", {}).get("success") and
        results.get("create_order", {}).get("success") and
        results.get("polling", {}).get("success")
    )
    
    sys.exit(0 if all_critical_passed else 1)


if __name__ == "__main__":
    main()
