FROM python:3.12-slim

WORKDIR /app

# System deps for sentence-transformers (torch CPU-only) + lxml
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl libxml2-dev libxslt-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the multilingual embedding model at build time (offline-safe)
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('intfloat/multilingual-e5-small')"

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
