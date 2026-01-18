FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# System deps for Playwright / Chromium
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    ca-certificates \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libxcb1 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libxshmfence1 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers for Crawl4AI
RUN python -m playwright install --with-deps chromium

COPY . .

ENV PORT=8000

# Use PORT env var if set (Railway), otherwise default to 8000
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}

