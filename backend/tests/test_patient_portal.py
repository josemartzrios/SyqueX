import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone
from cryptography.fernet import Fernet


@pytest.fixture(autouse=True)
def set_encryption_key(monkeypatch):
    import config as _config
    monkeypatch.setattr(_config.settings, "ENCRYPTION_KEY", Fernet.generate_key().decode())


@pytest.mark.asyncio
async def test_patient_portal_get_summaries():
    from main import app
    from database import PatientSummary, get_db
    from crypto import encrypt_if_set
    from api.patient_portal import get_current_patient

    patient_id = str(uuid.uuid4())

    summary1 = MagicMock(spec=PatientSummary)
    summary1.id = uuid.uuid4()
    summary1.session_id = uuid.uuid4()
    summary1.patient_id = uuid.UUID(patient_id)
    summary1.sent_at = datetime.now(timezone.utc)
    summary1.viewed_at = None
    summary1.next_session_date = None
    summary1.topics_worked = encrypt_if_set("Test topic 1")

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [summary1]
    mock_db.execute.return_value = mock_result

    async def override_get_current_patient():
        return patient_id

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_current_patient] = override_get_current_patient
    app.dependency_overrides[get_db] = override_get_db

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/api/v1/portal/summaries")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["id"] == str(summary1.id)
        assert data[0]["topics_worked"] == "Test topic 1"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_patient_portal_get_summary_detail():
    from main import app
    from database import PatientSummary, get_db
    from crypto import encrypt_if_set
    from api.patient_portal import get_current_patient

    patient_id = str(uuid.uuid4())

    summary = MagicMock(spec=PatientSummary)
    summary.id = uuid.uuid4()
    summary.session_id = uuid.uuid4()
    summary.patient_id = uuid.UUID(patient_id)
    summary.sent_at = datetime.now(timezone.utc)
    summary.viewed_at = None
    summary.next_session_date = None
    summary.topics_worked = encrypt_if_set("Detailed topics")
    summary.homework = encrypt_if_set("Do this homework")

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = summary
    mock_db.execute.return_value = mock_result

    async def override_get_current_patient():
        return patient_id

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_current_patient] = override_get_current_patient
    app.dependency_overrides[get_db] = override_get_db

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get(f"/api/v1/portal/summaries/{summary.id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(summary.id)
        assert data["topics_worked"] == "Detailed topics"
        assert data["homework"] == "Do this homework"
    finally:
        app.dependency_overrides.clear()
