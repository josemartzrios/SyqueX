"""Tests for POST /patients/{patient_id}/portal/invite."""
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport


INVITE_URL = "/api/v1/patients/{patient_id}/portal/invite"


def _make_patient(patient_id, psychologist_id, email="test@example.com"):
    p = MagicMock()
    p.id = patient_id
    p.psychologist_id = psychologist_id
    p.email = email
    p.name = "Ana García"
    p.deleted_at = None
    return p


def _make_execute_result(scalar_value=None):
    r = MagicMock()
    r.scalar_one_or_none.return_value = scalar_value
    return r


@pytest.mark.asyncio
async def test_invite_duplicate_email_returns_409(authed_app, mock_db, fake_psychologist):
    """Invitar a un paciente con un email ya registrado en otro PatientUser → 409 controlado, sin 500."""
    patient_id = uuid.uuid4()
    email = "already@used.com"
    patient = _make_patient(patient_id, fake_psychologist.id, email=email)

    mock_db.get.return_value = patient

    existing_patient_user = MagicMock()
    existing_patient_user.is_active = True

    # execute() se llama 3 veces:
    # 1. set_config (get_db_with_user) — valor irrelevante
    # 2. select PatientUser by patient_id → None (no existe para este paciente)
    # 3. select PatientUser by email → existing_patient_user (email ya tomado)
    mock_db.execute.side_effect = [
        _make_execute_result(None),      # set_config call
        _make_execute_result(None),      # by patient_id
        _make_execute_result(existing_patient_user),  # by email
    ]

    # 409 se devuelve antes de llegar al envío de email, no necesita patch
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(INVITE_URL.format(patient_id=patient_id))

    assert res.status_code == 409
    assert "correo" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_invite_already_invited_returns_409(authed_app, mock_db, fake_psychologist):
    """Paciente ya invitado (PatientUser existente, is_active=False) → 409."""
    patient_id = uuid.uuid4()
    patient = _make_patient(patient_id, fake_psychologist.id)

    mock_db.get.return_value = patient

    pending_user = MagicMock()
    pending_user.is_active = False

    mock_db.execute.side_effect = [
        _make_execute_result(None),           # set_config
        _make_execute_result(pending_user),   # by patient_id → ya invitado
    ]

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(INVITE_URL.format(patient_id=patient_id))

    assert res.status_code == 409
    assert "invitación" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_invite_active_patient_returns_409(authed_app, mock_db, fake_psychologist):
    """Paciente con cuenta activa → 409."""
    patient_id = uuid.uuid4()
    patient = _make_patient(patient_id, fake_psychologist.id)

    mock_db.get.return_value = patient

    active_user = MagicMock()
    active_user.is_active = True

    mock_db.execute.side_effect = [
        _make_execute_result(None),          # set_config
        _make_execute_result(active_user),   # by patient_id → ya activo
    ]

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(INVITE_URL.format(patient_id=patient_id))

    assert res.status_code == 409
    assert "activó" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_invite_no_email_returns_400(authed_app, mock_db, fake_psychologist):
    """Paciente sin email → 400."""
    patient_id = uuid.uuid4()
    patient = _make_patient(patient_id, fake_psychologist.id, email=None)

    mock_db.get.return_value = patient

    mock_db.execute.side_effect = [
        _make_execute_result(None),  # set_config
    ]

    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(INVITE_URL.format(patient_id=patient_id))

    assert res.status_code == 400
    assert "correo" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_invite_success_returns_200(authed_app, mock_db, fake_psychologist):
    """Invitación nueva y email único → 200 + mensaje."""
    patient_id = uuid.uuid4()
    patient = _make_patient(patient_id, fake_psychologist.id, email="new@patient.com")

    mock_db.get.return_value = patient

    mock_db.execute.side_effect = [
        _make_execute_result(None),  # set_config
        _make_execute_result(None),  # by patient_id → sin PatientUser
        _make_execute_result(None),  # by email → libre
    ]

    with patch("services.email.send_patient_invite", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
            res = await client.post(INVITE_URL.format(patient_id=patient_id))

    assert res.status_code == 200
    assert "Invitación enviada" in res.json()["message"]
