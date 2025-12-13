#!/bin/bash
# Script to export Vayne order - run this on Railway backend service
# Usage: ./export_vayne_railway.sh <vayne_order_id>

VAYNE_ORDER_ID=$1
VAYNE_API_KEY="323df96322bd118f6d34009fc2d7672a8e0224fe75c9f1bb79022f0210246d68"

if [ -z "$VAYNE_ORDER_ID" ]; then
    echo "Usage: ./export_vayne_railway.sh <vayne_order_id>"
    exit 1
fi

echo "📥 Exporting Vayne order $VAYNE_ORDER_ID..."

# Export CSV
RESPONSE=$(curl -s -X POST "https://www.vayne.io/api/orders/$VAYNE_ORDER_ID/export" \
  -H "Authorization: Bearer $VAYNE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"export_format":"simple"}')

echo "Response: $RESPONSE"

# Check if we got a file URL
FILE_URL=$(echo $RESPONSE | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('order', {}).get('exports', {}).get('simple', {}).get('file_url', ''))" 2>/dev/null)

if [ -z "$FILE_URL" ]; then
    echo "❌ No file URL in response"
    exit 1
fi

echo "✅ File URL: $FILE_URL"
echo "📥 Downloading CSV..."
curl -s "$FILE_URL" -o "vayne_export_${VAYNE_ORDER_ID}.csv"

if [ $? -eq 0 ]; then
    echo "✅ CSV downloaded to: vayne_export_${VAYNE_ORDER_ID}.csv"
else
    echo "❌ Failed to download CSV"
    exit 1
fi

