"""Tests for PATCH /patients/{id}."""
import uuid
from datetime import date
from unittest.mock import MagicMock
import pytest
from httpx import AsyncClient, ASGITransport


def _make_patient(psy_id, pid, **overrides):
    p = MagicMock()
    p.id = pid
    p.psychologist_id = psy_id
    p.name = "Orig"
    p.date_of_birth = date(1990, 1, 1)
    p.diagnosis_tags = []
    p.risk_level = "low"
    p.marital_status = None
    p.occupation = None
    p.address = None
    p.emergency_contact = None
    p.reason_for_consultation = "Motivo orig"
    p.medical_history = None
    p.psychological_history = None
    p.gender_identity = None
    p.phone = None
    p.deleted_at = None
    for k, v in overrides.items():
        setattr(p, k, v)
    return p


@pytest.mark.asyncio
async def test_patch_single_field(authed_app, mock_db, fake_psychologist):
    pid = uuid.uuid4()
    patient = _make_patient(fake_psychologist.id, pid)
    result = MagicMock()
    result.scalar_one_or_none.return_value = patient
    mock_db.execute.return_value = result

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/patients/{pid}",
            json={"occupation": "Nueva ocupación"},
        )

    assert res.status_code == 200
    # Campo modificado
    assert patient.occupation == "Nueva ocupación"
    # Campos no modificados intactos
    assert patient.name == "Orig"
    assert patient.reason_for_consultation == "Motivo orig"


@pytest.mark.asyncio
async def test_patch_clears_optional_field_with_null(authed_app, mock_db, fake_psychologist):
    pid = uuid.uuid4()
    patient = _make_patient(
        fake_psychologist.id, pid,
        occupation="Antigua",
        emergency_contact={"name": "X", "relationship": "Y", "phone": "1234567"},
    )
    result = MagicMock()
    result.scalar_one_or_none.return_value = patient
    mock_db.execute.return_value = result

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/patients/{pid}",
            json={"occupation": None, "emergency_contact": None},
        )

    assert res.status_code == 200
    assert patient.occupation is None
    assert patient.emergency_contact is None


@pytest.mark.asyncio
async def test_patch_cannot_clear_required_field(authed_app, mock_db, fake_psychologist):
    pid = uuid.uuid4()
    patient = _make_patient(fake_psychologist.id, pid)
    result = MagicMock()
    result.scalar_one_or_none.return_value = patient
    mock_db.execute.return_value = result

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        # String vacío -> 422 por min_length=1
        res = await client.patch(
            f"/api/v1/patients/{pid}",
            json={"name": ""},
        )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_patch_other_psychologist_returns_404(authed_app, mock_db):
    other_psy = uuid.UUID("22222222-2222-2222-2222-222222222222")
    pid = uuid.uuid4()
    patient = _make_patient(other_psy, pid)
    result = MagicMock()
    result.scalar_one_or_none.return_value = patient
    mock_db.execute.return_value = result

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/patients/{pid}",
            json={"occupation": "X"},
        )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_audit_log_has_fields_changed_only(authed_app, mock_db, fake_psychologist):
    pid = uuid.uuid4()
    patient = _make_patient(fake_psychologist.id, pid)
    added = []
    result = MagicMock()
    result.scalar_one_or_none.return_value = patient
    mock_db.execute.return_value = result
    mock_db.add.side_effect = lambda o: added.append(o)

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        await client.patch(
            f"/api/v1/patients/{pid}",
            json={
                "occupation": "Nueva",
                "address": "Calle Secreta 42",  # valor sensible -- no debe aparecer en audit
            },
        )

    audits = [o for o in added if type(o).__name__ == "AuditLog"]
    assert len(audits) == 1
    a = audits[0]
    assert a.action == "UPDATE"
    import json
    extra_str = json.dumps(a.extra)
    assert "Calle Secreta" not in extra_str
    assert "Nueva" not in extra_str
    assert set(a.extra["fields_changed"]) == {"occupation", "address"}


@pytest.mark.asyncio
async def test_patch_gender_identity(authed_app, mock_db, fake_psychologist):
    """PATCH gender_identity actualiza el campo y lo retorna descifrado."""
    pid = uuid.uuid4()
    patient = _make_patient(fake_psychologist.id, pid, gender_identity="hombre")
    result = MagicMock()
    result.scalar_one_or_none.return_value = patient
    mock_db.execute.return_value = result

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/patients/{pid}",
            json={"gender_identity": "no_binario"},
        )

    assert res.status_code == 200
    assert patient.gender_identity == "no_binario"
    assert res.json()["gender_identity"] == "no_binario"


@pytest.mark.asyncio
async def test_patch_phone(authed_app, mock_db, fake_psychologist):
    """PATCH phone actualiza el campo (validando longitud) y lo retorna descifrado."""
    pid = uuid.uuid4()
    patient = _make_patient(fake_psychologist.id, pid, phone="5512345678")
    result = MagicMock()
    result.scalar_one_or_none.return_value = patient
    mock_db.execute.return_value = result

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.patch(
            f"/api/v1/patients/{pid}",
            json={"phone": "5587654321"},
        )

    assert res.status_code == 200
    assert patient.phone == "5587654321"
    assert res.json()["phone"] == "5587654321"
