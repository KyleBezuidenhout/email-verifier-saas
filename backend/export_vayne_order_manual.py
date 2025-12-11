#!/usr/bin/env python3
"""
Manual script to export a Vayne order and store it in R2
Usage: python export_vayne_order_manual.py <vayne_order_id>
"""

import os
import sys
import asyncio
import boto3

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings
from app.services.vayne_client import VayneClient
from app.db.session import SessionLocal
from app.models.vayne_order import VayneOrder
from datetime import datetime

async def export_and_store_order(vayne_order_id: str):
    """Export order from Vayne and store in R2."""
    db = SessionLocal()
    
    try:
        # Find order by vayne_order_id
        order = db.query(VayneOrder).filter(
            VayneOrder.vayne_order_id == vayne_order_id
        ).first()
        
        if not order:
            print(f"❌ Order with vayne_order_id {vayne_order_id} not found in database")
            return
        
        print(f"✅ Found order: {order.id}")
        print(f"   Status: {order.status}")
        print(f"   CSV file path: {order.csv_file_path or 'Not set'}")
        
        # Check if CSV already exists
        if order.csv_file_path:
            print(f"⚠️ CSV already stored at: {order.csv_file_path}")
            response = input("Do you want to re-export? (y/n): ")
            if response.lower() != 'y':
                return
        
        # Initialize Vayne client
        vayne_client = VayneClient()
        
        # Export CSV from Vayne
        print(f"\n📥 Exporting CSV from Vayne for order {vayne_order_id}...")
        try:
            csv_data = await vayne_client.export_order(vayne_order_id, order.export_format)
            print(f"✅ CSV exported successfully ({len(csv_data)} bytes)")
        except Exception as e:
            print(f"❌ Failed to export from Vayne: {e}")
            return
        
        # Initialize S3 client for R2
        s3_client = boto3.client(
            's3',
            endpoint_url=settings.CLOUDFLARE_R2_ENDPOINT_URL,
            aws_access_key_id=settings.CLOUDFLARE_R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
            region_name='auto'
        )
        
        # Store CSV in R2
        csv_file_path = f"vayne-orders/{order.id}/export.csv"
        print(f"\n📤 Storing CSV in R2: {csv_file_path}...")
        try:
            s3_client.put_object(
                Bucket=settings.CLOUDFLARE_R2_BUCKET_NAME,
                Key=csv_file_path,
                Body=csv_data,
                ContentType="text/csv"
            )
            print(f"✅ CSV stored in R2 successfully")
        except Exception as e:
            print(f"❌ Failed to store in R2: {e}")
            return
        
        # Update order in database
        order.csv_file_path = csv_file_path
        order.status = "completed"
        if not order.completed_at:
            order.completed_at = datetime.utcnow()
        db.commit()
        
        print(f"\n✅ Order updated in database:")
        print(f"   CSV file path: {csv_file_path}")
        print(f"   Status: completed")
        print(f"   Completed at: {order.completed_at}")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()
        await vayne_client.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python export_vayne_order_manual.py <vayne_order_id>")
        sys.exit(1)
    
    vayne_order_id = sys.argv[1]
    asyncio.run(export_and_store_order(vayne_order_id))

