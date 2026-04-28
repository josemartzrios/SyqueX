"""Tests for POST /patients — intake creation."""
import uuid
from datetime import date
from unittest.mock import MagicMock
import pytest
from httpx import AsyncClient, ASGITransport


@pytest.mark.asyncio
async def test_full_payload_returns_201(authed_app, mock_db):
    """Payload con los 10 campos -> 201, todos persisten."""
    pid = uuid.uuid4()
    captured = {}

    def capture_add(obj):
        # Capturar el Patient que se inserta (el primero; el segundo es PatientProfile)
        if type(obj).__name__ == "Patient":
            obj.id = pid
            captured["patient"] = obj

    mock_db.add.side_effect = capture_add

    async def refresh(obj):
        obj.id = pid
    mock_db.refresh.side_effect = refresh

    full_payload = {
        "name": "María López",
        "date_of_birth": "1985-03-15",
        "reason_for_consultation": "Ansiedad laboral",
        "phone": "5512345678",
        "marital_status": "casado",
        "occupation": "Ingeniera",
        "address": "Av. Reforma 123, CDMX",
        "emergency_contact": {
            "name": "Pedro López",
            "relationship": "esposo",
            "phone": "5512345678",
        },
        "medical_history": "Hipertensión controlada",
        "psychological_history": "TCC previo 2022",
    }

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post("/api/v1/patients", json=full_payload)

    assert res.status_code == 201
    p = captured["patient"]
    assert p.name == "María López"
    assert p.date_of_birth == date(1985, 3, 15)
    assert p.reason_for_consultation == "Ansiedad laboral"
    assert p.marital_status == "casado"
    assert p.emergency_contact == {
        "name": "Pedro López", "relationship": "esposo", "phone": "5512345678",
    }


@pytest.mark.asyncio
async def test_minimum_payload_returns_201(authed_app, mock_db):
    """Los 4 campos obligatorios (name, dob, reason, phone) -> 201."""
    pid = uuid.uuid4()

    def capture_add(obj):
        if type(obj).__name__ == "Patient":
            obj.id = pid
    mock_db.add.side_effect = capture_add

    async def refresh(obj):
        obj.id = pid
    mock_db.refresh.side_effect = refresh

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "Ana",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Depresión",
                "phone": "5512345678",
            },
        )

    assert res.status_code == 201


@pytest.mark.asyncio
async def test_missing_date_of_birth_returns_422(authed_app):
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={"name": "X", "reason_for_consultation": "Y"},
        )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_missing_reason_returns_422(authed_app):
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={"name": "X", "date_of_birth": "1990-01-01"},
        )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_future_dob_returns_422(authed_app):
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "X",
                "date_of_birth": "2099-01-01",
                "reason_for_consultation": "Y",
            },
        )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_too_old_dob_returns_422(authed_app):
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "X",
                "date_of_birth": "1800-01-01",
                "reason_for_consultation": "Y",
            },
        )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_invalid_marital_status_returns_422(authed_app):
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "X",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Y",
                "marital_status": "whatever",
            },
        )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_incomplete_emergency_contact_returns_422(authed_app):
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "X",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Y",
                "emergency_contact": {"name": "Solo nombre"},
            },
        )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_audit_log_written_without_clinical_values(authed_app, mock_db):
    pid = uuid.uuid4()
    added = []

    def capture_add(obj):
        added.append(obj)
        if type(obj).__name__ == "Patient":
            obj.id = pid
    mock_db.add.side_effect = capture_add

    async def refresh(obj):
        obj.id = pid
    mock_db.refresh.side_effect = refresh

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        await client.post(
            "/api/v1/patients",
            json={
                "name": "Audit Test",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Motivo",
                "phone": "5512345678",
                "medical_history": "DATO CLINICO PRIVADO",
            },
        )

    audit_entries = [o for o in added if type(o).__name__ == "AuditLog"]
    assert len(audit_entries) == 1
    a = audit_entries[0]
    assert a.action == "CREATE"
    assert a.entity == "patient"
    # Solo nombres, nunca valores
    import json
    extra_str = json.dumps(a.extra) if a.extra else ""
    assert "DATO CLINICO PRIVADO" not in extra_str
    assert "Motivo" not in extra_str
    assert "fields_set" in a.extra
    assert "medical_history" in a.extra["fields_set"]


@pytest.mark.asyncio
async def test_gender_identity_valid_value(authed_app, mock_db):
    """gender_identity='mujer' persists and is returned decrypted in response."""
    pid = uuid.uuid4()
    captured = {}

    def capture_add(obj):
        if type(obj).__name__ == "Patient":
            obj.id = pid
            captured["patient"] = obj

    mock_db.add.side_effect = capture_add

    async def refresh(obj):
        obj.id = pid
    mock_db.refresh.side_effect = refresh

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "Ana",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Ansiedad",
                "phone": "5512345678",
                "gender_identity": "mujer",
            },
        )

    assert res.status_code == 201
    assert res.json()["gender_identity"] == "mujer"


@pytest.mark.asyncio
async def test_gender_identity_invalid_value_returns_422(authed_app):
    """Valores fuera del Literal -> 422."""
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "Ana",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Ansiedad",
                "gender_identity": "masculino",
            },
        )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_gender_identity_omitted_returns_201(authed_app, mock_db):
    """gender_identity es opcional — omitirlo no impide la creación."""
    pid = uuid.uuid4()
    mock_db.add.side_effect = lambda obj: setattr(obj, "id", pid) if type(obj).__name__ == "Patient" else None

    async def refresh(obj):
        obj.id = pid
    mock_db.refresh.side_effect = refresh

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "Ana",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Ansiedad",
                "phone": "5512345678",
            },
        )
    assert res.status_code == 201
    assert res.json().get("gender_identity") is None


@pytest.mark.asyncio
async def test_phone_valid_value(authed_app, mock_db):
    """phone de 10 dígitos persiste y se retorna descifrado en la respuesta."""
    pid = uuid.uuid4()
    captured = {}

    def capture_add(obj):
        if type(obj).__name__ == "Patient":
            obj.id = pid
            captured["patient"] = obj

    mock_db.add.side_effect = capture_add

    async def refresh(obj):
        obj.id = pid
    mock_db.refresh.side_effect = refresh

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "Ana",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Ansiedad",
                "phone": "5512345678",
            },
        )

    assert res.status_code == 201
    assert res.json()["phone"] == "5512345678"


@pytest.mark.asyncio
async def test_phone_too_short_returns_422(authed_app):
    """phone con menos de 10 caracteres -> 422."""
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "Ana",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Ansiedad",
                "phone": "123456",
            },
        )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_phone_omitted_returns_422(authed_app):
    """phone es obligatorio — omitirlo retorna 422."""
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/patients",
            json={
                "name": "Ana",
                "date_of_birth": "1990-01-01",
                "reason_for_consultation": "Ansiedad",
            },
        )
    assert res.status_code == 422
