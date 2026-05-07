import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport
import uuid
from datetime import datetime, timezone, timedelta

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


# ── Reset Password Tests ───────────────────────────────────────────────────

RESET_URL = "/api/v1/auth/patient/reset-password"
VALID_RAW_TOKEN = "valid-raw-token-abc123xyz"


@pytest.fixture
def reset_token_valid(patient_user_active):
    from datetime import datetime, timezone, timedelta
    import hashlib
    t = MagicMock()
    t.id = uuid.uuid4()
    t.patient_user_id = patient_user_active.id
    t.token_hash = hashlib.sha256(VALID_RAW_TOKEN.encode()).hexdigest()
    t.expires_at = datetime.now(timezone.utc) + timedelta(minutes=60)
    t.used_at = None
    t.failed_attempts = 0
    return t


@pytest.mark.asyncio
async def test_reset_password_valid_token(patient_user_active, reset_token_valid):
    """Token válido → 200 + JWT, password_hash actualizado, used_at seteado."""
    from main import app
    from database import get_db

    result_token = MagicMock()
    result_token.scalar_one_or_none.return_value = reset_token_valid
    result_user = MagicMock()
    result_user.scalar_one_or_none.return_value = patient_user_active

    mock_db = AsyncMock()
    mock_db.execute.side_effect = [result_token, result_user]

    async def override_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(RESET_URL, json={
                "token": VALID_RAW_TOKEN,
                "new_password": "NewPassword1"
            })
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert reset_token_valid.used_at is not None
        assert patient_user_active.password_hash is not None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_reset_password_expired_token(reset_token_valid):
    """Token expirado → 400, failed_attempts incrementado."""
    from main import app
    from database import get_db

    reset_token_valid.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)

    result_token = MagicMock()
    result_token.scalar_one_or_none.return_value = reset_token_valid

    mock_db = AsyncMock()
    mock_db.execute.return_value = result_token

    async def override_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(RESET_URL, json={
                "token": VALID_RAW_TOKEN,
                "new_password": "NewPassword1"
            })
        assert res.status_code == 400
        assert reset_token_valid.failed_attempts == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_reset_password_already_used(reset_token_valid):
    """Token ya usado → 400."""
    from main import app
    from database import get_db

    reset_token_valid.used_at = datetime.now(timezone.utc) - timedelta(minutes=5)

    result_token = MagicMock()
    result_token.scalar_one_or_none.return_value = reset_token_valid

    mock_db = AsyncMock()
    mock_db.execute.return_value = result_token

    async def override_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(RESET_URL, json={
                "token": VALID_RAW_TOKEN,
                "new_password": "NewPassword1"
            })
        assert res.status_code == 400
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_reset_password_max_failed_attempts(reset_token_valid):
    """Token con 3+ intentos fallidos → 400."""
    from main import app
    from database import get_db

    reset_token_valid.failed_attempts = 3

    result_token = MagicMock()
    result_token.scalar_one_or_none.return_value = reset_token_valid

    mock_db = AsyncMock()
    mock_db.execute.return_value = result_token

    async def override_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(RESET_URL, json={
                "token": VALID_RAW_TOKEN,
                "new_password": "NewPassword1"
            })
        assert res.status_code == 400
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_reset_password_invalid_token():
    """Token no encontrado → 400."""
    from main import app
    from database import get_db

    result_none = MagicMock()
    result_none.scalar_one_or_none.return_value = None

    mock_db = AsyncMock()
    mock_db.execute.return_value = result_none

    async def override_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(RESET_URL, json={
                "token": "wrong-token-xyz",
                "new_password": "NewPassword1"
            })
        assert res.status_code == 400
    finally:
        app.dependency_overrides.clear()
