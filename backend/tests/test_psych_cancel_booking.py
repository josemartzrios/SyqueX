import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import date, time, datetime, timezone
from httpx import AsyncClient, ASGITransport


@pytest.fixture
async def async_client(authed_app):
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        yield client


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer fake-token"}


class TestSoftCancelSlot:
    @pytest.mark.asyncio
    async def test_delete_booked_slot_soft_cancels(self, async_client, auth_headers, mock_db):
        slot_id = uuid.uuid4()
        patient_id = uuid.uuid4()

        mock_slot = MagicMock()
        mock_slot.id = slot_id
        mock_slot.status = "booked"
        mock_slot.booked_by_patient_id = patient_id
        mock_slot.psychologist_id = uuid.UUID("99999999-9999-9999-9999-999999999999")
        mock_slot.slot_date = date(2026, 6, 1)
        mock_slot.start_time = time(10, 0)

        mock_patient = MagicMock()
        mock_patient.email = "paciente@test.com"
        mock_patient.name = "Ana García"

        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = mock_slot
        mock_db.execute.return_value = mock_result
        mock_db.get.return_value = mock_patient

        with patch("api.calendar_routes.send_booking_cancellation", new=AsyncMock()):
            response = await async_client.delete(
                f"/api/v1/calendar/slots/{slot_id}",
                headers=auth_headers,
            )

        assert response.status_code == 204
        mock_db.delete.assert_not_called()
        assert mock_slot.status == "cancelled"
        assert mock_slot.cancelled_by == "psychologist"
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_available_slot_still_hard_deletes(self, async_client, auth_headers, mock_db):
        slot_id = uuid.uuid4()

        mock_slot = MagicMock()
        mock_slot.id = slot_id
        mock_slot.status = "available"
        mock_slot.booked_by_patient_id = None
        mock_slot.psychologist_id = uuid.UUID("99999999-9999-9999-9999-999999999999")

        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = mock_slot
        mock_db.execute.return_value = mock_result

        response = await async_client.delete(
            f"/api/v1/calendar/slots/{slot_id}",
            headers=auth_headers,
        )

        assert response.status_code == 204
        mock_db.delete.assert_called_once_with(mock_slot)
