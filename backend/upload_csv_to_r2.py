#!/usr/bin/env python3
"""
Upload CSV to R2 and update database
Run this on Railway backend service
Usage: python3 upload_csv_to_r2.py <vayne_order_id> <csv_file_path>
"""
import os
import sys
import asyncio
import boto3
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.vayne_order import VayneOrder

def upload_and_update(vayne_order_id: str, csv_file_path: str):
    """Upload CSV to R2 and update database."""
    db = SessionLocal()
    
    try:
        # Find order by vayne_order_id
        order = db.query(VayneOrder).filter(
            VayneOrder.vayne_order_id == vayne_order_id
        ).first()
        
        if not order:
            print(f"❌ Order with vayne_order_id {vayne_order_id} not found")
            return
        
        print(f"✅ Found order: {order.id}")
        
        # Read CSV file
        if not os.path.exists(csv_file_path):
            print(f"❌ CSV file not found: {csv_file_path}")
            return
        
        with open(csv_file_path, 'rb') as f:
            csv_data = f.read()
        
        print(f"✅ Read CSV file ({len(csv_data)} bytes)")
        
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
        
        print(f"✅ Order updated:")
        print(f"   CSV path: {r2_path}")
        print(f"   Status: completed")
        print(f"   Order ID: {order.id}")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 upload_csv_to_r2.py <vayne_order_id> <csv_file_path>")
        sys.exit(1)
    
    vayne_order_id = sys.argv[1]
    csv_file_path = sys.argv[2]
    upload_and_update(vayne_order_id, csv_file_path)

