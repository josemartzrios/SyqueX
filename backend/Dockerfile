FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for building python packages if needed
RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# LOW-02: Run as non-root user to limit blast radius of potential RCE
RUN adduser --disabled-password --no-create-home appuser
USER appuser

ENV PORT=8000
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
