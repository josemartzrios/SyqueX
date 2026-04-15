"""
Tests for GET /api/v1/health endpoint.
Uses a minimal FastAPI app (no DB startup) to test the route in isolation.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from starlette.testclient import TestClient
from fastapi import FastAPI
from api.routes import router

# Minimal app — no startup events, no DB connection needed
_test_app = FastAPI()
_test_app.include_router(router, prefix="/api/v1")
client = TestClient(_test_app)


def test_health_returns_200():
    response = client.get("/api/v1/health")
    assert response.status_code == 200


def test_health_returns_ok_body():
    response = client.get("/api/v1/health")
    assert response.json() == {"status": "ok"}
