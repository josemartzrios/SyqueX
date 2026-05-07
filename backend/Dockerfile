FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# LOW-02: Run as non-root user to limit blast radius of potential RCE.
# --gecos "" keeps it silent; home directory IS created (no --no-create-home)
# so /home/appuser/.cache/huggingface is writable for the xet log and model cache.
RUN adduser --disabled-password --gecos "" appuser

# Pre-download the 1.31 GB embedding model at build time as appuser.
# Docker caches this layer: cold starts skip the runtime download entirely.
# Layer is only re-run when requirements.txt changes (new fastembed version).
USER appuser
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('intfloat/multilingual-e5-large')"
USER root

COPY . .
RUN chown -R appuser:appuser /app

USER appuser

ENV PORT=8000
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
