import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, patch, MagicMock
from main import app

REGISTER_URL = "/api/v1/auth/register"

VALID_PAYLOAD = {
    "name": "Ana García",
    "email": "ana@test.com",
    "password": "Password1",
    "cedula_profesional": "12345678",
    "accepted_privacy": True,
    "accepted_terms": True,
    "privacy_version": "1.0",
    "terms_version": "1.0"
}

from database import get_db

@pytest.mark.asyncio
async def test_register_success():
    with patch("api.auth.stripe") as mock_stripe:
        mock_stripe.customers.create.return_value = MagicMock(id="cus_test123")
        # setup mock db session
        
        async def override_get_db():
            mock_session = AsyncMock()
            mock_scalar = MagicMock()
            mock_scalar.scalar_one_or_none.return_value = None
            mock_session.execute.return_value = mock_scalar
            yield mock_session
        
        app.dependency_overrides[get_db] = override_get_db
        
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post(REGISTER_URL, json=VALID_PAYLOAD)
            assert res.status_code == 200
            assert "access_token" in res.json()
        finally:
            app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_register_rejects_weak_password():
    payload = {**VALID_PAYLOAD, "password": "weak"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(REGISTER_URL, json=payload)
    assert res.status_code == 422

@pytest.mark.asyncio
async def test_register_requires_privacy_acceptance():
    payload = {**VALID_PAYLOAD, "accepted_privacy": False}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(REGISTER_URL, json=payload)
    assert res.status_code == 422

@pytest.mark.asyncio
async def test_register_password_needs_uppercase():
    payload = {**VALID_PAYLOAD, "password": "password1"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(REGISTER_URL, json=payload)
    assert res.status_code == 422

@pytest.mark.asyncio
async def test_register_password_needs_number():
    payload = {**VALID_PAYLOAD, "password": "PasswordOnly"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(REGISTER_URL, json=payload)
    assert res.status_code == 422
