FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    libzbar0 \
    libgl1 \
    libglib2.0-0 \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY qr.py .

ENV POPPLER_PATH=/usr/bin
ENV QR_SCAN_DPI=200
ENV QR_MAX_PAGES=1
ENV PYTHONUNBUFFERED=1

ENTRYPOINT ["python", "/app/qr.py"]
