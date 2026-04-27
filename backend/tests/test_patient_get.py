"""Tests for GET /patients/{id}."""
import uuid
from datetime import date
from unittest.mock import MagicMock
import pytest
from httpx import AsyncClient, ASGITransport


def _make_patient(psy_id, pid):
    p = MagicMock()
    p.id = pid
    p.psychologist_id = psy_id
    p.name = "Test"
    p.date_of_birth = date(1990, 1, 1)
    p.diagnosis_tags = []
    p.risk_level = "low"
    p.marital_status = "soltero"
    p.occupation = "Doc"
    p.address = "Addr"
    p.emergency_contact = {"name": "X", "relationship": "Y", "phone": "1234567"}
    p.reason_for_consultation = "Motivo"
    p.medical_history = None
    p.psychological_history = None
    p.gender_identity = None
    p.phone = None
    p.deleted_at = None
    return p


@pytest.mark.asyncio
async def test_returns_full_patient(authed_app, mock_db, fake_psychologist):
    pid = uuid.uuid4()
    patient = _make_patient(fake_psychologist.id, pid)
    result = MagicMock()
    result.scalar_one_or_none.return_value = patient
    mock_db.execute.return_value = result

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.get(f"/api/v1/patients/{pid}")

    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "Test"
    assert body["marital_status"] == "soltero"
    assert body["emergency_contact"] == {
        "name": "X", "relationship": "Y", "phone": "1234567",
    }


@pytest.mark.asyncio
async def test_returns_404_for_other_psychologist(authed_app, mock_db):
    other_psy = uuid.UUID("11111111-1111-1111-1111-111111111111")
    pid = uuid.uuid4()
    patient = _make_patient(other_psy, pid)  # dueño distinto
    result = MagicMock()
    result.scalar_one_or_none.return_value = patient
    mock_db.execute.return_value = result

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.get(f"/api/v1/patients/{pid}")

    assert res.status_code == 404


@pytest.mark.asyncio
async def test_returns_404_when_not_found(authed_app, mock_db):
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = result

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.get(f"/api/v1/patients/{uuid.uuid4()}")

    assert res.status_code == 404


@pytest.mark.asyncio
async def test_returns_400_for_invalid_uuid(authed_app):
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.get("/api/v1/patients/not-a-uuid")
    assert res.status_code == 400
