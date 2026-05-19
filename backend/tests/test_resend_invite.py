# backend/tests/test_resend_invite.py
"""Tests for POST /patients/{patient_id}/portal/resend-invite."""
import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

RESEND_URL = "/api/v1/patients/{patient_id}/portal/resend-invite"


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
async def test_resend_no_patient_user_returns_404(authed_app, mock_db, fake_psychologist):
    """No PatientUser exists for patient → 404."""
    patient_id = uuid.uuid4()
    patient = _make_patient(patient_id, fake_psychologist.id)
    mock_db.get.return_value = patient
    mock_db.execute.side_effect = [
        _make_execute_result(None),  # set_config (get_db_with_user)
        _make_execute_result(None),  # select PatientUser → not found
    ]
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(RESEND_URL.format(patient_id=patient_id))
    assert res.status_code == 404
    assert "invitación previa" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_resend_active_patient_returns_409(authed_app, mock_db, fake_psychologist):
    """Patient already activated their account → 409."""
    patient_id = uuid.uuid4()
    patient = _make_patient(patient_id, fake_psychologist.id)
    mock_db.get.return_value = patient
    active_user = MagicMock()
    active_user.is_active = True
    mock_db.execute.side_effect = [
        _make_execute_result(None),          # set_config
        _make_execute_result(active_user),   # select PatientUser → active
    ]
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(RESEND_URL.format(patient_id=patient_id))
    assert res.status_code == 409
    assert "activó" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_resend_success_returns_200_and_updates_token(authed_app, mock_db, fake_psychologist):
    """Pending PatientUser → 200, token fields updated, email sent."""
    patient_id = uuid.uuid4()
    patient = _make_patient(patient_id, fake_psychologist.id, email="patient@test.com")
    mock_db.get.return_value = patient

    pending_user = MagicMock()
    pending_user.is_active = False

    mock_db.execute.side_effect = [
        _make_execute_result(None),           # set_config
        _make_execute_result(pending_user),   # select PatientUser → pending
    ]

    with patch("services.email.send_patient_invite", new_callable=AsyncMock) as mock_send:
        async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
            res = await client.post(RESEND_URL.format(patient_id=patient_id))

    assert res.status_code == 200
    assert "reenviada" in res.json()["message"].lower()
    assert mock_db.commit.await_count == 1
    mock_send.assert_awaited_once()
    # Token fields were assigned (not None)
    assert pending_user.invite_token is not None
    assert pending_user.invite_token_expires_at is not None
    assert pending_user.invited_at is not None


@pytest.mark.asyncio
async def test_resend_wrong_psychologist_returns_403(authed_app, mock_db, fake_psychologist):
    """Patient belongs to a different psychologist → 403."""
    patient_id = uuid.uuid4()
    other_psych_id = uuid.uuid4()
    patient = _make_patient(patient_id, other_psych_id)  # owned by someone else
    mock_db.get.return_value = patient
    mock_db.execute.side_effect = [
        _make_execute_result(None),  # set_config
    ]
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        res = await client.post(RESEND_URL.format(patient_id=patient_id))
    assert res.status_code == 403
