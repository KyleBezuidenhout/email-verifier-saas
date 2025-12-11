#!/usr/bin/env python3
"""Check order in database"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Try to load from .env if it exists
from dotenv import load_dotenv
load_dotenv()

import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    print("❌ DATABASE_URL not found in environment")
    sys.exit(1)

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor(cursor_factory=RealDictCursor)

# Get latest orders
cur.execute("""
    SELECT id, vayne_order_id, status, sales_nav_url, created_at, csv_file_path
    FROM vayne_orders 
    ORDER BY created_at DESC 
    LIMIT 5
""")

orders = cur.fetchall()
print(f"📋 Found {len(orders)} recent orders:\n")
for order in orders:
    print(f"Order ID: {order['id']}")
    print(f"  Vayne Order ID: {order['vayne_order_id'] or 'NOT SET'}")
    print(f"  Status: {order['status']}")
    print(f"  CSV Path: {order['csv_file_path'] or 'NOT SET'}")
    print(f"  Created: {order['created_at']}")
    print()

cur.close()
conn.close()

