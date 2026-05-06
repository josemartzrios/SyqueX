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


# ── Forgot Password Tests ──────────────────────────────────────────────────

FORGOT_URL = "/api/v1/auth/patient/forgot-password"


@pytest.fixture
def patient_user_active():
    pu = MagicMock()
    pu.id = uuid.uuid4()
    pu.patient_id = uuid.uuid4()
    pu.email = "patient@example.com"
    pu.is_active = True
    return pu


@pytest.mark.asyncio
async def test_forgot_password_existing_email(patient_user_active):
    """200 con mensaje genérico; token añadido a DB; email enviado."""
    from main import app
    from database import get_db

    patient_mock = MagicMock()
    patient_mock.name = "Ana García"

    result_pu = MagicMock()
    result_pu.scalar_one_or_none.return_value = patient_user_active
    result_patient = MagicMock()
    result_patient.scalar_one_or_none.return_value = patient_mock

    mock_db = AsyncMock()
    mock_db.execute.side_effect = [result_pu, result_patient]

    async def override_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_db
    with patch('api.patient_auth.send_patient_reset_email', new_callable=AsyncMock) as mock_email:
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post(FORGOT_URL, json={"email": "patient@example.com"})
            assert res.status_code == 200
            data = res.json()
            assert "message" in data
            assert "Si esa dirección" in data["message"]
            mock_db.add.assert_called_once()
            mock_email.assert_called_once()
        finally:
            app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_forgot_password_nonexistent_email():
    """Email inexistente → 200 mismo mensaje (sin user enumeration)."""
    from main import app
    from database import get_db

    result_none = MagicMock()
    result_none.scalar_one_or_none.return_value = None

    mock_db = AsyncMock()
    mock_db.execute.return_value = result_none

    async def override_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_db
    with patch('api.patient_auth.send_patient_reset_email', new_callable=AsyncMock) as mock_email:
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post(FORGOT_URL, json={"email": "ghost@example.com"})
            assert res.status_code == 200
            data = res.json()
            assert "Si esa dirección" in data["message"]
            mock_db.add.assert_not_called()
            mock_email.assert_not_called()
        finally:
            app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_forgot_password_per_email_rate_limit():
    """Segunda solicitud para el mismo email en 10 min → 429."""
    from main import app
    from database import get_db
    from datetime import datetime, timezone
    import api.patient_auth as patient_auth_module

    patient_auth_module._forgot_pw_email_attempts["ratelimited@example.com"] = [
        datetime.now(timezone.utc)
    ]

    mock_db = AsyncMock()

    async def override_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(FORGOT_URL, json={"email": "ratelimited@example.com"})
        assert res.status_code == 429
    finally:
        app.dependency_overrides.clear()
        patient_auth_module._forgot_pw_email_attempts.pop("ratelimited@example.com", None)
