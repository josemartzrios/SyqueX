import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
import uuid

ACCEPT_URL = "/api/v1/auth/patient/accept-invite"
LOGIN_URL = "/api/v1/auth/patient/login"

VALID_TOKEN = "valid-invite-token-abc123"
VALID_PASSWORD = "Password1"


@pytest.fixture
def patient_user_pending():
    from datetime import datetime, timezone, timedelta
    pu = MagicMock()
    pu.id = uuid.uuid4()
    pu.patient_id = uuid.uuid4()
    pu.psychologist_id = uuid.uuid4()
    pu.email = "ana@example.com"
    pu.password_hash = None
    pu.invite_token = VALID_TOKEN
    pu.invite_token_expires_at = datetime.now(timezone.utc) + timedelta(days=1)
    pu.is_active = False
    pu.accepted_at = None
    return pu


@pytest.mark.asyncio
async def test_accept_invite_success(patient_user_pending):
    from main import app
    from database import get_db

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = patient_user_pending
    mock_db.execute.return_value = mock_result

    async def override_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(ACCEPT_URL, json={"token": VALID_TOKEN, "password": VALID_PASSWORD})
        assert res.status_code == 200
        assert "access_token" in res.json()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_accept_invite_invalid_token():
    from main import app
    from database import get_db

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    async def override_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(ACCEPT_URL, json={"token": "bad-token", "password": VALID_PASSWORD})
        assert res.status_code == 400
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_patient_login_success():
    from main import app
    from database import get_db
    from api.patient_auth import hash_password

    pu = MagicMock()
    pu.id = uuid.uuid4()
    pu.patient_id = uuid.uuid4()
    pu.psychologist_id = uuid.uuid4()
    pu.email = "ana@example.com"
    pu.password_hash = hash_password(VALID_PASSWORD)
    pu.is_active = True

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = pu
    mock_db.execute.return_value = mock_result

    async def override_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(LOGIN_URL, json={"email": "ana@example.com", "password": VALID_PASSWORD})
        assert res.status_code == 200
        data = res.json()
        assert data["role"] == "patient"
        assert "access_token" in data
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_patient_login_wrong_password():
    from main import app
    from database import get_db
    from api.patient_auth import hash_password

    pu = MagicMock()
    pu.password_hash = hash_password(VALID_PASSWORD)
    pu.is_active = True

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = pu
    mock_db.execute.return_value = mock_result

    async def override_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(LOGIN_URL, json={"email": "ana@example.com", "password": "Wrongpass1"})
        assert res.status_code == 401
    finally:
        app.dependency_overrides.clear()
