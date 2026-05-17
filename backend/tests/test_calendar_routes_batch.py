# backend/tests/test_calendar_routes_batch.py
import pytest
from unittest.mock import AsyncMock, patch
from datetime import date, time
from api.calendar_ai import SlotProposal
from httpx import AsyncClient, ASGITransport


@pytest.fixture
async def async_client(authed_app):
    async with AsyncClient(transport=ASGITransport(app=authed_app), base_url="http://test") as client:
        yield client


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer fake-token"}


@pytest.fixture
def db_session(mock_db):
    return mock_db


class TestParseAvailabilityEndpoint:
    @pytest.mark.asyncio
    async def test_returns_slots_when_text_parseable(self, async_client, auth_headers):
        mock_slots = [
            SlotProposal(slot_date=date(2026, 5, 18), start_time=time(9, 0), duration_minutes=60),
        ]
        with patch("api.calendar_routes.parse_availability", AsyncMock(return_value=mock_slots)):
            response = await async_client.post(
                "/api/v1/calendar/parse-availability",
                json={"text": "Lunes de 9 a 10", "reference_date": "2026-05-15"},
                headers=auth_headers,
            )
        assert response.status_code == 200
        data = response.json()
        assert len(data["slots"]) == 1
        assert data["slots"][0]["slot_date"] == "2026-05-18"
        assert data["slots"][0]["start_time"].startswith("09:00")

    @pytest.mark.asyncio
    async def test_returns_422_when_no_slots_found(self, async_client, auth_headers):
        with patch("api.calendar_routes.parse_availability", AsyncMock(return_value=[])):
            response = await async_client.post(
                "/api/v1/calendar/parse-availability",
                json={"text": "texto sin fechas", "reference_date": "2026-05-15"},
                headers=auth_headers,
            )
        assert response.status_code == 422
        assert "No se pudieron identificar" in response.json()["detail"]


class TestCreateSlotsBatch:
    @pytest.mark.asyncio
    async def test_creates_slots_and_returns_count(self, async_client, auth_headers, db_session):
        response = await async_client.post(
            "/api/v1/calendar/slots/batch",
            json={"slots": [
                {"slot_date": "2099-01-06", "start_time": "09:00", "duration_minutes": 60},
                {"slot_date": "2099-01-06", "start_time": "10:00", "duration_minutes": 60},
            ]},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["created"] == 2
        assert data["skipped"] == 0

    @pytest.mark.asyncio
    async def test_skips_duplicate_slots(self, async_client, auth_headers, db_session):
        payload = {"slots": [{"slot_date": "2099-02-10", "start_time": "10:00", "duration_minutes": 60}]}
        from sqlalchemy.exc import IntegrityError
        
        # Reset side effect
        db_session.flush.side_effect = [None, IntegrityError(None, None, Exception())]
        
        res1 = await async_client.post("/api/v1/calendar/slots/batch", json=payload, headers=auth_headers)
        res2 = await async_client.post("/api/v1/calendar/slots/batch", json=payload, headers=auth_headers)
        
        assert res2.status_code == 200
        assert res2.json()["skipped"] == 1

    @pytest.mark.asyncio
    async def test_returns_400_for_empty_array(self, async_client, auth_headers):
        response = await async_client.post(
            "/api/v1/calendar/slots/batch",
            json={"slots": []},
            headers=auth_headers,
        )
        assert response.status_code == 400
