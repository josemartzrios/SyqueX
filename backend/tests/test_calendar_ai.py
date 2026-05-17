# backend/tests/test_calendar_ai.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import date, time
from api.calendar_ai import parse_availability, SlotProposal


class TestParseAvailability:
    @pytest.mark.asyncio
    async def test_returns_slots_for_valid_text(self):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text='[{"slot_date":"2026-05-18","start_time":"09:00","duration_minutes":50},{"slot_date":"2026-05-18","start_time":"09:50","duration_minutes":50}]')]

        with patch("api.calendar_ai.AsyncAnthropic") as MockClient:
            instance = MockClient.return_value
            instance.messages.create = AsyncMock(return_value=mock_response)
            result = await parse_availability("Lunes de 9 a 10:40", "2026-05-15")

        assert len(result) == 2
        assert result[0].slot_date == date(2026, 5, 18)
        assert result[0].start_time == time(9, 0)
        assert result[0].duration_minutes == 50

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_claude_returns_empty(self):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="[]")]

        with patch("api.calendar_ai.AsyncAnthropic") as MockClient:
            instance = MockClient.return_value
            instance.messages.create = AsyncMock(return_value=mock_response)
            result = await parse_availability("texto sin fechas", "2026-05-15")

        assert result == []

    @pytest.mark.asyncio
    async def test_parses_json_wrapped_in_markdown_code_fence(self):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text='```json\n[{"slot_date":"2026-05-18","start_time":"07:00","duration_minutes":50}]\n```')]

        with patch("api.calendar_ai.AsyncAnthropic") as MockClient:
            instance = MockClient.return_value
            instance.messages.create = AsyncMock(return_value=mock_response)
            result = await parse_availability("Lunes de 7 a 8", "2026-05-15")

        assert len(result) == 1
        assert result[0].start_time == time(7, 0)

    @pytest.mark.asyncio
    async def test_returns_empty_list_on_invalid_json(self):
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="No puedo determinar las fechas")]

        with patch("api.calendar_ai.AsyncAnthropic") as MockClient:
            instance = MockClient.return_value
            instance.messages.create = AsyncMock(return_value=mock_response)
            result = await parse_availability("texto ambiguo", "2026-05-15")

        assert result == []
