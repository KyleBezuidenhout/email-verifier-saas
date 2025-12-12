FROM python:3.11-slim

WORKDIR /app

# Copy backend requirements and install
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend app directory (needed for imports)
COPY backend/app ./app

# Copy worker script
COPY workers/vayne_worker.py .

# Run the worker
CMD ["python3", "vayne_worker.py"]

