"""
Tests for forgot-password and reset-password endpoints.
"""
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock, patch

from main import app
from database import get_db

FORGOT_PASSWORD_URL = "/api/v1/auth/forgot-password"
RESET_PASSWORD_URL = "/api/v1/auth/reset-password"


def _make_empty_db():
    """Returns an override for get_db that returns empty results (no records found)."""
    async def override_get_db():
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result
        mock_session.get.return_value = None
        yield mock_session
    return override_get_db


@pytest.mark.asyncio
async def test_forgot_password_same_response_for_nonexistent_email():
    """Mismo response para email que no existe (evita enumeración)."""
    app.dependency_overrides[get_db] = _make_empty_db()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(FORGOT_PASSWORD_URL, json={"email": "noexiste@test.com"})
        assert res.status_code == 200
        assert "enlace" in res.json()["message"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_reset_password_invalid_token():
    """Token que no existe en DB → 400."""
    app.dependency_overrides[get_db] = _make_empty_db()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                RESET_PASSWORD_URL,
                json={"token": "fake_token", "new_password": "NewPass1"},
            )
        assert res.status_code == 400
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_reset_password_weak_password():
    """Contraseña débil → 422 (Pydantic validation)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            RESET_PASSWORD_URL,
            json={"token": "any_token", "new_password": "weak"},
        )
    assert res.status_code == 422
