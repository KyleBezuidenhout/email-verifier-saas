#!/usr/bin/env python3
"""
Fix order 45947: Upload CSV to R2 and update database
This script handles the case where Vayne export is in 'advanced' format
"""
import os
import sys
import asyncio
import boto3
import httpx
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.vayne_order import VayneOrder

VAYNE_API_KEY = "323df96322bd118f6d34009fc2d7672a8e0224fe75c9f1bb79022f0210246d68"
VAYNE_ORDER_ID = "45947"

async def fix_order():
    """Download CSV from Vayne and upload to R2."""
    db = SessionLocal()
    
    try:
        # Find order by vayne_order_id
        order = db.query(VayneOrder).filter(
            VayneOrder.vayne_order_id == VAYNE_ORDER_ID
        ).first()
        
        if not order:
            print(f"❌ Order with vayne_order_id {VAYNE_ORDER_ID} not found")
            print("Available orders:")
            all_orders = db.query(VayneOrder).all()
            for o in all_orders:
                print(f"  - {o.id}: vayne_order_id={o.vayne_order_id}, status={o.status}")
            return
        
        print(f"✅ Found order: {order.id}")
        print(f"   Status: {order.status}")
        print(f"   Export format: {order.export_format}")
        
        # Check Vayne API for available export
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://www.vayne.io/api/orders/{VAYNE_ORDER_ID}",
                headers={"Authorization": f"Bearer {VAYNE_API_KEY}"}
            )
            vayne_order = response.json().get("order", {})
            exports = vayne_order.get("exports", {})
            
            # Check which format is available
            available_format = None
            file_url = None
            
            if exports.get("advanced", {}).get("status") == "completed":
                available_format = "advanced"
                file_url = exports["advanced"].get("file_url")
            elif exports.get("simple", {}).get("status") == "completed":
                available_format = "simple"
                file_url = exports["simple"].get("file_url")
            
            if not file_url:
                print(f"❌ No completed export found in Vayne")
                print(f"   Advanced: {exports.get('advanced', {}).get('status')}")
                print(f"   Simple: {exports.get('simple', {}).get('status')}")
                return
            
            print(f"✅ Found {available_format} export: {file_url}")
            
            # Download CSV
            print(f"📥 Downloading CSV...")
            csv_response = await client.get(file_url)
            csv_response.raise_for_status()
            csv_data = csv_response.content
            print(f"✅ Downloaded CSV ({len(csv_data)} bytes)")
        
        # Initialize S3 client for R2
        s3_client = boto3.client(
            's3',
            endpoint_url=settings.CLOUDFLARE_R2_ENDPOINT_URL,
            aws_access_key_id=settings.CLOUDFLARE_R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
            region_name='auto'
        )
        
        # Store CSV in R2
        r2_path = f"vayne-orders/{order.id}/export.csv"
        print(f"📤 Uploading to R2: {r2_path}...")
        
        s3_client.put_object(
            Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
            Key=r2_path,
            Body=csv_data,
            ContentType="text/csv"
        )
        
        print(f"✅ CSV uploaded to R2")
        
        # Update order in database
        order.csv_file_path = r2_path
        order.status = "completed"
        if not order.completed_at:
            order.completed_at = datetime.utcnow()
        db.commit()
        
        print(f"\n✅ Order updated successfully!")
        print(f"   Order ID: {order.id}")
        print(f"   CSV path: {r2_path}")
        print(f"   Status: completed")
        print(f"\n🎉 Done! The Enrich button should now appear in the UI.")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(fix_order())

